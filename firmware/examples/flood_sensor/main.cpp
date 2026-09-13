// --- THE C++ HACK ---
// This temporarily changes "private" to "protected" while parsing the header.
// It allows our MyMesh class to access the internal 'acl' directly without modifying the library!
#define private protected
#include "SensorMesh.h"
#undef private

#ifdef DISPLAY_CLASS
  #include "UITask.h"
  static UITask ui_task(display);
#endif

class MyMesh : public SensorMesh {
public:
  MyMesh(mesh::MainBoard& board, mesh::Radio& radio, mesh::MillisecondClock& ms, mesh::RNG& rng, mesh::RTCClock& rtc, mesh::MeshTables& tables)
      : SensorMesh(board, radio, ms, rng, rtc, tables), 
        battery_data(12*24, 5*60) 
  {
  }

  // Directly inject the Gateway into the internal ACL table
  void injectGateway(const char* hex_id) {
    uint8_t pub_key[32];
    mesh::Utils::fromHex(pub_key, 32, hex_id);
    mesh::Identity gw_id(pub_key);

    // Because of our hack, 'acl' is now accessible! putClient natively forces creation.
    ClientInfo* gw_client = acl.putClient(gw_id, PERM_ACL_ADMIN | PERM_RECV_ALERTS_HI | PERM_RECV_ALERTS_LO);
    if (gw_client) {
        Serial.println("[SETUP] Gateway successfully hardcoded into ACL!");
        dirty_contacts_expiry = millis() + 1000; // Tells MeshCore to save the new contact to flash memory
    } else {
        Serial.println("[SETUP] Error: Failed to allocate Gateway.");
    }
  }

  // Helper method to push to MeshCore's built-in alert queue
  void triggerRiverAlert(int level) {
    alertIf(false, river_alert, HIGH_PRI_ALERT, ""); // Reset the trigger state
    char msg[64];
    snprintf(msg, sizeof(msg), "RIVER_LEVEL:%d", level);
    alertIf(true, river_alert, HIGH_PRI_ALERT, msg); // Fire the new alert
  }

protected:
  // Added river_alert to the existing triggers
  Trigger low_batt, critical_batt, river_alert;
  TimeSeriesData  battery_data;

  void onSensorDataRead() override {
    float batt_voltage = getVoltage(TELEM_CHANNEL_SELF);
    battery_data.recordData(getRTCClock(), batt_voltage);   
    alertIf(batt_voltage < 3.4f, critical_batt, HIGH_PRI_ALERT, "Battery is critical!");
    alertIf(batt_voltage < 3.6f, low_batt, LOW_PRI_ALERT, "Battery is low");
  }

  int querySeriesData(uint32_t start_secs_ago, uint32_t end_secs_ago, MinMaxAvg dest[], int max_num) override {
    battery_data.calcMinMaxAvg(getRTCClock(), start_secs_ago, end_secs_ago, &dest[0], TELEM_CHANNEL_SELF, LPP_VOLTAGE);
    return 1;
  }

  bool handleCustomCommand(uint32_t sender_timestamp, char* command, char* reply) override {
    if (strcmp(command, "magic") == 0) {    
      strcpy(reply, "**Magic now done**");
      return true;   
    }
    return false;  
  }
};

StdRNG fast_rng;
SimpleMeshTables tables;

MyMesh the_mesh(board, radio_driver, *new ArduinoMillis(), fast_rng, rtc_clock, tables);

void halt() { while (1) ; }

static char command[160];

void setup() {
  Serial.begin(115200);
  delay(1000);

  board.begin();
#ifdef HAS_EXTERNAL_WATCHDOG
  external_watchdog.begin();
#endif

#ifdef DISPLAY_CLASS
  if (display.begin()) {
    display.startFrame();
    display.print("Please wait...");
    display.endFrame();
  }
#endif

  if (!radio_init()) { halt(); }
  fast_rng.begin(radio_driver.getRngSeed());

  FILESYSTEM* fs;
#if defined(NRF52_PLATFORM) || defined(STM32_PLATFORM)
  InternalFS.begin();
  fs = &InternalFS;
  IdentityStore store(InternalFS, "");
#elif defined(ESP32)
  SPIFFS.begin(true);
  fs = &SPIFFS;
  IdentityStore store(SPIFFS, "/identity");
#elif defined(RP2040_PLATFORM)
  LittleFS.begin();
  fs = &LittleFS;
  IdentityStore store(LittleFS, "/identity");
  store.begin();
#else
  #error "need to define filesystem"
#endif

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

  command[0] = 0;
  sensors.begin();
  the_mesh.begin(fs);

  // --- Inject Gateway directly into ACL ---
  the_mesh.injectGateway("7487D9C4E901815F93CA93E307B1ECB6BC359C4D488A64822C787ACA8BB2C8F2");

#ifdef DISPLAY_CLASS
  ui_task.begin(the_mesh.getNodePrefs(), FIRMWARE_BUILD_DATE, FIRMWARE_VERSION);
#endif

#if ENABLE_ADVERT_ON_BOOT == 1
  the_mesh.sendSelfAdvertisement(16000, false);
#endif
}

unsigned long lastSendTime = 0;
const unsigned long sendInterval = 30000; 

void loop() {
  int len = strlen(command);
  while (Serial.available() && len < sizeof(command)-1) {
    char c = Serial.read();
    if (c != '\n') {
      command[len++] = c;
      command[len] = 0;
    }
    Serial.print(c);
  }
  if (len == sizeof(command)-1) { command[sizeof(command)-1] = '\r'; }

  if (len > 0 && command[len - 1] == '\r') {  
    command[len - 1] = 0;  
    char reply[160];
    the_mesh.handleCommand(0, command, reply);  
    if (reply[0]) { Serial.print("  -> "); Serial.println(reply); }
    command[0] = 0;  
  }

  the_mesh.loop();
  sensors.loop();
#ifdef DISPLAY_CLASS
  ui_task.loop();
#endif
  rtc_clock.tick();
#ifdef HAS_EXTERNAL_WATCHDOG
  external_watchdog.loop();
#endif

  // --- 30-Second Targeted Alert Cycle ---
  if (millis() - lastSendTime >= sendInterval) {
    lastSendTime = millis();
    int fake_level = random(15, 45); 

    Serial.printf("\n[RIVER SENSOR] Current Level: %dcm\n", fake_level);
    Serial.println("[RIVER SENSOR] Queuing targeted alert to Gateway...");

    the_mesh.triggerRiverAlert(fake_level);
  }
}