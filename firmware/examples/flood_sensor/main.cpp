#include <Wire.h> 

#define private protected
#include "SensorMesh.h"
#undef private

// --- Battery & Charging Hardware Setup ---
#define CHG_PIN 40
#define MAX17048_I2C_ADDR 0x36
#define MAX17048_SOC_REG  0x04

bool getRealChargingStatus() {
  pinMode(CHG_PIN, INPUT_PULLUP);
  return (digitalRead(CHG_PIN) == LOW);
}

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

class MyMesh : public SensorMesh {
public:
  MyMesh(mesh::MainBoard& board, mesh::Radio& radio, mesh::MillisecondClock& ms, mesh::RNG& rng, mesh::RTCClock& rtc, mesh::MeshTables& tables)
      : SensorMesh(board, radio, ms, rng, rtc, tables)
  {
  }

  void injectGateway(const char* hex_id) {
    uint8_t pub_key[32];
    mesh::Utils::fromHex(pub_key, 32, hex_id);
    mesh::Identity gw_id(pub_key);

    ClientInfo* gw_client = acl.putClient(gw_id, PERM_ACL_ADMIN | PERM_RECV_ALERTS_HI | PERM_RECV_ALERTS_LO);
    if (gw_client) {
        Serial.println("[SETUP] Gateway successfully hardcoded into ACL!");
        dirty_contacts_expiry = millis() + 1000; 
    } else {
        Serial.println("[SETUP] Error: Failed to allocate Gateway.");
    }
  }

  void triggerRiverAlert(int level) {
    char msg[64];
    int currentBatt = (int)getRealBatteryPercent(); 
    bool isCharging = getRealChargingStatus();
    
    snprintf(msg, sizeof(msg), "RIVER:%d,BATT:%d,CHG:%d", level, currentBatt, isCharging ? 1 : 0);

    uint8_t gw_pub[32];
    mesh::Utils::fromHex(gw_pub, 32, "7487D9C4E901815F93CA93E307B1ECB6BC359C4D488A64822C787ACA8BB2C8F2");
    ClientInfo* gw_client = acl.getClient(gw_pub, 32);

    if (gw_client) {
      StrHelper::strncpy(river_alert.text, msg, sizeof(river_alert.text));
      river_alert.pri = LOW_PRI_ALERT;
      river_alert.attempt = 0; 
      river_alert.curr_contact_idx = 99; 

      bool in_queue = false;
      for (int i = 0; i < num_alert_tasks; i++) {
        if (alert_tasks[i] == &river_alert) { in_queue = true; break; }
      }
      if (!in_queue && num_alert_tasks < MAX_CONCURRENT_ALERTS) {
        alert_tasks[num_alert_tasks++] = &river_alert;
      }

      sendAlert(gw_client, &river_alert);
      
      Serial.println("[RIVER SENSOR] -> Hardcoded alert sent directly to 74! (Listening for ACK...)");
    } else {
      Serial.println("[RIVER SENSOR] Error: Gateway not found in ACL!");
    }
  }

protected:
  Trigger river_alert;

  void onSensorDataRead() override {
  }

  int querySeriesData(uint32_t start_secs_ago, uint32_t end_secs_ago, MinMaxAvg dest[], int max_num) override {
    return 0; // Indicate no data queried
  }
};

StdRNG fast_rng;
SimpleMeshTables tables;
MyMesh the_mesh(board, radio_driver, *new ArduinoMillis(), fast_rng, rtc_clock, tables);

void halt() { while (1) ; }

void setup() {
  Serial.begin(115200);
  delay(1000);

  board.begin();
#ifdef HAS_EXTERNAL_WATCHDOG
  external_watchdog.begin();
#endif

  if (!radio_init()) { halt(); }
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

  Serial.print("Sensor ID: ");
  mesh::Utils::printHex(Serial, the_mesh.self_id.pub_key, PUB_KEY_SIZE); Serial.println();
  
  // --- Initialize I2C for Battery Reading ---
  Wire.begin(5, 6); // SDA = 5, SCL = 6
  pinMode(CHG_PIN, INPUT);
  
  the_mesh.begin(fs);

  // --- Inject Gateway directly into ACL ---
  the_mesh.injectGateway("7487D9C4E901815F93CA93E307B1ECB6BC359C4D488A64822C787ACA8BB2C8F2");

#if ENABLE_ADVERT_ON_BOOT == 1
  the_mesh.sendSelfAdvertisement(16000, false);
#endif
}

unsigned long lastSendTime = 0;
const unsigned long sendInterval = 15000; 

void loop() {
  rtc_clock.tick();
#ifdef HAS_EXTERNAL_WATCHDOG
  external_watchdog.loop();
#endif

  // --- 15-Second Targeted Alert Cycle ---
  if (millis() - lastSendTime >= sendInterval) {
    lastSendTime = millis();
    int fake_level = random(15, 45); 

    Serial.printf("\n[RIVER SENSOR] Current Level: %dcm\n", fake_level);
    Serial.println("[RIVER SENSOR] Queuing targeted alert to Gateway...");

    the_mesh.triggerRiverAlert(fake_level);
  }

  the_mesh.loop();
}