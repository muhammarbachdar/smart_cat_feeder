#pragma once
#include <Arduino.h>

// ============================================================
//  NetworkManager.h — Interface Modul Jaringan (WiFi & NTP)
// ============================================================

// Koneksi WiFi + sinkronisasi NTP (dipanggil sekali di setup())
void initNetwork();

// Jaga koneksi tetap hidup (dipanggil setiap loop())
void ensureConnectivity();

// Cek apakah WiFi & Firebase siap
bool isOnline();

// --- Utilitas Waktu (dari NTP) ---
String getCurrentTime();
int    getCurrentDay();

// --- Utilitas WiFi ---
int convertRSSItoPercent(int rssi);