#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoOTA.h>
#include <HTTPClient.h>
#include <ArduinoJson.h> 
#include <Wire.h> // Added for I2C communication with MAX17048

// --- Wi-Fi & Server Details ---
const char* WIFI_SSID = "a22";
const char* WIFI_PASSWORD = "catandme";
const char* SERVER_URL = "http://10.242.243.15:4000/api/node-update";

unsigned long lastDataSent = 0;
const long interval = 5000; // Send data every 5 seconds

// --- Hardware Pins & Addresses ---
#define CHG_PIN 40
#define MAX17048_I2C_ADDR 0x36
#define MAX17048_SOC_REG  0x04

// --- Helper to Read Battery % from MAX17048 ---
float getRealBatteryPercent() {
  Wire.beginTransmission(MAX17048_I2C_ADDR);
  Wire.write(MAX17048_SOC_REG);
  
  // If the IC isn't responding, return a safe fallback value
  if (Wire.endTransmission(false) != 0) {
    return 100.0; 
  }

  Wire.requestFrom(MAX17048_I2C_ADDR, 2);
  if (Wire.available() == 2) {
    uint8_t msb = Wire.read();
    uint8_t lsb = Wire.read();
    
    // MAX17048 SOC formula: MSB is %, LSB is 1/256 %
    float soc = msb + (lsb / 256.0);
    
    // Clamp the value cleanly between 0 and 100
    if (soc > 100.0) soc = 100.0;
    if (soc < 0.0) soc = 0.0;
    return soc;
  }
  return 100.0; // Fallback
}

// --- Helper to Read Charging Status from BQ24074 ---
bool getRealChargingStatus() {
  // The BQ24074 CHG pin pulls LOW when actively charging
  return (digitalRead(CHG_PIN) == LOW);
}

// --- Helper Function to Build and Send JSON ---
// Notice the new 'bool isCharging' parameter!
void sendNodeUpdate(const char* id, const char* kind, const char* name, double lat, double lng, const char* parent, int battery, bool isCharging, bool isActive, float waterLevel = -1.0) {
  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Connection", "close"); 

  // Create the JSON document
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
  doc["is_charging"] = isCharging; // Now dynamically set!
  doc["is_active"] = isActive;
  doc["rssi"] = -65; // Static fake signal strength for the test
  
  // Only append water level for the sensor node
  if (waterLevel > 0) {
    doc["water_level_cm"] = waterLevel;
  }

  // Convert JSON object into a string
  String jsonPayload;
  serializeJson(doc, jsonPayload);

  // Send the HTTP POST
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
  
  // Initialize I2C (SDA = GPIO5, SCL = GPIO6)
  Wire.begin(5, 6);
  
  // Initialize Charger Pin with internal pullup
  pinMode(CHG_PIN, INPUT_PULLUP);
  
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH); 

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
  // MUST call this in loop to listen for wireless uploads!
  ArduinoOTA.handle();

  // 3. Non-Blocking Timer to send fake data every 5 seconds
  if (millis() - lastDataSent >= interval) {
    lastDataSent = millis();

    if (WiFi.status() == WL_CONNECTED) {
      digitalWrite(LED_BUILTIN, LOW); // Flash LED ON during transmission
      Serial.println("\n--- Sending Mesh Update ---");

      // Generate a fluctuating fake water level around 215cm
      float fakeWaterLevel = 215.0 + (random(0, 50) / 10.0); 

      // Send the nodes sequentially, bottom-up (Sensor -> Routers -> Gateway)
      
      // 1. River Sensor (Routing to West Router - still fake for now)
      sendNodeUpdate("SN-01", "sensor", "River Sensor (South)", 7.2400, 80.5950, "RT-01", 91, false, true, fakeWaterLevel);
      
      // 2. East Router (Backup - Idle - still fake for now)
      sendNodeUpdate("RT-02", "router", "East Router (Backup)", 7.2500, 80.6050, "GW-01", 92, false, true);
      
      // 3. West Router (Primary - Active - still fake for now)
      sendNodeUpdate("RT-01", "router", "West Router (Primary)", 7.2500, 80.5850, "GW-01", 86, false, true);
      
      // 4. Central Gateway (THIS IS NOW USING REAL HARDWARE DATA)
      float realBattery = getRealBatteryPercent();
      bool realCharging = getRealChargingStatus();
      
      Serial.printf("Gateway Hardware -> Battery: %.1f%%, Charging: %s\n", realBattery, realCharging ? "YES" : "NO");
      
      sendNodeUpdate("GW-01", "gateway", "Central Gateway (North)", 7.2600, 80.5950, nullptr, (int)realBattery, realCharging, true);

      digitalWrite(LED_BUILTIN, HIGH); // Turn LED OFF when done
    } else {
      Serial.println("Wi-Fi Disconnected!");
    }
  }
}