#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoOTA.h>
#include <HTTPClient.h>
#include <ArduinoJson.h> 
#include <Wire.h> 
#include <Mesh.h>
#include "MyMesh.h"

// --- Wi-Fi & Server Details ---
const char* WIFI_SSID = "a22";
const char* WIFI_PASSWORD = "catandme";
const char* SERVER_URL = "http://10.249.20.15:4000/api/node-update";

unsigned long lastDataSent = 0;
const long interval = 5000;

// --- Live Sensor Data Storage ---
float liveWaterLevel = -1.0; 
String liveSensorParent = "GW-01"; 
int liveSensorBattery = 100; 
bool liveSensorCharging = false; 

// --- Hardware Pins & Addresses ---
#define CHG_PIN 40
#define MAX17048_I2C_ADDR 0x36
#define MAX17048_SOC_REG  0x04

// --- MeshCore Instances ---
StdRNG fast_rng;
SimpleMeshTables tables;
MyMesh the_mesh(board, radio_driver, *new ArduinoMillis(), fast_rng, rtc_clock, tables);

void halt() {
  while (1) ;
}

static char command[160];

// --- Helper to Read Battery % from MAX17048 ---
float getRealBatteryPercent() {
  Wire.beginTransmission(MAX17048_I2C_ADDR);
  Wire.write(MAX17048_SOC_REG);
  
  if (Wire.endTransmission(false) != 0) {
    return 100.0; 
  }

  Wire.requestFrom(MAX17048_I2C_ADDR, 2);
  if (Wire.available() == 2) {
    uint8_t msb = Wire.read();
    uint8_t lsb = Wire.read();
    
    float soc = msb + (lsb / 256.0);
    if (soc > 100.0) soc = 100.0;
    if (soc < 0.0) soc = 0.0;
    return soc;
  }
  return 100.0;
}

// --- Helper to Read Charging Status from BQ24074 ---
bool getRealChargingStatus() {
  return (digitalRead(CHG_PIN) == LOW);
}

// --- Helper Function to Build and Send JSON ---
void sendNodeUpdate(const char* id, const char* kind, const char* name, double lat, double lng, const char* parent, int battery, bool isCharging, bool isActive, float waterLevel = -1.0) {
  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Connection", "close"); 

  JsonDocument doc;
  doc["node_id"] = id;
  doc["kind"] = kind;
  doc["name"] = name;
  doc["lat"] = lat;
  doc["lng"] = lng;
  
  if (parent == nullptr) {
    doc["parent_node_id"] = nullptr;
  } else {
    doc["parent_node_id"] = parent;
  }
  
  doc["battery_percent"] = battery;
  doc["is_charging"] = isCharging;
  doc["is_active"] = isActive;
  doc["rssi"] = -65; 
  
  if (waterLevel > 0) {
    doc["water_level_cm"] = waterLevel;
  }

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  int httpResponseCode = http.POST(jsonPayload);
  if (httpResponseCode > 0) {
    Serial.printf("Sent %s - HTTP Code: %d\n", id, httpResponseCode);
  } else {
    Serial.printf("Error sending %s - Code: %d\n", id, httpResponseCode);
  }
  
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Initialize board and radio for MeshCore
  board.begin();

  if (!radio_init()) {
    Serial.println("Radio init failed!");
    halt();
  }

  fast_rng.begin(radio_driver.getRngSeed());

  FILESYSTEM* fs;
  SPIFFS.begin(true);
  fs = &SPIFFS;
  IdentityStore store(SPIFFS, "/identity");

  if (!store.load("_main", the_mesh.self_id)) {
    the_mesh.self_id = radio_new_identity();   
    int count = 0;
    while (count < 10 && (the_mesh.self_id.pub_key[0] == 0x00 || the_mesh.self_id.pub_key[0] == 0xFF)) {  
      the_mesh.self_id = radio_new_identity(); count++;
    }
    store.save("_main", the_mesh.self_id);
  }

  Serial.print("Gateway ID: ");
  mesh::Utils::printHex(Serial, the_mesh.self_id.pub_key, PUB_KEY_SIZE); Serial.println();

  command[0] = 0;

  // I2C (SDA = GPIO5, SCL = GPIO6)
  Wire.begin(5, 6);
  
  pinMode(CHG_PIN, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH); 

  the_mesh.begin(fs);

  // Inject Sensor ID so Gateway trusts packets from Node 42
  the_mesh.injectSensor("428269A0B87B76D6871B2AEBABB988D1F50D0994CB728C3E64F337DB975E7D5F");

  // 1. Clean Wi-Fi Connection
  Serial.print("Connecting to Wi-Fi");
  WiFi.mode(WIFI_STA); 
  WiFi.disconnect(true); 
  delay(500); 

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(LED_BUILTIN, LOW);  
    delay(250);
    digitalWrite(LED_BUILTIN, HIGH); 
    delay(250);
    Serial.print(".");
  }
  
  Serial.println("\nConnected! IP: " + WiFi.localIP().toString());
  
  digitalWrite(LED_BUILTIN, LOW);
  delay(2000);
  digitalWrite(LED_BUILTIN, HIGH); 

  // 2. Configure and Start OTA
  ArduinoOTA.setHostname("HydroMesh-Gateway");
  ArduinoOTA.onStart([]() { Serial.println("\nOTA Update Started..."); });
  ArduinoOTA.onEnd([]() { Serial.println("\nOTA Update Finished!"); });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("Progress: %u%%\r", (progress / (total / 100)));
  });
  ArduinoOTA.onError([](ota_error_t error) { Serial.printf("Error[%u]\n", error); });

  ArduinoOTA.begin();
  Serial.println("OTA Ready. You can now upload wirelessly!");
}

void loop() {
  // MUST call this to listen for wireless uploads & handle incoming mesh packets!
  ArduinoOTA.handle();
  the_mesh.loop();
  rtc_clock.tick();

  // Non-Blocking Timer to send data to dashboard every 5 seconds
  if (millis() - lastDataSent >= interval) {
    lastDataSent = millis();

    if (WiFi.status() == WL_CONNECTED) {
      digitalWrite(LED_BUILTIN, LOW); // Flash LED ON during transmission
      Serial.println("\n--- Sending Live Mesh Update ---");

      // 1. River Sensor (Gets the DYNAMIC parent variable!)
      // 1. River Sensor (Now with DYNAMIC parent AND DYNAMIC battery!)
      sendNodeUpdate("SN-01", "sensor", "River Sensor (South)", 7.2400, 80.5950, liveSensorParent.c_str(), liveSensorBattery, liveSensorCharging, true, liveWaterLevel);      
      
      // 2. East Router (Backup - Static for now)
      sendNodeUpdate("RT-02", "router", "East Router (Backup)", 7.2500, 80.6050, "GW-01", 92, false, true);
      
      // 3. West Router (Primary - Static for now)
      sendNodeUpdate("RT-01", "router", "West Router (Primary)", 7.2500, 80.5850, "GW-01", 86, false, true);
      
      // 4. Central Gateway (Top of the chain, so parent is nullptr!)
      float realBattery = getRealBatteryPercent();
      bool realCharging = getRealChargingStatus();
      
      Serial.printf("Gateway Hardware -> Battery: %.1f%%, Charging: %s | Live Water Level: %.1fcm\n", realBattery, realCharging ? "YES" : "NO", liveWaterLevel);
      
      sendNodeUpdate("GW-01", "gateway", "Central Gateway (North)", 7.2600, 80.5950, nullptr, (int)realBattery, realCharging, true);

      digitalWrite(LED_BUILTIN, HIGH); // Turn LED OFF when done
    } else {
      Serial.println("Wi-Fi Disconnected!");
    }
  }
}