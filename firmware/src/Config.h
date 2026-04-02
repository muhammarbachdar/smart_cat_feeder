#pragma once

// ============================================================
//  Config.h — Pusat Kendali: Kredensial, Pin & Konstanta
//  ⚠️  JANGAN commit file ini ke GitHub (berisi kunci rahasia!)
// ============================================================

// --- Kredensial WiFi ---
#define WIFI_SSID     "YOUR_WIFI_SSID_HERE"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD_HERE"

// --- Kredensial Firebase ---
// Ambil URL dari Firebase Console (buang https:// dan / di akhir)
#define FIREBASE_HOST "YOUR_FIREBASE_URL_HERE"
#define FIREBASE_AUTH "YOUR_FIREBASE_TOKEN_HERE"

// --- Identitas Perangkat ---
// Ganti sesuai user ID yang login di aplikasi
#define DEVICE_ID     "YOUR_USER_ID"

// --- NTP / Jam ---
#define NTP_SERVER          "pool.ntp.org"
#define GMT_OFFSET_SEC      25200   // WIB = UTC+7 (7 * 3600)
#define DAYLIGHT_OFFSET_SEC 0

// --- Pin GPIO ---
#define PIN_SERVO   18
#define PIN_PIR     19
#define DT_PIN      25   // HX711 Data
#define SCK_PIN     26   // HX711 Clock
#define TRIG_PIN    5    // Ultrasonik Trigger
#define ECHO_PIN    17   // Ultrasonik Echo
#define DHTPIN      33

// --- Tipe Sensor ---
#define DHTTYPE DHT22

// --- Kalibrasi HX711 ---
// TODO: [HARDWARE] Ganti dengan hasil kalibrasi nyata saat hardware tersedia
#define HX711_CALIBRATION_FACTOR 0.42f

// --- Interval Timer (ms) ---
#define DHT_READ_INTERVAL      3000UL   // Baca DHT22 tiap 3 detik
#define SENSOR_UPDATE_INTERVAL 5000UL   // Kirim ke Firebase tiap 5 detik
#define SCHEDULE_CHECK_INTERVAL 10000UL // Cek jadwal tiap 10 detik
#define RELOAD_INTERVAL        300000UL // Reload jadwal dari Firebase tiap 5 menit
#define RECONNECT_COOLDOWN     5000UL   // Jeda antar percobaan reconnect WiFi
#define MANUAL_FEED_COOLDOWN   300000UL // Cooldown setelah manual feed (5 menit)

// --- Batas Jadwal ---
#define MAX_SCHEDULES 10   // Maksimal jadwal tersimpan di RAM

// --- Batas Porsi Makan (gram) ---
#define MIN_FEED_AMOUNT 0
#define MAX_FEED_AMOUNT 200

// --- Batas History Firebase ---
#define MAX_FEEDING_HISTORY 50   // Hapus entry lama bila melebihi angka ini

// --- Mapping Ultrasonik → Level Pakan ---
// Sesuai tinggi wadah 50 cm: 2 cm = penuh (100%), 50 cm = kosong (0%)
#define ULTRASONIC_MIN_CM 2
#define ULTRASONIC_MAX_CM 50

// --- Default Sensor Cache (sebelum DHT pertama kali terbaca) ---
#define DEFAULT_TEMPERATURE 24.5f
#define DEFAULT_HUMIDITY    45.0f

// --- Simulasi Baterai ---
#define BATTERY_DRAIN_PER_SEC 0.001f   // % yang terkuras per detik