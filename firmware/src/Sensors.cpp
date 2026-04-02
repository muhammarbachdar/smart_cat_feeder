#include "Sensors.h"
#include "Config.h"
#include "FirebaseManager.h"   // untuk kirim PIR & status sensor
#include "NetworkManager.h"    // untuk getCurrentTime() & convertRSSItoPercent()
#include <DHT.h>
#include "HX711.h"
#include <Arduino.h>
#include <WiFi.h>

// ============================================================
//  Sensors.cpp — Implementasi Modul Sensor
// ============================================================

// --- Objek Sensor ---
static HX711 scale;
static DHT   dht(DHTPIN, DHTTYPE);

// --- Cache DHT22 ---
static float cachedTemperature = DEFAULT_TEMPERATURE;
static float cachedHumidity    = DEFAULT_HUMIDITY;
static unsigned long lastDHTRead = 0;

// --- State PIR ---
static bool          lastPIRState = false;
static unsigned long lastPIRLog   = 0;

// --- Simulasi Baterai ---
static float         simulatedBattery = 100.0f;
static unsigned long lastBattDrain    = 0;

// ============================================================

void initSensors() {
  // HX711
  scale.begin(DT_PIN, SCK_PIN);
  scale.set_scale(HX711_CALIBRATION_FACTOR);
  scale.tare(); // Nol-kan timbangan saat pertama nyala
  Serial.println("⚖️ Timbangan siap!");

  // DHT22
  dht.begin();

  // PIR & Ultrasonik
  pinMode(PIN_PIR,  INPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  Serial.println("🌡️ Sensor siap!");
}

// ============================================================
//  HX711 — Berat Pakan
// ============================================================
float getFoodWeightGram() {
  if (!scale.is_ready()) {
    Serial.println("⚠️ ERROR: HX711 tidak merespon! Cek wiring DT/SCK.");
    return -1; // -1 = error sensor, beda dari 0 (kosong beneran)
  }
  long raw = scale.get_units(5);
  Serial.printf("🔍 HX711 raw units: %ld\n", raw);
  if (raw < 0) raw = 0;
  return (float)raw;
}

// ============================================================
//  Ultrasonik HC-SR04 — Level Pakan (Median 5 Sampel)
// ============================================================
int getFoodLevelPercentage() {
  int samples[5];
  int validCount = 0;

  for (int i = 0; i < 5; i++) {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    long duration = pulseIn(ECHO_PIN, HIGH, 30000);
    delay(10);

    if (duration > 0) {
      int dist = (int)(duration * 0.034f / 2.0f);
      if (dist > 0 && dist < 400) {
        samples[validCount++] = dist;
      }
    }
  }

  if (validCount == 0) {
    Serial.println("⚠️ ERROR: Sensor Ultrasonik tidak merespon!");
    return 0;
  }

  // Bubble sort → ambil median
  for (int i = 0; i < validCount - 1; i++) {
    for (int j = 0; j < validCount - i - 1; j++) {
      if (samples[j] > samples[j + 1]) {
        int tmp = samples[j]; samples[j] = samples[j + 1]; samples[j + 1] = tmp;
      }
    }
  }
  int medianDist = samples[validCount / 2];

  // 2 cm = penuh (100%), 50 cm = kosong (0%)
  int percentage = map(medianDist, ULTRASONIC_MIN_CM, ULTRASONIC_MAX_CM, 100, 0);
  return constrain(percentage, 0, 100);
}

// ============================================================
//  DHT22 — Suhu & Kelembaban (Cache Non-Blocking)
// ============================================================
void updateDHTCache() {
  if (millis() - lastDHTRead < DHT_READ_INTERVAL) return;
  lastDHTRead = millis();

  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (!isnan(t)) {
    cachedTemperature = t;
    Serial.printf("🌡️ DHT22 suhu: %.1f°C\n", t);
  } else {
    Serial.println("⚠️ DHT22 gagal baca suhu! Pakai cache terakhir.");
  }

  if (!isnan(h)) {
    cachedHumidity = h;
    Serial.printf("💧 DHT22 humidity: %.1f%%\n", h);
  } else {
    Serial.println("⚠️ DHT22 gagal baca humidity! Pakai cache terakhir.");
  }
}

float getTemperature() { return cachedTemperature; }
float getHumidity()    { return cachedHumidity; }

// ============================================================
//  PIR — Deteksi Hewan Peliharaan
// ============================================================
void checkPIR(bool canUseCloud) {
  bool pirState = digitalRead(PIN_PIR);
  if (pirState != lastPIRState) {
    lastPIRState = pirState;
    Serial.printf("🐾 PIR: %s\n", pirState ? "Ada gerakan!" : "Tidak ada gerakan");
    if (canUseCloud) {
      String pirPath = String("/devices/") + DEVICE_ID + "/deviceStatus/petDetected";
      firebaseSetBool(pirPath, pirState);
    }
  }
}

// ============================================================
//  Simulasi Baterai
// ============================================================
float getSimulatedBattery() {
  unsigned long now = millis();
  if (now - lastBattDrain >= 1000) {
    lastBattDrain = now;
    simulatedBattery -= BATTERY_DRAIN_PER_SEC;
    if (simulatedBattery < 0) simulatedBattery = 0;
  }
  return simulatedBattery;
}

// ============================================================
//  Update Gabungan: Baca Semua Sensor & Kirim ke Firebase
// ============================================================
void updateSensorData(bool canUseCloud) {
  int   stokPakan   = getFoodLevelPercentage();
  int   rssi        = WiFi.RSSI();
  int   wifiPercent = convertRSSItoPercent(rssi);
  float berat       = getFoodWeightGram();
  if (berat < 0) {
    Serial.println("⚠️ Load cell error, bowlWeight tidak diupdate.");
    berat = 0;
  }
  float temperature  = getTemperature();
  float humidity     = getHumidity();
  String currentTime = getCurrentTime();

  if (canUseCloud) {
    String deviceStatusPath = String("/devices/") + DEVICE_ID + "/deviceStatus";
    String feedingDataPath  = String("/devices/") + DEVICE_ID + "/feedingData";

    float battLevel = getSimulatedBattery();

    firebaseSetBool (deviceStatusPath + "/isOnline",      true);
    firebaseSetFloat(deviceStatusPath + "/batteryLevel",  battLevel);
    firebaseSetBool (deviceStatusPath + "/isCharging",    false);
    firebaseSetInt  (deviceStatusPath + "/wifiStrength",  wifiPercent);

    firebaseSetFloat (feedingDataPath + "/bowlWeight",   berat);
    firebaseSetInt   (feedingDataPath + "/tankLevel",    stokPakan);
    firebaseSetFloat (feedingDataPath + "/temperature",  temperature);
    firebaseSetFloat (feedingDataPath + "/humidity",     humidity);
    firebaseSetString(feedingDataPath + "/lastUpdate",   currentTime);

    // Alert stok rendah
    String alertPath = String("/devices/") + DEVICE_ID + "/alerts/lowStock";
    if (stokPakan < getLowStockAlert() && stokPakan > 0) {
      firebaseSetString(alertPath, "true");
      Serial.printf("⚠️ Low stock alert! Only %d%% remaining\n", stokPakan);
    } else {
      firebaseSetString(alertPath, "false");
    }
  }

  Serial.printf("Berat: %.0fg | Stok: %d%% | Suhu: %.1f°C | Hum: %.0f%% | WiFi: %d%% | Time: %s\n",
                berat, stokPakan, temperature, humidity, wifiPercent, currentTime.c_str());
}