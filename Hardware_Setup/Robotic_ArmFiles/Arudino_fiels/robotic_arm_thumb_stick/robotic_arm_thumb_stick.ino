#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

/*
  Robotic Arm + 2 Joysticks + PCA9685 (soft moves with step & delay)

  Joystick mapping:
    J1:  X(A0)=Base,     Y(A1)=Shoulder,  SW(D2)=Gripper toggle (Grip/Release)
    J2:  X(A2)=Elbow,    Y(A3)=Wrist,     SW(D3)=Fine/Coarse toggle

  Behavior:
    - Axes map to TARGET angles for each joint.
    - Every MOVE_DELAY_MS, each joint moves up to MOVE_STEP_DEG toward its target.
    - D3 toggles fine/coarse by switching the step size for ALL joints.
    - D2 toggles the gripper between GRIP_OPEN and GRIP_CLOSE.

  Power:
    - Use a separate 5–6 V supply for servo V+ (ample current), tie GNDs together.
*/

Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(0x40);

// ======================= User-tunable parameters =======================
// ======================= Starting angles (user-tunable) =======================
#define START_BASE     45
#define START_SHOULDER 120
#define START_ELBOW    40
#define START_WRIST    110
#define START_GRIP     115 // default open

// PWM/servo timing
#define SERVO_FREQ 50             // Hz (typical for analog servos)
int SERVOMIN = 150;               // PCA9685 counts (~0.5 ms)
int SERVOMAX = 600;               // PCA9685 counts (~2.5 ms)

// Channels (0..15)
const int CH_BASE     = 0;
const int CH_SHOULDER = 1;
const int CH_ELBOW    = 2;
const int CH_WRIST    = 3;
const int CH_GRIPPER  = 4;

// Joystick pins
const int J1_X = A1; // Sholder
const int J1_Y = A0; // Base
const int J2_X = A2; // Elbow
const int J2_Y = A3; // Wrist
const int J1_SW = 2; // Grip/Release toggle (active LOW)
const int J2_SW = 3; // Fine/Coarse toggle (active LOW)

// Dead-zone (ADC 0..1023). 512 = center
const int DEADZONE = 60;

// Angle limits (protect mechanics)
float baseMin =  0, baseMax = 90;
float shoulderMin = 75, shoulderMax = 140;
float elbowMin =   40, elbowMax = 80;
float wristMin =  30, wristMax = 180;

// Gripper angles (positional gripper)
float GRIP_OPEN  = 180;   // tune to your mechanism
float GRIP_CLOSE =  90;   // tune to your mechanism

// ---------- Soft-move settings (requested feature) ----------
int MOVE_STEP_DEG_COARSE = 1.5;   // degrees per update (coarse)
int MOVE_STEP_DEG_FINE   = 0.5;   // degrees per update (fine)
int MOVE_DELAY_MS        = 15;  // delay between steps (smoother if larger)

// Inversion flags (flip axis direction if needed)
bool INVERT_BASE_AXIS     = true;
bool INVERT_SHOULDER_AXIS = false;
bool INVERT_ELBOW_AXIS    = false;
bool INVERT_WRIST_AXIS    = false;

// Optional axis swap flags (use only if wiring doesn’t match)
bool SWAP_J1_AXES = false; // swap Base/Shoulder axes on J1 if needed
bool SWAP_J2_AXES = false; // swap Elbow/Wrist axes on J2 if needed

// ======================= Internal state =======================
bool fineMode = false;     // toggled by D3
bool gripClosed = false;   // toggled by D2

// Current and target angles (deg)
float curBase=START_BASE, curShoulder=START_SHOULDER, curElbow=START_ELBOW, curWrist=START_WRIST, curGrip=START_GRIP;
float tgtBase=START_BASE, tgtShoulder=START_SHOULDER, tgtElbow=START_ELBOW, tgtWrist=START_WRIST, tgtGrip=START_GRIP;

// Debounce/edge
int lastJ1Sw = HIGH, lastJ2Sw = HIGH;

// Median filter buffers
int medBufA0[5], medBufA1[5], medBufA2[5], medBufA3[5];

// Timing for step updates
unsigned long lastStepMs = 0;

// ======================= Helpers =======================
int angleToCount(float ang) {
  ang = constrain(ang, 0, 180);
  long c = map((long)ang, 0, 180, (long)SERVOMIN, (long)SERVOMAX);
  return (int)c;
}
void writeServo(int ch, float ang) {
  pwm.setPWM(ch, 0, angleToCount(ang));
}

int readBtn(int pin) { return digitalRead(pin); }

// tiny insertion sort, return median of 5
int median5(int buf[5], int pin) {
  for (int i=0;i<5;i++){ buf[i]=analogRead(pin); delayMicroseconds(200); }
  for (int i=0;i<5;i++) for (int j=i+1;j<5;j++) if (buf[j]<buf[i]) {int t=buf[i]; buf[i]=buf[j]; buf[j]=t;}
  return buf[2];
}

float mapStickToAngle(int raw, float amin, float amax, bool invert=false) {
  int d = raw - 512;
  if (abs(d) < DEADZONE) return (amin + amax) * 0.5f; // center → middle
  long ang;
  if (!invert) {
    ang = map(raw, 0, 1023, (long)amin, (long)amax);
  } else {
    ang = map(raw, 0, 1023, (long)amax, (long)amin);
  }
  return constrain((float)ang, amin, amax);
}

// move current angle towards target by <= step deg
float stepToward(float current, float target, int stepDeg) {
  if (fabs(target - current) <= stepDeg) return target;
  return current + (target > current ? stepDeg : -stepDeg);
}

void centerAll() {
  curBase=START_BASE; curShoulder=START_SHOULDER; curElbow=START_ELBOW; curWrist=START_WRIST; curGrip=START_GRIP;
  writeServo(CH_BASE,     curBase);
  writeServo(CH_SHOULDER, curShoulder);
  writeServo(CH_ELBOW,    curElbow);
  writeServo(CH_WRIST,    curWrist);
  writeServo(CH_GRIPPER,  curGrip);
}

// ======================= Setup/Loop =======================
void setup() {
  Serial.begin(115200);
  pinMode(J1_SW, INPUT_PULLUP);
  pinMode(J2_SW, INPUT_PULLUP);

  pwm.begin();
  pwm.setPWMFreq(SERVO_FREQ);
  delay(10);

  centerAll();

  Serial.println(F("Arm joystick control (soft moves) ready."));
  Serial.println(F("D2=Grip/Release  |  D3=Fine/Coarse step toggle"));
}

void loop() {
  // ---------- Read joysticks with median filtering ----------
  int j1x = median5(medBufA0, J1_X);
  int j1y = median5(medBufA1, J1_Y);
  int j2x = median5(medBufA2, J2_X);
  int j2y = median5(medBufA3, J2_Y);

  if (SWAP_J1_AXES) { int t=j1x; j1x=j1y; j1y=t; }
  if (SWAP_J2_AXES) { int t=j2x; j2x=j2y; j2y=t; }

  // ---------- Map axes → TARGET angles ----------
  tgtBase     = mapStickToAngle(j1x, baseMin,     baseMax,     INVERT_BASE_AXIS);
  tgtShoulder = mapStickToAngle(j1y, shoulderMin, shoulderMax, INVERT_SHOULDER_AXIS);
  tgtElbow    = mapStickToAngle(j2x, elbowMin,    elbowMax,    INVERT_ELBOW_AXIS);
  tgtWrist    = mapStickToAngle(j2y, wristMin,    wristMax,    INVERT_WRIST_AXIS);

  // ---------- Buttons (edge-detect) ----------
  int bGrip  = readBtn(J1_SW); // D2
  int bFine  = readBtn(J2_SW); // D3

  // Grip/Release on D2 falling edge
  if (lastJ1Sw == HIGH && bGrip == LOW) {
    gripClosed = !gripClosed;
    tgtGrip = gripClosed ? GRIP_CLOSE : GRIP_OPEN;
    // optional: print state
    // Serial.println(gripClosed ? F("Grip: CLOSE") : F("Grip: OPEN"));
  }
  lastJ1Sw = bGrip;

  // Fine/Coarse toggle on D3 falling edge
  if (lastJ2Sw == HIGH && bFine == LOW) {
    fineMode = !fineMode;
    // Serial.print(F("Mode: ")); Serial.println(fineMode ? F("FINE") : F("COARSE"));
  }
  lastJ2Sw = bFine;

  // ---------- Soft move update (common step & delay) ----------
  if (millis() - lastStepMs >= (unsigned long)MOVE_DELAY_MS) {
    lastStepMs = millis();
    int stepDeg = fineMode ? MOVE_STEP_DEG_FINE : MOVE_STEP_DEG_COARSE;

    // Step each joint toward its target
    curBase     = stepToward(curBase,     constrain(tgtBase,     baseMin,     baseMax),     stepDeg);
    curShoulder = stepToward(curShoulder, constrain(tgtShoulder, shoulderMin, shoulderMax), stepDeg);
    curElbow    = stepToward(curElbow,    constrain(tgtElbow,    elbowMin,    elbowMax),    stepDeg);
    curWrist    = stepToward(curWrist,    constrain(tgtWrist,    wristMin,    wristMax),    stepDeg);
    curGrip     = stepToward(curGrip,     constrain(tgtGrip,     GRIP_CLOSE,  GRIP_OPEN),   stepDeg);

    // Write outputs
    writeServo(CH_BASE,     curBase);
    writeServo(CH_SHOULDER, curShoulder);
    writeServo(CH_ELBOW,    curElbow);
    writeServo(CH_WRIST,    curWrist);
    writeServo(CH_GRIPPER,  curGrip);
  }

  // Small idle delay (ADC settle / CPU relief)
  delay(2);
}
