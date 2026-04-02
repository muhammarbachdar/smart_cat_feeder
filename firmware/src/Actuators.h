#pragma once
#include <Arduino.h>

// ============================================================
//  Actuators.h — Interface Modul Aktuator (Servo)
// ============================================================

void initActuators();

// Mulai proses makan (non-blocking: CPU langsung bebas setelah dipanggil)
void feedNow(String mode, int amount);

// Dipanggil setiap loop() — menghentikan servo tepat waktu tanpa delay()
void checkServoState();

// Getter state feeding (dipakai loop & FirebaseManager)
bool isFeedingNow();

// Utilitas durasi servo
int calculateServoDurationMs(int amount);