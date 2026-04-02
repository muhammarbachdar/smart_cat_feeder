#include "Actuators.h"
#include "Config.h"
#include "FirebaseManager.h"
#include "NetworkManager.h"
#include <ESP32Servo.h>

// ============================================================
//  Actuators.cpp — Implementasi Modul Aktuator (Servo)
// ============================================================

static Servo         feederServo;
static bool          _isFeedingNow   = false;
static unsigned long servoStartTime  = 0;
static int           servoDurationMs = 0;
static bool          servoActive     = false;

// ============================================================

void initActuators() {
  feederServo.attach(PIN_SERVO);
  feederServo.write(0); // Pastikan servo di posisi tertutup saat boot
  Serial.println("🔧 Servo siap!");
}

bool isFeedingNow() {
  return _isFeedingNow;
}

int calculateServoDurationMs(int amount) {
  int safeAmount = constrain(amount, 0, MAX_FEED_AMOUNT);
  if (safeAmount <= 0) return 0;
  return (int)map(safeAmount, 1, MAX_FEED_AMOUNT, 500, 5000);
}

// ============================================================
//  feedNow — Mulai Makan (Non-Blocking)
// ============================================================
void feedNow(String mode, int amount) {
  if (_isFeedingNow) {
    Serial.println("⚠️ Already feeding, skipping...");
    return;
  }

  _isFeedingNow   = true;
  int feedAmount  = constrain(amount, MIN_FEED_AMOUNT, MAX_FEED_AMOUNT);
  int durationMs  = calculateServoDurationMs(feedAmount);

  Serial.printf("🚀 %s | amount=%dg | servo=%dms\n",
                mode.c_str(), feedAmount, durationMs);

  String statusPath = String("/devices/") + DEVICE_ID + "/commands/status";
  firebaseSetString(statusPath, "feeding");

  if (feedAmount <= 0 || durationMs <= 0) {
    Serial.println("⚠️ Feed amount 0g, servo tidak dijalankan.");
    firebaseSetString(statusPath, "idle");
    _isFeedingNow = false;
    return;
  }

  // Mulai servo — CPU langsung balik ke loop()
  feederServo.write(90);
  servoStartTime  = millis();
  servoDurationMs = durationMs;
  servoActive     = true;

  // Catat data makan terakhir ke Firebase
  String feedingPath = String("/devices/") + DEVICE_ID + "/feedingData";
  firebaseSetString(feedingPath + "/lastMealTime",   getCurrentTime());
  firebaseSetInt   (feedingPath + "/lastMealAmount", feedAmount);

  // Simpan ke history (dengan batas MAX_FEEDING_HISTORY entry)
  saveFeedingHistory(feedAmount, mode);

  Serial.println("🔄 Servo running... (non-blocking, CPU free)");
}

// ============================================================
//  checkServoState — Pemeriksa Timer Servo (Dipanggil Tiap Loop)
// ============================================================
void checkServoState() {
  if (!servoActive) return;

  if (millis() - servoStartTime >= (unsigned long)servoDurationMs) {
    feederServo.write(0); // Tutup servo
    servoActive   = false;
    _isFeedingNow = false;

    String statusPath = String("/devices/") + DEVICE_ID + "/commands/status";
    firebaseSetString(statusPath, "idle");
    Serial.println("✅ Feeding completed! (non-blocking)");
  }
}