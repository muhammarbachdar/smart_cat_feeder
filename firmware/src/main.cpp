#include <Arduino.h>
#include "Config.h"
#include "Sensors.h"
#include "Actuators.h"
#include "NetworkManager.h"
#include "FirebaseManager.h"

void setup() {
  Serial.begin(115200);
  initActuators();
  initSensors();
  initNetwork();
  initFirebase();
  loadSchedules();
  loadSettings();
  Serial.println("✅ System ready!");
  Serial.printf("🔌 Device ID: %s\n", DEVICE_ID);
}

void loop() {
  checkServoState();
  updateDHTCache();
  ensureConnectivity();
  bool online = isOnline();
  checkPIR(online);

  static unsigned long lastSensorUpdate = 0;
  if (millis() - lastSensorUpdate >= SENSOR_UPDATE_INTERVAL) {
    lastSensorUpdate = millis();
    updateSensorData(online);
  }

  static unsigned long lastScheduleCheck = 0;
  static unsigned long lastReload = 0;
  if (millis() - lastScheduleCheck >= SCHEDULE_CHECK_INTERVAL) {
    lastScheduleCheck = millis();
    checkAndRunSchedules();
    if (online && (millis() - lastReload >= RELOAD_INTERVAL)) {
      lastReload = millis();
      loadSchedules();
      loadSettings();
    }
  }

  if (online && !isFeedingNow()) {
    handleManualFeedCommand();
  }

  delay(10);
}