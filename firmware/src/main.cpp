#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoOTA.h>
#include <HTTPClient.h>

// --- Wi-Fi & Server Details ---
// const char* WIFI_SSID = "Rathu Leena";
// const char* WIFI_PASSWORD = "3c60ECFD";
// const char* SERVER_URL = "http://192.168.8.174.XXX:4000/api/node-update";

// --- Wi-Fi & Server Details ---
const char* WIFI_SSID = "a22";
const char* WIFI_PASSWORD = "catandme";
const char* SERVER_URL = "http://10.107.167.15:4000/api/node-update";

unsigned long lastDataSent = 0;
const long interval = 5000; // Send data every 5 seconds

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
      Serial.println("Sending fake packet to Dashboard...");
      
      HTTPClient http;
      http.begin(SERVER_URL);
      http.setTimeout(2000);
      http.addHeader("Content-Type", "application/json");
      http.addHeader("Connection", "close"); // <-- ADD THIS LINE

      // Generate a fluctuating fake water level (e.g., between 250.0 and 260.0)
      float fakeWaterLevel = 250.0 + (random(0, 100) / 10.0); 

      // Dummy payload with changing water level
      String jsonPayload = "{\"node_id\":\"SN-FAKE\",\"kind\":\"sensor\",\"lat\":7.2906,\"lng\":80.6337,\"battery_percent\":85,\"water_level_cm\":" + String(fakeWaterLevel) + ",\"is_active\":true}";
      
      int httpResponseCode = http.POST(jsonPayload);
      Serial.println("Dashboard HTTP Response: " + String(httpResponseCode));
      http.end();
      
      digitalWrite(LED_BUILTIN, HIGH); // Turn LED OFF
    }
  }
}

int main(){
  setup();
  while(1) {
    loop();
  }
}

