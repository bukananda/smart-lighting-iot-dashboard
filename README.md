Berikut adalah draf kode `README.md` yang dirancang agar terlihat sangat profesional, terstruktur, dan menarik. Berkas ini sudah disesuaikan dengan arsitektur *decoupled* (Frontend, Backend, Hardware) yang ideal untuk standar perlombaan besar seperti GEMASTIK.

Kamu tinggal menyalin seluruh kode di dalam kotak bawah ini dan menempelkannya ke file `README.md` proyekmu:

```markdown
# 💡 LuminaNode: Smart IoT Lighting & Emergency Dashboard
[![Tech Stack](https://img.shields.io/badge/Stack-Full--Stack%20IoT-orange.svg)](#-tech-stack)
[![Architecture](https://img.shields.io/badge/Architecture-Decoupled%20System-green.svg)](#-arsitektur-sistem)

**LuminaNode** adalah sistem purwarupa *Smart Lighting* berbasis IoT komprehensif yang mengintegrasikan pengendalian lampu jarak jauh (*controlling*), pemantauan intensitas cahaya secara *real-time* (*monitoring*), serta sistem mitigasi darurat kebakaran otomatis. 

Proyek ini dibangun menggunakan arsitektur modern standar industri (*Decoupled Architecture*) untuk memisahkan beban kerja komputasi perangkat keras dengan antarmuka pengguna, menjamin latensi rendah, serta memiliki fitur *fault tolerance* tingkat tinggi.

---

## ✨ Fitur Unggulan

* **⚡ Real-Time Bidirectional Data Flow**: Menggunakan kombinasi protokol **MQTT** untuk komunikasi *hardware* dan **WebSockets (Socket.io)** untuk pembaruan UI web secara instan tanpa *refresh* (*Zero Refresh*).
* **🕒 Custom Interactive Analog Clock Picker**: Fitur penjadwalan otomatis lampu menggunakan modul RTC fisik (**DS3231**) yang diatur secara interaktif melalui komponen jam analog kustom di sisi web.
* **🔒 State Persistence & Fault Tolerance**: Status sakelar kendali manual dan konfigurasi jam otomatis tersimpan ganda secara terpusat di **MongoDB Cloud (Atlas)** dan memori internal **ESP32 Non-Volatile Storage (NVS)** melalui `Preferences.h`. Data tidak akan hilang atau *reset* meskipun perangkat keras mati lampu atau halaman web dimuat ulang.
* **🧠 Edge Event-Driven Mitigation**: Sensor LDR dan sensor api diprogram menggunakan metode *State Change Detection* langsung di level *firmware* untuk membatasi *bandwidth spamming* ke server RabbitMQ.
* **🏎️ Pseudo-Parallel Processing**: Manajemen pembacaan data waktu RTC dan mitigasi sensor pada ESP32 berjalan secara asinkron (non-blocking) menggunakan metode `millis()` untuk menjaga stabilitas *keep-alive* koneksi MQTT.

---

## 🏗️ Arsitektur Sistem

Aliran data sistem dirancang secara terstruktur melewati 4 pos utama untuk menjamin isolasi data yang bersih:

```text
[ React UI / Browser ]  💻 (Frontend)
         ▲  ▼  (via Socket.io WebSockets - Port 5000)
[ Node.js Express Bridge ] 🧠 (Backend Server)
         ▲  ▼  (via Pure MQTT - Port 1883)
[ RabbitMQ Message Broker ] 📮 (Middleware)
         ▲  ▼  (via Wi-Fi Direct Access Point Mode)
[ ESP32 Microcontroller ] 🔌 (Hardware + Sensors)

```

---

## 🛠️ Tech Stack

### Frontend (User Interface)

| Teknologi | Kegunaan |
| --- | --- |
| **React.js (Vite)** | Framework SPA reaktif & modularisasi komponen UI |
| **Tailwind CSS** | Pustaka utilitas desain premium & *Dark Mode* adaptif |
| **Socket.io-Client** | Jalur pipa WebSockets penangkap semburan data dari server |

### Backend & Database (Server Side)

| Teknologi | Kegunaan |
| --- | --- |
| **Node.js (Express)** | *Gateway* utama penghubung protokol komunikasi web & IoT |
| **Socket.io** | Penyedia pipa komunikasi dua arah ke *frontend* |
| **MongoDB & Mongoose** | Penyimpanan terpusat profil status enkripsi & jadwal sakelar |
| **RabbitMQ** | *Message broker* / perantara antrean pesan berbasis MQTT |

### Hardware & Firmware (Perangkat Keras)

| Komponen / Library | Kegunaan |
| --- | --- |
| **ESP32 Dev Module** | Otak pemroses utama (*gateway network*) |
| **DS3231 RTC Module** | Penyedia data waktu presisi tinggi secara *offline* |
| **PubSubClient & ArduinoJson** | Pustaka parsing data JSON murni via MQTT Port 1883 |
| **Preferences.h** | Pengunci data ke dalam sektor *flash memory* internal |

---

## 📁 Struktur Folder

```text
iot-fullstack/
├── backend/               # Server Utama (Node.js Express)
│   ├── node_modules/
│   ├── server.js          # Logika Bridge Bridge MQTT & REST API
│   └── package.json
│
├── frontend/              # Antarmuka Dashboard (React.js)
│   ├── src/
│   │   ├── components/    # Potongan UI (Header, SensorCard, ClockModal)
│   │   ├── App.jsx        # Logika State & Handler Pusat UI
│   │   └── index.css      # Mantra konfigurasi Tailwind CSS
│   ├── tailwind.config.js
│   └── package.json
│
└── firmware/              # Kode Mikrokontroler (PlatformIO / Arduino)
    ├── src/
    │   └── main.cpp       # Program utama C++ ESP32
    └── platformio.ini     # Manajemen Lib otomatis (RTClib, ArduinoJson)

```

---

## 🚀 Memulai Instalasi

### 1. Persiapan Server & Database

1. Pastikan layanan **RabbitMQ** sudah aktif dan plugin `rabbitmq_mqtt` telah dinyalakan.
2. Siapkan *connection string* database **MongoDB** Anda (baik lokal maupun MongoDB Atlas Cloud).

### 2. Jalankan Backend (Node.js)

```bash
cd backend
npm install
# Buka server.js, sesuaikan MONGO_URI dengan password database Anda
node server.js

```

### 3. Jalankan Frontend (React.js)

```bash
cd frontend
npm install
npm run dev

```

Buka browser Anda di `http://localhost:5173` untuk melihat dashboard utama.

### 4. Upload Firmware (ESP32)

1. Buka folder `firmware` menggunakan **VS Code (PlatformIO)**.
2. Hubungkan ESP32 menggunakan kabel USB data.
3. Klik tombol **Upload (→)** pada *status bar* bawah PlatformIO.
4. Sambungkan Wi-Fi laptop Anda ke *Access Point* yang dipancarkan oleh ESP32 (SSID: `Dashboard_IoT_Mandiri`).

---

## 👥 Kontributor & Pengembang

* **Nama Anda** - *Hardware Specialist & Firmware Engineer* - [@username_kamu](https://www.google.com/search?q=https://github.com/username_kamu)
* **Nama Teman Tim** - *Fullstack Web Developer* - [@username_teman](https://www.google.com/search?q=https://github.com/username_teman)

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah **MIT License** - lihat berkas [LICENSE](https://www.google.com/search?q=LICENSE) untuk detail lebih lanjut.

```

---

### 💡 Tips Tambahan untuk Membuatnya Lebih Menarik:
1. **Tambahkan Screenshot:** Jika aplikasimu sudah berjalan, ambil *screenshot* tampilannya yang berlatar belakang gelap, simpan di dalam folder proyek, lalu panggil di bawah judul dengan tag `![Dashboard Preview](./screenshot-dashboard.png)`. Juri sangat menyukai visualisasi awal.
2. **Badge Tambahan:** Kamu bisa mengganti tulisan `username_kamu` di bagian bawah agar tautan menuju ke profil GitHub aslimu, yang akan meningkatkan nilai profesionalisme tim di mata juri GEMASTIK.

```