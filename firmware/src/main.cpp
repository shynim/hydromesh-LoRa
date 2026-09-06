#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoOTA.h>
#include <HTTPClient.h>
#include <ArduinoJson.h> 

// --- Wi-Fi & Server Details ---
const char* WIFI_SSID = "a22";
const char* WIFI_PASSWORD = "catandme";
const char* SERVER_URL = "http://10.107.167.15:4000/api/node-update";

unsigned long lastDataSent = 0;
const long interval = 5000; // Send data every 5 seconds

// --- Helper Function to Build and Send JSON ---
void sendNodeUpdate(const char* id, const char* kind, const char* name, double lat, double lng, const char* parent, int battery, bool isActive, float waterLevel = -1.0) {
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
  doc["is_charging"] = false;
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
      
      // 1. River Sensor (Routing to West Router)
      sendNodeUpdate("SN-01", "sensor", "River Sensor (South)", 7.2400, 80.5950, "RT-01", 91, true, fakeWaterLevel);
      
      // 2. East Router (Backup - Idle)
      sendNodeUpdate("RT-02", "router", "East Router (Backup)", 7.2500, 80.6050, "GW-01", 92, true);
      
      // 3. West Router (Primary - Active)
      sendNodeUpdate("RT-01", "router", "West Router (Primary)", 7.2500, 80.5850, "GW-01", 86, true);
      
      // 4. Central Gateway
      sendNodeUpdate("GW-01", "gateway", "Central Gateway (North)", 7.2600, 80.5950, nullptr, 100, true);

      digitalWrite(LED_BUILTIN, HIGH); // Turn LED OFF when done
    } else {
      Serial.println("Wi-Fi Disconnected!");
    }
  }
}