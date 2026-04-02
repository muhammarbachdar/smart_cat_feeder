#pragma once
#include <Arduino.h>

// ============================================================
//  FirebaseManager.h — Interface Modul Sinkronisasi Cloud
//  Jadwal, Settings, History, dan perintah Manual Feed
// ============================================================

// Inisialisasi koneksi Firebase (dipanggil sekali di setup())
void initFirebase();

// Muat jadwal dari Firebase ke RAM
void loadSchedules();

// Muat pengaturan (autoFeed, lowStockAlert) dari Firebase
void loadSettings();

// Cek & jalankan jadwal otomatis yang jatuh tempo
void checkAndRunSchedules();

// Baca perintah manual feed dari Firebase & eksekusi
void handleManualFeedCommand();

// Simpan history makan ke Firebase (dengan batas MAX_FEEDING_HISTORY)
void saveFeedingHistory(int amount, String mode);

// Getter settings (dipakai modul lain)
int  getLowStockAlert();
bool getAutoFeedEnabled();

// --- Wrapper Firebase (mengurangi boilerplate di modul lain) ---
void firebaseSetBool  (const String& path, bool value);
void firebaseSetInt   (const String& path, int value);
void firebaseSetFloat (const String& path, float value);
void firebaseSetString(const String& path, const String& value);