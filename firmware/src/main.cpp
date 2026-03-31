#include <Arduino.h>
#include <ESP32Servo.h>
#include "HX711.h"
#include <WiFi.h>
#include <FirebaseESP32.h>
#include <time.h>
#include <ArduinoJson.h>
#include <DHT.h>

// Kredensial
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""
// Silakan ganti dengan kredensial Firebase Anda untuk testing lokal
#define FIREBASE_HOST "YOUR_FIREBASE_PROJECT_ID.firebaseio.com"
#define FIREBASE_AUTH "YOUR_FIREBASE_DATABASE_SECRET"

// NTP
#define NTP_SERVER "pool.ntp.org"
#define GMT_OFFSET_SEC 25200
#define DAYLIGHT_OFFSET_SEC 0

FirebaseData firebaseData;
FirebaseAuth auth;
FirebaseConfig config;

// PIN
const int PIN_SERVO = 18;
const int PIN_PIR = 19;
const int DT_PIN = 21;
const int SCK_PIN = 22;
const int TRIG_PIN = 5;
const int ECHO_PIN = 17;
const int DHTPIN = 33;     // Pin untuk DHT22
#define DHTTYPE DHT22

Servo feederServo;
HX711 scale;
DHT dht(DHTPIN, DHTTYPE);

// Silakan ganti dengan kredensial Firebase Anda untuk testing lokal
String deviceId = "YOUR_DEVICE_ID";

struct Schedule {
  String time;
  int amount;
  bool days[7];
  bool enabled;
  String id;
};

Schedule schedules[10];
int scheduleCount = 0;
bool autoFeedEnabled = true;
int lowStockAlert = 20;
String lastFedScheduleId = "";
int lastFedScheduleMinuteOfDay = -1;
int lastFedScheduleDayOfYear = -1;
unsigned long lastScheduleCheck = 0;
unsigned long lastReload = 0;

// ANTI DOUBLE FEEDING
bool isFeedingNow = false;
unsigned long lastManualFeedTime = 0;
int lastCommandTimestamp = 0;
bool skipNextSchedule = false;
String skippedScheduleId = "";
unsigned long lastReconnectAttempt = 0;

// Deklarasi fungsi
void feedNow(String mode, int amount);
void recordFeedingHistory(int amount);
void loadSchedules();
void loadSettings();
void checkAndRunSchedules();
int getFoodLevel();
float getTemperature();
float getHumidity();
String getCurrentTime();
int getCurrentDay();
int convertRSSItoPercent(int rssi);
int calculateServoDurationMs(int amount);
void ensureConnectivity();
int calculateServoDurationMs(int amount) {
  int safeAmount = constrain(amount, 0, 200);
  if (safeAmount <= 0) return 0;
  return map(safeAmount, 1, 200, 500, 5000);
}

void ensureConnectivity() {
  unsigned long now = millis();
  if (now - lastReconnectAttempt < 5000) return;

  if (WiFi.status() != WL_CONNECTED) {
    lastReconnectAttempt = now;
    Serial.println("⚠️ WiFi disconnected, reconnecting...");
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


// ==================== IMPLEMENTASI FUNGSI ====================

int convertRSSItoPercent(int rssi) {
  int percent = map(rssi, -100, -30, 0, 100);
  return constrain(percent, 0, 100);
}

String getCurrentTime() {
  time_t now = time(nullptr);
  struct tm* timeinfo = localtime(&now);
  char timeStr[9];
  sprintf(timeStr, "%02d:%02d:%02d", timeinfo->tm_hour, timeinfo->tm_min, timeinfo->tm_sec);
  return String(timeStr);
}

int getCurrentDay() {
  time_t now = time(nullptr);
  struct tm* timeinfo = localtime(&now);
  int day = timeinfo->tm_wday;
  return (day == 0) ? 6 : day - 1;
}

void loadSchedules() {
  String path = "/devices/" + deviceId + "/schedules";
  
  if (Firebase.getJSON(firebaseData, path)) {
    String jsonStr;
    firebaseData.jsonObject().toString(jsonStr, true);
    
    DynamicJsonDocument doc(4096);
    deserializeJson(doc, jsonStr);
    
    JsonObject obj = doc.as<JsonObject>();
    scheduleCount = 0;
    
    for (JsonPair kv : obj) {
      String key = kv.key().c_str();
      JsonObject scheduleObj = kv.value().as<JsonObject>();
      
      schedules[scheduleCount].id = key;
      schedules[scheduleCount].time = scheduleObj["time"].as<String>();
      schedules[scheduleCount].amount = scheduleObj["amount"].as<int>();
      schedules[scheduleCount].enabled = scheduleObj["enabled"].as<bool>();
      
      JsonArray daysArray = scheduleObj["days"].as<JsonArray>();
      for (int d = 0; d < 7; d++) {
        schedules[scheduleCount].days[d] = daysArray[d].as<bool>();
      }
      
      scheduleCount++;
    }
    
    Serial.printf("📅 Loaded %d schedules\n", scheduleCount);
  }
}

void loadSettings() {
  String path = "/devices/" + deviceId + "/settings";
  
  if (Firebase.getJSON(firebaseData, path)) {
    FirebaseJson json = firebaseData.jsonObject();
    FirebaseJsonData jsonData;
    
    json.get(jsonData, "autoFeed", true);
    if (jsonData.success) autoFeedEnabled = jsonData.boolValue;
    
    json.get(jsonData, "lowStockAlert", true);
    if (jsonData.success) lowStockAlert = jsonData.intValue;
    
    Serial.printf("⚙️ Settings: autoFeed=%s, lowStockAlert=%d%%\n", 
                  autoFeedEnabled ? "ON" : "OFF", lowStockAlert);
  }
}

void recordFeedingHistory(int amount) {
  String path = "/devices/" + deviceId + "/feedingHistory";
  
  FirebaseJson json;
  json.add("timestamp", (int)time(nullptr));
  json.add("amount", amount);
  json.add("date", getCurrentTime());
  
  if (Firebase.pushJSON(firebaseData, path, json)) {
    Serial.printf("📝 Feeding recorded: %dg\n", amount);
  }
}

void feedNow(String mode, int amount) {
  if (isFeedingNow) {
    Serial.println("⚠️ Already feeding, skipping...");
    return;
  }
  
  isFeedingNow = true;
  int feedAmount = constrain(amount, 0, 200);
  int servoDurationMs = calculateServoDurationMs(feedAmount);

  Serial.print("🚀 ");
  Serial.printf("%s | amount=%dg | servo=%dms\n", mode.c_str(), feedAmount, servoDurationMs);
  
  String path = "/devices/" + deviceId + "/commands/status";
  Firebase.setString(firebaseData, path, "feeding");

  if (feedAmount <= 0 || servoDurationMs <= 0) {
    Serial.println("⚠️ Feed amount is 0g, skipping servo action.");
    Firebase.setString(firebaseData, path, "idle");
    isFeedingNow = false;
    return;
  }
  
  feederServo.write(90);
  delay(servoDurationMs);
  feederServo.write(0);
  
  String currentTime = getCurrentTime();
  String feedingPath = "/devices/" + deviceId + "/feedingData";
  Firebase.setString(firebaseData, feedingPath + "/lastMealTime", currentTime);
  Firebase.setInt(firebaseData, feedingPath + "/lastMealAmount", feedAmount);
  
  // Catat feeding history (HANYA SEKALI di sini)
  String historyPath = "/devices/" + deviceId + "/feedingHistory";
  FirebaseJson historyJson;
  historyJson.add("timestamp", (int)time(nullptr));
  historyJson.add("amount", feedAmount);
  historyJson.add("date", currentTime);
  historyJson.add("mode", mode);

  if (Firebase.pushJSON(firebaseData, historyPath, historyJson)) {
    Serial.println("📝 Feeding history saved!");
  }
  
  Firebase.setString(firebaseData, path, "idle");
  Serial.println("✅ Feeding completed!");
  
  isFeedingNow = false;
}

void checkAndRunSchedules() {
  if (!autoFeedEnabled) {
    Serial.println("⚠️ Auto feeding is disabled in settings");
    return;
  }
  
  if (isFeedingNow) return;
  
  if (millis() - lastManualFeedTime < 300000) {
    Serial.println("⏰ Cooldown: skipping schedule check (recent manual feed)");
    return;
  }
  
  String currentTime = getCurrentTime();
  int currentHour = currentTime.substring(0, 2).toInt();
  int currentMinute = currentTime.substring(3, 5).toInt();
  int currentMinuteOfDay = (currentHour * 60) + currentMinute;
  int currentDay = getCurrentDay();
  time_t now = time(nullptr);
  struct tm* timeinfo = localtime(&now);
  int currentDayOfYear = timeinfo->tm_yday;

  if (lastFedScheduleDayOfYear != currentDayOfYear) {
    lastFedScheduleId = "";
    lastFedScheduleMinuteOfDay = -1;
    lastFedScheduleDayOfYear = currentDayOfYear;
  }
  
  for (int i = 0; i < scheduleCount; i++) {
    if (!schedules[i].enabled) continue;
    if (!schedules[i].days[currentDay]) continue;
    
    if (skipNextSchedule && schedules[i].id == skippedScheduleId) {
      Serial.printf("⏭️ Skipping schedule: %s at %s\n", schedules[i].id.c_str(), schedules[i].time.c_str());
      skipNextSchedule = false;
      skippedScheduleId = "";
      continue;
    }
    
    int scheduleHour = schedules[i].time.substring(0, 2).toInt();
    int scheduleMinute = schedules[i].time.substring(3, 5).toInt();
    
    if (currentHour == scheduleHour && 
        currentMinute >= scheduleMinute && 
        currentMinute <= scheduleMinute + 2) {

      bool sameScheduleWindow =
        (lastFedScheduleId == schedules[i].id) &&
        (lastFedScheduleDayOfYear == currentDayOfYear) &&
        (lastFedScheduleMinuteOfDay >= 0) &&
        (currentMinuteOfDay >= lastFedScheduleMinuteOfDay) &&
        (currentMinuteOfDay <= lastFedScheduleMinuteOfDay + 2);

      if (!sameScheduleWindow) {
        Serial.printf("🕐 Schedule triggered: %s at %s\n", 
                      schedules[i].time.c_str(), currentTime.c_str());
        feedNow("Auto Feeding (Scheduled)", schedules[i].amount);
        lastFedScheduleId = schedules[i].id;
        lastFedScheduleMinuteOfDay = currentMinuteOfDay;
        lastFedScheduleDayOfYear = currentDayOfYear;
        delay(1000);
      }
    }
  }

  if (lastFedScheduleId != "" &&
      (currentMinuteOfDay > lastFedScheduleMinuteOfDay + 2 ||
       currentMinuteOfDay < lastFedScheduleMinuteOfDay)) {
    lastFedScheduleId = "";
    lastFedScheduleMinuteOfDay = -1;
  }
}

int getFoodLevel() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return 0;
  
  int distance = duration * 0.034 / 2;
  int percent = map(distance, 2, 50, 100, 0);
  percent = constrain(percent, 0, 100);
  
  static int lastPercent = 50;
  percent = (lastPercent * 0.7) + (percent * 0.3);
  lastPercent = percent;
  
  return percent;
}

// ==================== FUNGSI DHT22 ====================
float getTemperature() {
  float temp = dht.readTemperature();
  if (isnan(temp)) {
    Serial.println("⚠️ Failed to read from DHT22, using fallback value");
    return 24.5;
  }
  return temp;
}

float getHumidity() {
  float hum = dht.readHumidity();
  if (isnan(hum)) {
    Serial.println("⚠️ Failed to read from DHT22, using fallback value");
    return 45;
  }
  return hum;
}

void setup() {
  Serial.begin(115200);
  
  feederServo.attach(PIN_SERVO);
  feederServo.write(0);
  
  scale.begin(DT_PIN, SCK_PIN);
  scale.set_scale(1.0);
  scale.tare();
  
  dht.begin();  // Inisialisasi DHT22
  
  pinMode(PIN_PIR, INPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi Connected");
  
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
  Serial.println("⏰ Waiting for NTP time...");
  int retry = 0;
  while (time(nullptr) < 100000 && retry < 20) {
    delay(500);
    retry++;
  }
  Serial.printf("Current time: %s\n", getCurrentTime().c_str());
  
  config.host = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  
  loadSchedules();
  loadSettings();
  
  Serial.println("✅ System ready!");
  Serial.printf("🔌 Device ID: %s\n", deviceId.c_str());
}

void loop() {
  ensureConnectivity();
  bool canUseCloud = (WiFi.status() == WL_CONNECTED) && Firebase.ready();

  float berat = scale.get_units(5);
  if (berat < 0) berat = 0;
  
  int stokPakan = getFoodLevel();
  int rssi = WiFi.RSSI();
  int wifiPercent = convertRSSItoPercent(rssi);
  float temperature = getTemperature();  // Baca dari DHT22
  float humidity = getHumidity();        // Baca dari DHT22
  String currentTime = getCurrentTime();
  
  String deviceStatusPath = "/devices/" + deviceId + "/deviceStatus";
  String feedingDataPath = "/devices/" + deviceId + "/feedingData";
  
  if (canUseCloud) {
    Firebase.setBool(firebaseData, deviceStatusPath + "/isOnline", true);
    Firebase.setInt(firebaseData, deviceStatusPath + "/batteryLevel", 85);
    Firebase.setBool(firebaseData, deviceStatusPath + "/isCharging", false);
    Firebase.setInt(firebaseData, deviceStatusPath + "/wifiStrength", wifiPercent);
    
    Firebase.setFloat(firebaseData, feedingDataPath + "/bowlWeight", berat);
    Firebase.setInt(firebaseData, feedingDataPath + "/tankLevel", stokPakan);
    Firebase.setFloat(firebaseData, feedingDataPath + "/temperature", temperature);
    Firebase.setFloat(firebaseData, feedingDataPath + "/humidity", humidity);
    Firebase.setString(firebaseData, feedingDataPath + "/lastUpdate", currentTime);
    
    if (stokPakan < lowStockAlert && stokPakan > 0) {
      Firebase.setString(firebaseData, "/devices/" + deviceId + "/alerts/lowStock", "true");
      Serial.printf("⚠️ Low stock alert! Only %d%% remaining\n", stokPakan);
    } else {
      Firebase.setString(firebaseData, "/devices/" + deviceId + "/alerts/lowStock", "false");
    }
  } else {
    Serial.println("⚠️ Cloud unavailable, running with local schedule cache.");
  }
  
  Serial.printf("Berat: %.0fg | Stok: %d%% | Suhu: %.1f°C | Humidity: %.0f%% | WiFi: %d%% | Time: %s\n", 
                berat, stokPakan, temperature, humidity, wifiPercent, currentTime.c_str());
  
  if (millis() - lastScheduleCheck > 10000) {
    lastScheduleCheck = millis();
    checkAndRunSchedules();
    
    if (canUseCloud && millis() - lastReload > 300000) {
      lastReload = millis();
      loadSchedules();
      loadSettings();
    }
  }
  
  // ==================== BACA MANUAL FEED COMMAND ====================
  String commandPath = "/devices/" + deviceId + "/commands/feedNow";
  String timestampPath = "/devices/" + deviceId + "/commands/timestamp";
  String skipNextPath = "/devices/" + deviceId + "/commands/skipNext";
  
  if (canUseCloud && !isFeedingNow) {
    if (Firebase.getBool(firebaseData, commandPath)) {
      if (firebaseData.boolData() == true) {
        int currentTimestamp = 0;
        int manualAmount = 50;
        if (Firebase.getInt(firebaseData, timestampPath)) {
          currentTimestamp = firebaseData.intData();
        }
        if (Firebase.getInt(firebaseData, "/devices/" + deviceId + "/commands/amount")) {
          manualAmount = firebaseData.intData();
        }
        
        if (currentTimestamp != lastCommandTimestamp) {
          lastCommandTimestamp = currentTimestamp;
          lastManualFeedTime = millis();
          
          bool shouldSkip = false;
          if (Firebase.getBool(firebaseData, skipNextPath)) {
            shouldSkip = firebaseData.boolData();
          }
          
          if (shouldSkip) {
            String nextScheduleId = "";
            long minDiff = 999999;
            int currentDay = getCurrentDay();
            int currentHour = getCurrentTime().substring(0, 2).toInt();
            int currentMinute = getCurrentTime().substring(3, 5).toInt();
            int currentTotalMin = currentHour * 60 + currentMinute;
            
            for (int i = 0; i < scheduleCount; i++) {
              if (!schedules[i].enabled) continue;
              
              for (int day = 0; day < 7; day++) {
                if (schedules[i].days[day]) {
                  int scheduleHour = schedules[i].time.substring(0, 2).toInt();
                  int scheduleMinute = schedules[i].time.substring(3, 5).toInt();
                  int scheduleTotalMin = scheduleHour * 60 + scheduleMinute;
                  
                  long diff;
                  if (day == currentDay) {
                    diff = scheduleTotalMin - currentTotalMin;
                    if (diff < 0) diff += 24 * 60;
                  } else if (day > currentDay) {
                    diff = (day - currentDay) * 24 * 60 + (scheduleTotalMin - currentTotalMin);
                  } else {
                    diff = (day + 7 - currentDay) * 24 * 60 + (scheduleTotalMin - currentTotalMin);
                  }
                  
                  if (diff < minDiff && diff > 0) {
                    minDiff = diff;
                    nextScheduleId = schedules[i].id;
                  }
                }
              }
            }
            
            if (nextScheduleId != "") {
              skipNextSchedule = true;
              skippedScheduleId = nextScheduleId;
              Serial.printf("⏭️ Will skip next schedule ID: %s\n", nextScheduleId.c_str());
            }
          }
          
          Serial.println("🔔 Manual feeding command received!");
          feedNow("Manual Feeding", manualAmount);
        }
        
        Firebase.setBool(firebaseData, commandPath, false);
        Firebase.setBool(firebaseData, skipNextPath, false);
      }
    }
  }
  
  delay(1000);
}