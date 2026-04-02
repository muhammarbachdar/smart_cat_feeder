#pragma once

// ============================================================
//  Sensors.h — Interface Modul Sensor
//  HX711 (Load Cell), DHT22 (Suhu & Kelembaban),
//  Ultrasonik HC-SR04 (Level Pakan), PIR (Deteksi Hewan)
// ============================================================

void initSensors();

// Baca sensor & kirim ke Firebase (dipanggil tiap SENSOR_UPDATE_INTERVAL)
void updateSensorData(bool canUseCloud);

// Update cache DHT22 (dipanggil setiap loop, non-blocking via timer internal)
void updateDHTCache();

// Baca state PIR & kirim ke Firebase bila ada perubahan
void checkPIR(bool canUseCloud);

// Getter data sensor
int   getFoodLevelPercentage(); // 0–100 %
float getFoodWeightGram();      // gram, -1 = error sensor
float getTemperature();         // °C (dari cache)
float getHumidity();            // % (dari cache)
float getSimulatedBattery();    // % (simulasi drain)