/*
 * NodeMCU ESP8266 + RDM6300 RFID (Hardware UART version)
 * Auto-booting + runtime config fetch + MQTT publish
 *
 * Wiring:
 *   RDM6300 VCC → NodeMCU 3.3V
 *   RDM6300 GND → NodeMCU GND
 *   RDM6300 TX  → NodeMCU RX (GPIO3 / D9)
 */

#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>   // << added for boot-time config fetch
#include <PubSubClient.h>
#include <rdm6300.h>
#include <ArduinoJson.h>

// ===== WiFi Credentials =====
const char* ssid     = "Adaikalam";
const char* password = "ROOM@1362";

// ===== Server (for boot-time config fetch) =====
const char* serverBase = "http://10.30.9.163:4000";  // <-- change to your Node server

// ===== MQTT Configuration =====
const char* mqtt_server = "10.30.9.163";  // Your broker (PC/LAN IP)
const int   mqtt_port   = 1883;

// ===== Reader Index (unique per device) =====
const int rIndex = 1;   // <-- set a unique number per physical reader

// ===== Runtime-configured IDs (populated from server) =====
String readerID = "REGISTER";   // fallback default
String portal   = "portal1";    // fallback default

// ===== LED Config (NodeMCU builtin LED is active LOW) =====
#define READ_LED_PIN LED_BUILTIN

// ===== MQTT and RFID Setup =====
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
Rdm6300 rdm6300;

// ------------ Utility: LED blink -------------
void blink(int times, int onMs = 150, int offMs = 150) {
  for (int i = 0; i < times; i++) {
    digitalWrite(READ_LED_PIN, LOW);
    delay(onMs);
    digitalWrite(READ_LED_PIN, HIGH);
    delay(offMs);
  }
}

// ------------ WiFi connect with timeout + auto-restart -------------
bool connectWiFiWithTimeout(uint32_t timeoutMs = 20000) {
  Serial.printf("Connecting to WiFi SSID \"%s\" ...\n", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < timeoutMs) {
    delay(250);
    Serial.print(".");
    yield();
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }
  Serial.println("WiFi connect timeout. Auto-restarting...");
  blink(5, 60, 60);
  ESP.restart(); // auto-boot recovery
  return false;  // (never reached)
}

// ------------ Boot-time config fetch (HTTP GET) -------------
bool fetchConfigOnce() {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClient client;
  HTTPClient http;
  String url = String(serverBase) + "/api/reader-config/" + String(rIndex);

  Serial.println("Fetching config: " + url);
  if (!http.begin(client, url)) {
    Serial.println("HTTP begin() failed");
    return false;
  }

  int code = http.GET();
  if (code <= 0) {
    Serial.println("HTTP GET error: " + String(code));
    http.end();
    return false;
  }

  if (code == 200) {
    String payload = http.getString();
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (!err) {
      if (doc.containsKey("readerID")) readerID = String((const char*)doc["readerID"]);
      if (doc.containsKey("portal"))   portal   = String((const char*)doc["portal"]);
      Serial.println("Config OK -> readerID=" + readerID + ", portal=" + portal);
    } else {
      Serial.println("JSON parse failed");
    }
  } else {
    Serial.println("Config GET returned HTTP " + String(code));
  }

  http.end();
  return true;
}

// ------------ MQTT connect / reconnect -------------
void connectToMqtt() {
  mqttClient.setServer(mqtt_server, mqtt_port);

  while (!mqttClient.connected()) {
    Serial.print("MQTT connecting ... ");
    String clientId = "ESP8266-RFID-" + String(rIndex);

    // (Optionally add username/password to connect() if your broker requires it)
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("connected");
      blink(2, 80, 80);
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" -> retry in 3s");
      blink(1, 50, 150);
      delay(3000);
    }
  }
}

void ensureMqtt() {
  if (!mqttClient.connected()) {
    connectToMqtt();
  }
  mqttClient.loop();
}

void setup() {
  pinMode(READ_LED_PIN, OUTPUT);
  digitalWrite(READ_LED_PIN, HIGH);   // off

  Serial.begin(9600);                  // RDM6300 default baud is 9600
  delay(200);

  rdm6300.begin(&Serial);

  // WiFi with timeout + auto restart if it can't connect
  connectWiFiWithTimeout(20000);

  // Boot-time config fetch (non-fatal if server is down)
  fetchConfigOnce();

  // MQTT
  connectToMqtt();

  Serial.println("Boot complete. Waiting for RFID taps...");
}

void loop() {
  // Keep WiFi healthy
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi dropped. Reconnecting...");
    connectWiFiWithTimeout(20000);
    // Re-fetch config when WiFi returns (optional)
    fetchConfigOnce();
  }

  // Keep MQTT healthy
  ensureMqtt();

  // Read RFID
  if (rdm6300.get_new_tag_id()) {
    unsigned long tag = rdm6300.get_tag_id();

    // LED ON while sending (active LOW)
    digitalWrite(READ_LED_PIN, LOW);

    // Build topic and payload
    String topic = "rfid/" + portal;

    String tagHex = String(tag, HEX);
    tagHex.toUpperCase();

    StaticJsonDocument<200> doc;
    doc["portal"]       = portal;
    doc["rfid_card_id"] = tagHex;
    doc["label"]        = readerID;

    String payload;
    serializeJson(doc, payload);

    // Logs
    Serial.println("=== RFID TAP DETECTED ===");
    Serial.println("Topic:   " + topic);
    Serial.println("Payload: " + payload);
    Serial.println("=========================");

    // Publish
    bool ok = mqttClient.publish(topic.c_str(), payload.c_str());
    if (ok) {
      Serial.println("✅ MQTT published successfully!");
    } else {
      Serial.println("❌ MQTT publish failed!");
    }

    // LED OFF after sending
    digitalWrite(READ_LED_PIN, HIGH);
  }

  delay(80);
  yield(); // keep WDT happy
}
