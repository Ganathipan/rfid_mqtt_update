#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

/*
  Serial-controlled Robotic Arm (Arduino + PCA9685)
  - Control joints by sending angles over Serial (115200 baud, Newline).
  - Commands:
      b 90      -> base to 90 deg
      s 120     -> shoulder to 120
      e 45      -> elbow to 45
      w 150     -> wrist to 150
      g 80      -> gripper to 80
    Short forms also work: b=90, s120, elbow 45, etc.
    Utilities: home, read, help

  Wiring (typical):
    PCA9685: VCC->5V, GND->GND, SDA->A4, SCL->A5
    Servo power V+ from separate 5–6V supply (high current). Tie grounds!
    Channels: 0=Base, 1=Shoulder, 2=Elbow, 3=Wrist, 4=Gripper
*/

Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(0x40);

// ===== Servo timing & smoothing =====
#define SERVO_FREQ 50      // Hz
int SERVOMIN = 150;        // ~0.5 ms (PCA9685 counts)
int SERVOMAX = 600;        // ~2.5 ms

// Soft moves: step size (deg) every MOVE_DELAY_MS
int MOVE_STEP_DEG = 2;     // degrees per step
int MOVE_DELAY_MS = 15;    // ms between steps

// ===== Joint model =====
struct Joint {
  const char* name;
  char key;         // single-letter command
  uint8_t ch;       // PCA9685 channel
  float minDeg;     // safety limits
  float maxDeg;
  float cur;        // current angle
  float tgt;        // target angle
};

// Channels: 0=Base,1=Shoulder,2=Elbow,3=Wrist,4=Gripper
Joint joints[] = {
  {"base",     'b', 0, 0, 180, 90, 90},
  {"shoulder", 's', 1, 0, 180, 90, 90},
  {"elbow",    'e', 2,  0, 180, 90, 90},
  {"wrist",    'w', 3, 0, 180, 90, 90},
  {"gripper",  'g', 4, 0, 180, 90, 90}
};
const int JOINTS_COUNT = sizeof(joints)/sizeof(joints[0]);

// ===== Timekeeping =====
unsigned long lastStepMs = 0;

// ===== Helpers =====
int angleToCount(float ang) {
  ang = constrain(ang, 0, 180);
  long c = map((long)ang, 0, 180, (long)SERVOMIN, (long)SERVOMAX);
  return (int)c;
}
void writeServo(uint8_t ch, float ang) {
  pwm.setPWM(ch, 0, angleToCount(ang));
}
float clampToLimits(int idx, float a) {
  return constrain(a, joints[idx].minDeg, joints[idx].maxDeg);
}
float stepToward(float cur, float tgt, int stepDeg) {
  if (fabs(tgt - cur) <= stepDeg) return tgt;
  return cur + (tgt > cur ? stepDeg : -stepDeg);
}
void applyAllImmediate() {
  for (int i=0;i<JOINTS_COUNT;i++) {
    joints[i].cur = clampToLimits(i, joints[i].tgt);
    writeServo(joints[i].ch, joints[i].cur);
  }
}
void printAngles() {
  Serial.println(F("Current angles:"));
  for (int i=0;i<JOINTS_COUNT;i++) {
    Serial.print(F("  "));
    Serial.print(joints[i].name);
    Serial.print(F(": "));
    Serial.println(joints[i].cur, 1);
  }
}
void printHelp() {
  Serial.println(F("Commands (end each with Newline):"));
  Serial.println(F("  b 90      -> base to 90 deg   (also: b=90, b90, base 90)"));
  Serial.println(F("  s 120     -> shoulder to 120  (s=120, shoulder 120)"));
  Serial.println(F("  e 45      -> elbow 45"));
  Serial.println(F("  w 150     -> wrist 150"));
  Serial.println(F("  g 80      -> gripper 80"));
  Serial.println(F("Utilities: home | read | help"));
  Serial.println(F("Soft moves: step="));
  Serial.print (MOVE_STEP_DEG);
  Serial.print (F(" deg, delay="));
  Serial.print (MOVE_DELAY_MS);
  Serial.println(F(" ms"));
}
int findJointByToken(const String& tok) {
  // Match by first char or full name
  if (tok.length() == 0) return -1;
  char k = tok.charAt(0);
  for (int i=0;i<JOINTS_COUNT;i++) {
    if (k == joints[i].key) return i;
    if (tok.equals(joints[i].name)) return i;
  }
  return -1;
}
bool parseIntInString(const String& s, int &valOut) {
  // Extract first signed integer appearing in the string
  bool neg = false, found = false;
  long v = 0;
  for (uint16_t i=0;i<s.length();i++) {
    char c = s.charAt(i);
    if (!found) {
      if (c == '-' || c == '+') { neg = (c=='-'); found = true; }
      else if (isDigit(c)) { found = true; v = c - '0'; }
    } else {
      if (isDigit(c)) { v = v*10 + (c - '0'); }
      else break;
    }
  }
  if (!found) return false;
  if (neg) v = -v;
  valOut = (int)v;
  return true;
}

// ===== Serial line buffer =====
String line;

void setup() {
  Serial.begin(115200);
  pwm.begin();
  pwm.setPWMFreq(SERVO_FREQ);
  delay(10);

  // Home all joints
  applyAllImmediate();

  Serial.println(F("Serial Arm Controller ready."));
  Serial.println(F("Type 'help' for commands."));
}

void loop() {
  // ---------- Handle serial input (line-based) ----------
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;       // ignore CR
    if (c == '\n') {
      line.trim();
      line.toLowerCase();
      if (line.length() > 0) {
        // Normalize delimiters
        for (uint16_t i=0;i<line.length();i++) {
          char d = line.charAt(i);
          if (d == '=' || d == ',' || d == '\t') line.setCharAt(i, ' ');
        }

        if (line == F("help")) {
          printHelp();
        } else if (line == F("read")) {
          printAngles();
        } else if (line == F("home")) {
          for (int i=0;i<JOINTS_COUNT;i++) joints[i].tgt = 90;
          Serial.println(F("Homing all joints to 90 deg..."));
        } else {
          // Tokenize: first word = joint, rest contains number
          int sp = line.indexOf(' ');
          String tok = (sp == -1) ? line : line.substring(0, sp);
          String rest = (sp == -1) ? ""   : line.substring(sp+1);

          // Allow forms like "b90" or "s=120" without space
          if (sp == -1 && line.length() >= 2 && isAlpha(line.charAt(0)) && isDigit(line.charAt(1))) {
            tok   = line.substring(0,1);      // first letter
            rest  = line.substring(1);        // the number part
          }

          int idx = findJointByToken(tok);
          int ang;
          if (idx >= 0 && parseIntInString(rest, ang)) {
            float target = clampToLimits(idx, (float)ang);
            joints[idx].tgt = target;
            Serial.print(F("Set "));
            Serial.print(joints[idx].name);
            Serial.print(F(" -> "));
            Serial.print(target, 1);
            Serial.println(F(" deg"));
          } else {
            Serial.println(F("Parse error. Type 'help' for usage."));
          }
        }
      }
      line = ""; // reset buffer
    } else {
      // accumulate
      if (line.length() < 64) line += c; // prevent huge strings on UNO
    }
  }

  // ---------- Soft-move stepping ----------
  if (millis() - lastStepMs >= (unsigned long)MOVE_DELAY_MS) {
    lastStepMs = millis();
    for (int i=0;i<JOINTS_COUNT;i++) {
      float target = clampToLimits(i, joints[i].tgt);
      float next   = stepToward(joints[i].cur, target, MOVE_STEP_DEG);
      if (next != joints[i].cur) {
        joints[i].cur = next;
        writeServo(joints[i].ch, joints[i].cur);
      }
    }
  }
}
