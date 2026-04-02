#include "NetworkManager.h"
#include "Config.h"
#include <WiFi.h>
#include <FirebaseESP32.h>
#include <time.h>

// ============================================================
//  NetworkManager.cpp — Implementasi WiFi & NTP
// ============================================================

// Referensi objek Firebase (didefinisikan di FirebaseManager.cpp)
extern FirebaseData   firebaseData;
extern FirebaseAuth   auth;
extern FirebaseConfig config;

static unsigned long lastReconnectAttempt = 0;

// ============================================================

void initNetwork() {
  Serial.print("📶 Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // Tunggu maksimal 10 detik — jika gagal, lanjut mode offline
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected!");

    // Sinkronisasi Jam via NTP
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
    Serial.print("⏰ Menunggu sinkronisasi NTP");

    unsigned long ntpStart = millis();
    while (time(nullptr) < 1700000000UL) {
      if (millis() - ntpStart > 15000) {
        Serial.println("\n⚠️ NTP timeout! Lanjut mode offline.");
        break;
      }
      Serial.print(".");
      delay(500);
    }
    Serial.printf("\n✅ Waktu sekarang: %s\n", getCurrentTime().c_str());
  } else {
    Serial.println("\n⚠️ WiFi gagal! Masuk mode offline. Alat tetap hidup.");
  }
}

void ensureConnectivity() {
  unsigned long now = millis();
  if (now - lastReconnectAttempt < RECONNECT_COOLDOWN) return;

  if (WiFi.status() != WL_CONNECTED) {
    lastReconnectAttempt = now;
    Serial.println("⚠️ WiFi terputus, mencoba reconnect...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    return;
  }

  if (!Firebase.ready()) {
    lastReconnectAttempt = now;
    Serial.println("⚠️ Firebase not ready, reinitializing...");
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);
  }
}

bool isOnline() {
  return (WiFi.status() == WL_CONNECTED) && Firebase.ready();
}

// ============================================================
//  Utilitas Waktu
// ============================================================
String getCurrentTime() {
  time_t now = time(nullptr);
  struct tm* t = localtime(&now);
  char buf[9];
  sprintf(buf, "%02d:%02d:%02d", t->tm_hour, t->tm_min, t->tm_sec);
  return String(buf);
}

int getCurrentDay() {
  time_t now = time(nullptr);
  struct tm* t = localtime(&now);
  int day = t->tm_wday; // 0=Minggu
  return (day == 0) ? 6 : day - 1; // Konversi ke 0=Senin
}

int convertRSSItoPercent(int rssi) {
  return constrain((int)map(rssi, -100, -30, 0, 100), 0, 100);
}