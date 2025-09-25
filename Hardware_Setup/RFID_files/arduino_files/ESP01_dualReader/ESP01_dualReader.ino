/*
 * NodeMCU ESP8266 + Dual Frequency RFID Reader (UART)
 * Connects to WiFi, reads card packets (9 bytes: [0x02 ... 0x03]),
 * and uploads Card Type + Card Number to a web server.
 *
 * Wiring:
 *   RFID VCC → NodeMCU 3.3V  (⚠️ NOT 5V, NodeMCU is 3.3V only!)
 *   RFID GND → NodeMCU GND
 *   RFID TX  → NodeMCU RX (GPIO3 / D9)
 *
 *   NOTE: RX only. Module RX pin is not connected.
 */

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>

// ===== WiFi Credentials =====
const char* ssid = "Gana iPhone";
const char* password = "12345679";

// ===== Server Endpoint =====
const char* serverName = "http://10.40.19.130/rfid/rfid.php";

// ===== Reader Unique ID =====
const char* readerID = "REGISTER";  // change per device (e.g., ROOM1, ROOM2...)

// ===== LED Config =====
#define READ_LED_PIN LED_BUILTIN

// ===== Convert bytes to HEX =====
String bytesToHex(byte *data, int length) {
  String result = "";
  for (int i = 0; i < length; i++) {
    if (data[i] < 0x10) result += "0";
    result += String(data[i], HEX);
  }
  return result;
}

void setup() {
  // Start hardware UART (used by RFID module)
  Serial.begin(9600);   // RFID default baud is 9600
  delay(200);

  pinMode(READ_LED_PIN, OUTPUT);
  digitalWrite(READ_LED_PIN, HIGH);

  // Connect WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void loop() {
  // RFID packets are 9 bytes long
  if (Serial.available() >= 9) {
    byte packet[9];
    for (int i = 0; i < 9; i++) packet[i] = Serial.read();

    // Validate packet format
    if (packet[0] == 0x02 && packet[8] == 0x03) {
      byte cardType = packet[2]; // 0x01 = MIFARE 1K, 0x02 = EM4100
      byte cardNum[4];
      for (int i = 0; i < 4; i++) cardNum[i] = packet[i + 3];

      // Convert to HEX string
      String cardHex = bytesToHex(cardNum, 4);

      // Turn LED ON while sending
      digitalWrite(READ_LED_PIN, LOW);

      if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        WiFiClient client;

        // Build URL with ReaderID + CardType + CardNum
        String url = String(serverName) +
                     "?reader=" + readerID +
                     "&type=" + String(cardType, HEX) +
                     "&tag=" + cardHex;

        if (http.begin(client, url)) {
          int httpCode = http.GET();
          http.end();
        }
      }

      // LED OFF after sending
      digitalWrite(READ_LED_PIN, HIGH);
    }
  }

  delay(50);
}
