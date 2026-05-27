#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>     // Library bawaan untuk komunikasi I2C
#include <RTClib.h>   // Library RTC yang baru saja ditambahkan
#include <ArduinoJson.h> // 👈 Sudah siap dipanggil
#include <Preferences.h> // 👈 Sudah siap dipanggil

Preferences preferences;

// Variabel aktif di RAM (akan diisi dari memori internal saat startup)
int scheduleHour = 0;
int scheduleMinute = 0;

// GLOBAL VARIABLE
const int LDR_THRESHOLD = 300; 
bool lastDarkStatus = false; // Memori untuk menyimpan status terakhir
const char* mqtt_topic_light_publish = "sensor/light";

const int FIRE_THRESHOLD = 2000;
bool lastFireStatus = false;
const char* mqtt_topic_fire_publish = "sensor/fire";

const long BLINK_INTERVAL = 200;
unsigned long lastBlinkTime = 0; // Menyimpan waktu kedipan terakhir
bool ledState = LOW;

// Variabel aktif di RAM untuk menyimpan jadwal (format 24-jam)
int scheduleStartHour = 0;
int scheduleStartMinute = 0;
int scheduleEndHour = 0;
int scheduleEndMinute = 0;
bool manualSetting = false;

// PIN
const int lightSensorPin = 34;
const int fireSensorPin = 35;
const int lampFirePin = 19;
const int lampLightSensorPin = 18;
const int lampSchedulePin = 5;
const int lampManualPin = 4;

// Variabel untuk timer non-blocking (5 detik)
unsigned long lastMsg = 0;
const long interval = 5000;

// Inisialisasi objek RTC DS3231
RTC_DS3231 rtc;

// Handle untuk manajemen task parallel
TaskHandle_t rtcTaskHandle;

// 1. Konfigurasi Wi-Fi AP (ESP32 memancarkan Wi-Fi)
const char* ap_ssid = "Dashboard_IoT_Mandiri";
const char* ap_password = "Testing123";

// 2. Konfigurasi MQTT Broker (Menembak IP Laptop kamu di jaringan AP)
const char* mqtt_server = "192.168.4.2"; 
const int mqtt_port = 1883;
const char* mqtt_user = "testing";  // Username baru RabbitMQ
const char* mqtt_pass = "testing123";   // Password baru RabbitMQ

WiFiClient espClient;
PubSubClient client(espClient);

void lightSensor();
void fireSensor();
void setup_ap();
void reconnect();
void manualLampFunc(bool manualSetting);
// Deklarasi fungsi yang akan berjalan di Core 0
void rtcTaskCode(void * pvParameters);
void handleScheduleUpdate(byte* payload, unsigned int length);
void handleManualUpdate(byte* payload, unsigned int length);

// Fungsi callback (tetap dipasang jika sewaktu-waktu backend mengirim balik perintah balik)
void callback(char* topic, byte* payload, unsigned int length) {
  String currentTopic = String(topic);
  Serial.print("Pesan masuk [");
  Serial.print(topic);
  Serial.print("]: ");
  for (int i = 0; i < length; i++) {
    Serial.print((char)payload[i]);
  }
  Serial.println();

  if (currentTopic == "action/schedule") {
    handleScheduleUpdate(payload, length); // 👈 Panggil fungsi pemroses jadwal
  } else if (currentTopic == "action/manual") {
    handleManualUpdate(payload, length);
  }
  
}

void setup() {
  pinMode(lightSensorPin, INPUT);
  pinMode(fireSensorPin, INPUT);
  pinMode(lampFirePin, OUTPUT);
  pinMode(lampLightSensorPin, OUTPUT);
  pinMode(lampSchedulePin, OUTPUT);
  pinMode(lampManualPin, OUTPUT);
  digitalWrite(lampFirePin, LOW);
  digitalWrite(lampLightSensorPin, LOW);
  digitalWrite(lampSchedulePin, LOW);
  digitalWrite(lampManualPin, LOW);
  Serial.begin(115200);
  Wire.begin();

  // Membuka ruang penyimpanan bernama "iot_setting" dengan mode Read/Write (false)
  preferences.begin("iot_setting", false);

  // 📥 BACA DATA DARI MEMORI INTERNAL SAAT PERTAMA NYALA
  // Angka 0 dan 0 di belakang adalah nilai default jika memori masih kosong murni
  scheduleStartHour   = preferences.getInt("start_hour", 0);
  scheduleStartMinute = preferences.getInt("start_min", 0);
  scheduleEndHour     = preferences.getInt("end_hour", 0);
  scheduleEndMinute   = preferences.getInt("end_min", 0);
  manualSetting       = preferences.getBool("manual", false); 

  Serial.println("\n=============================================");
  Serial.println("[MEMORI INTERNAL] Berhasil Memuat Konfigurasi Lama:");
  Serial.printf("-> Jadwal Lampu Menyala: %02d:%02d\n", scheduleStartHour, scheduleStartMinute);
  Serial.printf("-> Jadwal Lampu Mati: %02d:%02d\n", scheduleEndHour, scheduleEndMinute);
  Serial.printf("-> Lampu Manual: %s\n", manualSetting ? "ON" : "OFF");
  Serial.println("=============================================");

  setup_ap();
  
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);

  // 🔥 MEMBUAT TASK PARALEL DI CORE 0
  xTaskCreatePinnedToCore(
    rtcTaskCode,        /* Nama fungsi yang menjalankan kode RTC */
    "BacaRTC_Task",     /* Nama Task (untuk debugging) */
    4096,               /* Alokasi memory stack (dalam bytes) */
    NULL,               /* Parameter yang dikirim ke task (NULL jika tidak ada) */
    1,                  /* Prioritas task (1 = Standar) */
    &rtcTaskHandle,     /* Pointer untuk menampung task handle */
    0                   /* 👈 PIN KODE INI KE CORE 0 */
  );

  if (!rtc.begin()) {
    Serial.println("❌ Modul RTC Tidak Terdeteksi!");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__))); // Sinkronisasi otomatis ke waktu laptop saat compile
    // while (1);
  }

  if (rtc.lostPower()) {
    Serial.println("⚠️ RTC kehilangan daya, menyetel waktu baru...");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__))); // Sinkronisasi otomatis ke waktu laptop saat compile
  }
}

void loop() {
  /// Pastikan koneksi MQTT tetap hidup
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  lightSensor();
  fireSensor();
  manualLampFunc(manualSetting);

  // Berikan sedikit jeda pembacaan agar kerja mikrokontroler lebih rileks
  delay(100);
}

void setup_ap() {
  delay(10);
  Serial.println("\n--- Mengaktifkan Access Point ---");
  WiFi.softAP(ap_ssid, ap_password);
  
  IPAddress myIP = WiFi.softAPIP();
  Serial.print("Wi-Fi Aktif! SSID: ");
  Serial.println(ap_ssid);
  Serial.print("IP Gateway ESP32: ");
  Serial.println(myIP);
}

void reconnect() {
  // Loop sampai ESP32 kembali terhubung ke RabbitMQ
  while (!client.connected()) {
    Serial.print("Mencoba koneksi MQTT ke RabbitMQ...");
    
    // Membuat Client ID acak agar tidak bentrok
    String clientId = "ESP32Client-LightSensor-" + String(random(0xffff), HEX);
    
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      client.subscribe("action/schedule"); 
      client.subscribe("action/manual");

      Serial.println("TERHUBUNG!");
    } else {
      Serial.print("GAGAL, rc=");
      Serial.print(client.state());
      Serial.println(" Mencoba lagi dalam 5 detik...");
      delay(5000);
    }
  }
}

void manualLampFunc(bool manualSetting) {
  if (manualSetting) {
    digitalWrite(lampManualPin, LOW);
  } else {
    digitalWrite(lampManualPin, HIGH);
  }
}

void lightSensor() {
  // Ambil data nilai sensor cahaya (bisa diganti analogRead(34) nanti)
  int analogReadSensor = analogRead(34);
  int luxValue = map(analogReadSensor, 0, 4095, 4095, 0);
  // Serial.println(luxValue);

  // Evaluasi kondisi saat ini
  bool currentDarkStatus = (luxValue < LDR_THRESHOLD);
  if (currentDarkStatus){
    digitalWrite(lampLightSensorPin, LOW);
  } else {
    digitalWrite(lampLightSensorPin, HIGH);
  }

  // Cek apakah terjadi PERUBAHAN kondisi dari deteksi sebelumnya
  if (currentDarkStatus != lastDarkStatus) {
    
    // Perbarui variabel global agar loop berikutnya tahu status terakhir
    lastDarkStatus = currentDarkStatus;

    // Bungkus data ke format JSON String
    String payload = "{\"lux\":" + String(luxValue) + ", \"isDark\":" + (currentDarkStatus ? "true" : "false") + "}";

    // Eksekusi kirim data ke RabbitMQ
    Serial.println("\n[⚠️ EVENT TRIGGER] Cahaya melewati ambang batas tertentu!");
    Serial.print("[MQTT PUBLISH] Mengirim ke ");
    Serial.print(mqtt_topic_light_publish);
    Serial.print(" -> ");
    Serial.println(payload);

    client.publish(mqtt_topic_light_publish, payload.c_str());
  }
}

void fireSensor() {
  int analogReadSensor = analogRead(35);

  bool currentFireStatus = (analogReadSensor < FIRE_THRESHOLD);

  if (currentFireStatus) {
    unsigned long currentMillis = millis();
    
    // Cek apakah sudah waktunya lampu berubah status berdasarkan frekuensi
    if (currentMillis - lastBlinkTime >= BLINK_INTERVAL) {
      lastBlinkTime = currentMillis; // Perbarui waktu terakhir
      
      ledState = !ledState; // Balik logika (Jika HIGH jadi LOW, jika LOW jadi HIGH)
      digitalWrite(lampFirePin, ledState); 
    }
  } else {
    // Jika kondisi aman (tidak ada api), pastikan lampu selalu mati
    if (ledState != LOW) {
      ledState = LOW;
      digitalWrite(lampFirePin, LOW);
    }
  }

  // Cek apakah terjadi PERUBAHAN kondisi dari deteksi sebelumnya
  if (currentFireStatus != lastFireStatus) {
    
    // Perbarui variabel global agar loop berikutnya tahu status terakhir
    lastFireStatus = currentFireStatus;

    // Bungkus data ke format JSON String
    String payload = "{\"fire_value\":" + String(analogReadSensor) + ", \"isFire\":" + (currentFireStatus ? "true" : "false") + "}";

    // Eksekusi kirim data ke RabbitMQ
    Serial.println("\n[⚠️ Warning] Terjadi Kebakaran atau tidak");
    Serial.print("[MQTT PUBLISH] Mengirim ke ");
    Serial.print(mqtt_topic_fire_publish);
    Serial.print(" -> ");
    Serial.println(payload);

    client.publish(mqtt_topic_fire_publish, payload.c_str());
  }
}

void rtcTaskCode(void * pvParameters) {
  Serial.print("[TASK] RTC Task berjalan di Core ID: ");
  Serial.println(xPortGetCoreID());

  for(;;) {
    DateTime now = rtc.now();
    
    // 1. Hitung total menit saat ini sejak jam 00:00
    int currentTotalMinutes = (now.hour() * 60) + now.minute();

    // 2. Hitung total menit waktu Mulai & waktu Selesai dari jadwal Web
    int startTotalMinutes   = (scheduleStartHour * 60) + scheduleStartMinute;
    int endTotalMinutes     = (scheduleEndHour * 60) + scheduleEndMinute;

    bool shouldBeOn = false;

    // 3. LOGIKA UTAMA: Cek rentang waktu (Menangani masalah lewati tengah malam)
    if (startTotalMinutes < endTotalMinutes) {
      // Skenario A: Jadwal normal di hari yang sama (Misal: 08:00 AM - 05:00 PM)
      if (currentTotalMinutes >= startTotalMinutes && currentTotalMinutes < endTotalMinutes) {
        shouldBeOn = true;
      }
    } else {
      // Skenario B: Jadwal melewati tengah malam (Misal: 06:00 PM - 05:00 AM)
      if (currentTotalMinutes >= startTotalMinutes || currentTotalMinutes < endTotalMinutes) {
        shouldBeOn = true;
      }
    }

    // 4. EKSEKUSI FISIK KE PIN LED / RELAY LAMP_PIN
    if (shouldBeOn) {
      digitalWrite(lampSchedulePin, LOW); // Menyalakan LED
    } else {
      digitalWrite(lampSchedulePin, HIGH);  // Mematikan LED
    }

    // 5. Cetak log indikator ke Serial Monitor (Core 0)
    Serial.printf("[WAKTU - CORE 0] %02d:%02d:%02d | Jadwal: %02d:%02d s/d %02d:%02d | LED: %s\n", 
                  now.hour(), now.minute(), now.second(),
                  scheduleStartHour, scheduleStartMinute, 
                  scheduleEndHour, scheduleEndMinute,
                  shouldBeOn ? "NYALA (ON)" : "MATI (OFF)");

    // Berikan jeda 1 detik agar tidak membebani prosesor Core 0
    vTaskDelay(1000 / portTICK_PERIOD_MS); 
  }
}

void handleScheduleUpdate(byte* payload, unsigned int length) {
  // Alokasikan memori untuk parsing JSON kompleks
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload, length);

  if (error) {
    Serial.printf("❌ Gagal parsing JSON Jadwal: %s\n", error.c_str());
    return;
  }

  // Ambil string waktu dari payload JSON
  const char* startTimeStr = doc["startTime"]; // Contoh: "06:00 PM"
  const char* endTimeStr = doc["endTime"];   // Contoh: "05:00 AM"

  if (startTimeStr == NULL || endTimeStr == NULL) {
    Serial.println("❌ Error: Parameter startTime atau endTime kosong!");
    return;
  }

  int startHour = 0, startMinute = 0;
  int endHour = 0, endMinute = 0;
  char startPeriod[3], endPeriod[3];

  // Konversi teks "06:00 PM" ke format 24-jam
  if (sscanf(startTimeStr, "%d:%d %2s", &startHour, &startMinute, startPeriod) == 3) {
    if (strcmp(startPeriod, "PM") == 0 && startHour < 12) startHour += 12;
    if (strcmp(startPeriod, "AM") == 0 && startHour == 12) startHour = 0;
  }

  // Konversi teks "05:00 AM" ke format 24-jam
  if (sscanf(endTimeStr, "%d:%d %2s", &endHour, &endMinute, endPeriod) == 3) {
    if (strcmp(endPeriod, "PM") == 0 && endHour < 12) endHour += 12;
    if (strcmp(endPeriod, "AM") == 0 && endHour == 12) endHour = 0;
  }

  // Update variabel aktif di RAM ESP32
  scheduleStartHour   = startHour;
  scheduleStartMinute = startMinute;
  scheduleEndHour     = endHour;
  scheduleEndMinute   = endMinute;

  Serial.println("=================================================");
  Serial.println("[RAM] Berhasil Mengonversi ke Format 24-Jam:");
  Serial.printf("-> Jam Mulai  : %02d:%02d\n", scheduleStartHour, scheduleStartMinute);
  Serial.printf("-> Jam Selesai: %02d:%02d\n", scheduleEndHour, scheduleEndMinute);
  Serial.println("=================================================");

  // 💾 SIMPAN PERMANEN KE MEMORI INTERNAL (NVS FLASH)
  preferences.putInt("start_hour", scheduleStartHour);
  preferences.putInt("start_min", scheduleStartMinute);
  preferences.putInt("end_hour", scheduleEndHour);
  preferences.putInt("end_min", scheduleEndMinute);

  Serial.println("[💾 MEMORI INTERNAL] Batas Waktu Baru Berhasil Dikunci!");
}

void handleManualUpdate(byte* payload, unsigned int length) {
  // Alokasikan memori untuk parsing JSON kompleks
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, payload, length);

  if (error) {
    Serial.printf("❌ Gagal parsing JSON: %s\n", error.c_str());
    return;
  }

  // Ambil string waktu dari payload JSON
  const char* statusLampStr = doc["status"];

  if (statusLampStr == NULL) {
    Serial.println("❌ Error: Parameter kosong!");
    return;
  }

  if (strcmp(statusLampStr, "ON") == 0) manualSetting = true;
  else if (strcmp(statusLampStr, "OFF") == 0) manualSetting = false;

  Serial.println("=================================================");
  Serial.println("[RAM] Menyimpan Status Manual Setting");
  Serial.printf("-> Lampu Manual: %s\n", manualSetting ? "ON" : "OFF");
  Serial.println("=================================================");

  // 💾 SIMPAN PERMANEN KE MEMORI INTERNAL (NVS FLASH)
  preferences.putInt("manual", manualSetting);

  Serial.println("[💾 MEMORI INTERNAL] Status Berhasil Dikunci!");
}