#include "FirebaseManager.h"
#include "Config.h"
#include "Actuators.h"
#include "NetworkManager.h"
#include <FirebaseESP32.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <time.h>

// ============================================================
//  FirebaseManager.cpp — Sinkronisasi Cloud (Jadwal, Settings,
//  History, & Perintah Manual Feed)
// ============================================================

// Objek Firebase (extern — diakses juga oleh NetworkManager)
FirebaseData   firebaseData;
FirebaseAuth   auth;
FirebaseConfig config;

// --- Data Jadwal ---
struct Schedule {
  String time;
  int    amount;
  bool   days[7];
  bool   enabled;
  String id;
};
static Schedule schedules[MAX_SCHEDULES];
static int      scheduleCount = 0;

// --- Settings ---
static bool autoFeedEnabled = true;
static int  lowStockAlert   = 20;

// --- Anti Double Feeding ---
static String        lastFedScheduleId          = "";
static int           lastFedScheduleMinuteOfDay = -1;
static int           lastFedScheduleDayOfYear   = -1;
static unsigned long lastManualFeedTime          = 0;
static int           lastCommandTimestamp        = 0;
static bool          skipNextSchedule            = false;
static String        skippedScheduleId           = "";

static Preferences prefs;

// ============================================================
//  Wrapper Firebase (mengurangi boilerplate)
// ============================================================
void firebaseSetBool(const String& path, bool value) {
  Firebase.setBool(firebaseData, path, value);
}
void firebaseSetInt(const String& path, int value) {
  Firebase.setInt(firebaseData, path, value);
}
void firebaseSetFloat(const String& path, float value) {
  Firebase.setFloat(firebaseData, path, value);
}
void firebaseSetString(const String& path, const String& value) {
  Firebase.setString(firebaseData, path, value);
}

// ============================================================
//  Getter Settings
// ============================================================
int  getLowStockAlert()    { return lowStockAlert; }
bool getAutoFeedEnabled()  { return autoFeedEnabled; }

// ============================================================
//  Inisialisasi Firebase
// ============================================================
void initFirebase() {
  config.host                          = FIREBASE_HOST;
  config.signer.tokens.legacy_token    = FIREBASE_AUTH;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  Serial.println("🔥 Firebase siap!");
}

// ============================================================
//  Load Jadwal
// ============================================================
void loadSchedules() {
  String path = String("/devices/") + DEVICE_ID + "/schedules";

  if (!Firebase.getJSON(firebaseData, path)) return;

  String jsonStr;
  firebaseData.jsonObject().toString(jsonStr, true);

  StaticJsonDocument<2048> doc;
  if (deserializeJson(doc, jsonStr) != DeserializationError::Ok) {
    Serial.println("❌ JSON parse error saat load jadwal!");
    return;
  }

  JsonObject obj  = doc.as<JsonObject>();
  scheduleCount   = 0;

  for (JsonPair kv : obj) {
    if (scheduleCount >= MAX_SCHEDULES) {
      Serial.println("⚠️ Batas jadwal tercapai (max 10). Entry lebih diabaikan.");
      break;
    }
    JsonObject s = kv.value().as<JsonObject>();
    schedules[scheduleCount].id      = kv.key().c_str();
    schedules[scheduleCount].time    = s["time"].as<String>();
    schedules[scheduleCount].amount  = s["amount"].as<int>();
    schedules[scheduleCount].enabled = s["enabled"].as<bool>();
    JsonArray daysArr = s["days"].as<JsonArray>();
    for (int d = 0; d < 7; d++) {
      schedules[scheduleCount].days[d] = daysArr[d].as<bool>();
    }
    scheduleCount++;
  }
  Serial.printf("📅 Loaded %d jadwal\n", scheduleCount);
}

// ============================================================
//  Load Settings
// ============================================================
void loadSettings() {
  String path = String("/devices/") + DEVICE_ID + "/settings";

  if (!Firebase.getJSON(firebaseData, path)) return;

  FirebaseJson     json = firebaseData.jsonObject();
  FirebaseJsonData data;

  json.get(data, "autoFeed", true);
  if (data.success) autoFeedEnabled = data.boolValue;

  json.get(data, "lowStockAlert", true);
  if (data.success) lowStockAlert = data.intValue;

  Serial.printf("⚙️ Settings: autoFeed=%s, lowStockAlert=%d%%\n",
                autoFeedEnabled ? "ON" : "OFF", lowStockAlert);
}

// ============================================================
//  Simpan History Makan (dengan batas 50 entry)
// ============================================================
void saveFeedingHistory(int amount, String mode) {
  String historyPath = String("/devices/") + DEVICE_ID + "/feedingHistory";

  // Hapus entry tertua jika sudah mencapai batas
  if (Firebase.getJSON(firebaseData, historyPath)) {
    String histStr;
    firebaseData.jsonObject().toString(histStr, false);
    DynamicJsonDocument countDoc(2048);
    if (deserializeJson(countDoc, histStr) == DeserializationError::Ok) {
      JsonObject histObj = countDoc.as<JsonObject>();
      if ((int)histObj.size() >= MAX_FEEDING_HISTORY) {
        for (JsonPair kv : histObj) {
          Firebase.deleteNode(firebaseData, historyPath + "/" + kv.key().c_str());
          break; // Hapus 1 entry tertua saja
        }
      }
    }
  }

  FirebaseJson historyJson;
  historyJson.add("timestamp", (int)time(nullptr));
  historyJson.add("amount",    amount);
  historyJson.add("date",      getCurrentTime());
  historyJson.add("mode",      mode);

  if (Firebase.pushJSON(firebaseData, historyPath, historyJson)) {
    Serial.printf("📝 Feeding history saved: %dg (%s)\n", amount, mode.c_str());
  }
}

// ============================================================
//  checkAndRunSchedules — Cek & Jalankan Jadwal Otomatis
// ============================================================
void checkAndRunSchedules() {
  if (!autoFeedEnabled) {
    Serial.println("⚠️ Auto feeding dinonaktifkan di settings");
    return;
  }
  if (isFeedingNow()) return;
  if (millis() - lastManualFeedTime < MANUAL_FEED_COOLDOWN) {
    Serial.println("⏰ Cooldown aktif: cek jadwal dilewati (baru saja manual feed)");
    return;
  }

  time_t now = time(nullptr);
  struct tm* timeinfo = localtime(&now);
  if (timeinfo->tm_year + 1900 < 2023) {
    Serial.println("⚠️ Waktu belum sinkron (Offline/1970). Jadwal ditahan!");
    return;
  }

  String currentTime     = getCurrentTime();
  int currentHour        = currentTime.substring(0, 2).toInt();
  int currentMinute      = currentTime.substring(3, 5).toInt();
  int currentMinuteOfDay = (currentHour * 60) + currentMinute;
  int currentDay         = getCurrentDay();
  int currentDayOfYear   = timeinfo->tm_yday;

  // Baca lastFed dari flash (tahan mati lampu)
  prefs.begin("feeder", false);
  int    savedFedDay = prefs.getInt("lastFedDay", -1);
  int    savedFedMin = prefs.getInt("lastFedMin", -1);
  String savedFedId  = prefs.getString("lastFedId", "");
  prefs.end();

  // Sinkronisasi RAM ← flash saat baru nyala
  if (lastFedScheduleDayOfYear == -1 && savedFedDay == currentDayOfYear) {
    lastFedScheduleId          = savedFedId;
    lastFedScheduleMinuteOfDay = savedFedMin;
    lastFedScheduleDayOfYear   = savedFedDay;
    Serial.println("♻️ Restored lastFed dari flash (anti-amnesia)");
  }

  // Reset tracker jika hari baru
  if (lastFedScheduleDayOfYear != currentDayOfYear) {
    lastFedScheduleId          = "";
    lastFedScheduleMinuteOfDay = -1;
    lastFedScheduleDayOfYear   = currentDayOfYear;
  }

  for (int i = 0; i < scheduleCount; i++) {
    if (!schedules[i].enabled)          continue;
    if (!schedules[i].days[currentDay]) continue;

    // Skip jadwal yang ditandai dari perintah manual
    if (skipNextSchedule && schedules[i].id == skippedScheduleId) {
      Serial.printf("⏭️ Skipping schedule: %s at %s\n",
                    schedules[i].id.c_str(), schedules[i].time.c_str());
      skipNextSchedule  = false;
      skippedScheduleId = "";
      continue;
    }

    int schedHour   = schedules[i].time.substring(0, 2).toInt();
    int schedMinute = schedules[i].time.substring(3, 5).toInt();

    if (currentHour == schedHour &&
        currentMinute >= schedMinute &&
        currentMinute <= schedMinute + 2) {

      bool sameWindow =
        (lastFedScheduleId == schedules[i].id) &&
        (lastFedScheduleDayOfYear == currentDayOfYear) &&
        (lastFedScheduleMinuteOfDay >= 0) &&
        (currentMinuteOfDay >= lastFedScheduleMinuteOfDay) &&
        (currentMinuteOfDay <= lastFedScheduleMinuteOfDay + 2);

      if (!sameWindow) {
        Serial.printf("🕐 Jadwal triggered: %s at %s\n",
                      schedules[i].time.c_str(), currentTime.c_str());
        feedNow("Auto Feeding (Scheduled)", schedules[i].amount);

        lastFedScheduleId          = schedules[i].id;
        lastFedScheduleMinuteOfDay = currentMinuteOfDay;
        lastFedScheduleDayOfYear   = currentDayOfYear;

        // Simpan ke flash
        prefs.begin("feeder", false);
        prefs.putInt("lastFedDay", currentDayOfYear);
        prefs.putInt("lastFedMin", currentMinuteOfDay);
        prefs.putString("lastFedId", schedules[i].id);
        prefs.end();
      }
    }
  }

  // Reset ID jadwal setelah jendela 2 menit lewat
  if (lastFedScheduleId != "" &&
      (currentMinuteOfDay > lastFedScheduleMinuteOfDay + 2 ||
       currentMinuteOfDay < lastFedScheduleMinuteOfDay)) {
    lastFedScheduleId          = "";
    lastFedScheduleMinuteOfDay = -1;
  }
}

// ============================================================
//  handleManualFeedCommand — Baca & Eksekusi Perintah dari App
// ============================================================
void handleManualFeedCommand() {
  String commandPath   = String("/devices/") + DEVICE_ID + "/commands/feedNow";
  String timestampPath = String("/devices/") + DEVICE_ID + "/commands/timestamp";
  String skipNextPath  = String("/devices/") + DEVICE_ID + "/commands/skipNext";
  String amountPath    = String("/devices/") + DEVICE_ID + "/commands/amount";

  if (!Firebase.getBool(firebaseData, commandPath)) return;
  if (firebaseData.boolData() != true) return;

  int currentTimestamp = 0;
  int manualAmount     = 50;

  if (Firebase.getInt(firebaseData, timestampPath))  currentTimestamp = firebaseData.intData();
  if (Firebase.getInt(firebaseData, amountPath))     manualAmount     = firebaseData.intData();

  // Abaikan perintah duplikat (timestamp sama)
  if (currentTimestamp == lastCommandTimestamp) return;

  lastCommandTimestamp = currentTimestamp;
  lastManualFeedTime   = millis();

  // Proses flag "skip next schedule"
  bool shouldSkip = false;
  if (Firebase.getBool(firebaseData, skipNextPath)) {
    shouldSkip = firebaseData.boolData();
  }

  if (shouldSkip) {
    // Cari jadwal terdekat berikutnya
    String nextScheduleId = "";
    long   minDiff        = 999999;
    int    curDay         = getCurrentDay();
    String curTimeStr     = getCurrentTime();
    int    curHour        = curTimeStr.substring(0, 2).toInt();
    int    curMin         = curTimeStr.substring(3, 5).toInt();
    int    curTotalMin    = curHour * 60 + curMin;

    for (int i = 0; i < scheduleCount; i++) {
      if (!schedules[i].enabled) continue;
      for (int day = 0; day < 7; day++) {
        if (!schedules[i].days[day]) continue;
        int sHour     = schedules[i].time.substring(0, 2).toInt();
        int sMin      = schedules[i].time.substring(3, 5).toInt();
        int sTotalMin = sHour * 60 + sMin;
        long diff;
        if (day == curDay)      diff = sTotalMin - curTotalMin;
        else if (day > curDay)  diff = (day - curDay) * 1440 + (sTotalMin - curTotalMin);
        else                    diff = (day + 7 - curDay) * 1440 + (sTotalMin - curTotalMin);
        if (diff < 0) diff += 1440;
        if (diff < minDiff && diff > 0) {
          minDiff        = diff;
          nextScheduleId = schedules[i].id;
        }
      }
    }

    if (nextScheduleId != "") {
      skipNextSchedule  = true;
      skippedScheduleId = nextScheduleId;
      Serial.printf("⏭️ Jadwal berikutnya akan di-skip: %s\n", nextScheduleId.c_str());
    }
  }

  Serial.println("🔔 Perintah manual feed diterima!");
  feedNow("Manual Feeding", manualAmount);

  // Reset command di Firebase
  Firebase.setBool(firebaseData, commandPath,  false);
  Firebase.setBool(firebaseData, skipNextPath, false);
}