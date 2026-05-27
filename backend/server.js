const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mqtt = require('mqtt');
const mongoose = require('mongoose');

const MONGO_URI = "mongodb://127.0.0.1:27017/iot_dashboard";
mongoose.connect(MONGO_URI)
  .then(() => console.log("🔥 Sukses Terhubung ke MongoDB Cloud!"))
  .catch(err => console.error("❌ Gagal Konek Database:", err));

const DashboardSchema = new mongoose.Schema({
  idName: { type: String, default: "smart_lighting" }, // Kunci data agar tidak tertukar
  manualOverride: { type: Boolean, default: false },
  jamNyala: { type: String, default: "06:00 PM" },
  jamMati: { type: String, default: "06:00 AM" },
  fire: { type: Boolean, default: false},
  light: { type: Boolean, default: false}
});

const Dashboard = mongoose.model('Dashboard', DashboardSchema);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://192.168.4.2:5173"],
    methods: ["GET", "POST"]
  }
});

// 3. ENDPOINT API: Ambil status terakhir dari MongoDB
app.get('/api/status', async (req, res) => {
  try {
    // Cari data dashboard di database, jika tidak ada, buat baru
    let status = await Dashboard.findOne({ idName: "smart_lighting" });
    if (!status) {
      status = await Dashboard.create({});
    }
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: "Eror mengambil data" });
  }
});

// 4. ENDPOINT API: Simpan/Ubah status baru ke MongoDB
app.post('/api/status', async (req, res) => {
  try {
    const { manualOverride, jamNyala, jamMati } = req.body;
    
    // Cari data lama dan tindih/update dengan data baru yang dikirim React
    const statusTerupdate = await Dashboard.findOneAndUpdate(
      { idName: "smart_lighting" },
      { manualOverride, jamNyala, jamMati },
      { returnDocument: true, upsert: true } // Jika belum ada datanya, otomatis buat baru
    );
    
    res.json(statusTerupdate);
  } catch (error) {
    res.status(500).json({ message: "Eror menyimpan data" });
  }
});

const PORT = 5000;
// Alamat broker MQTT (Ganti dengan IP Broker jika memakai Mosquitto di Raspberry Pi/VPS)
const MQTT_BROKER_URL = 'mqtt://localhost:1883'; 

// --- 1. KONEKSI KE BROKER MQTT ---
const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
username: 'testing', // 👈 Masukkan username RabbitMQ baru di sini
  password: 'testing123',  // 👈 Masukkan password RabbitMQ baru di sini
  keepalive: 60,
  reconnectPeriod: 5000 // Otomatis menyambung kembali tiap 5 detik jika broker down
});

mqttClient.on('connect', () => {
  console.log(`===============================================================`);
  console.log(`[MQTT] Sukses Terhubung ke Broker! URL: ${MQTT_BROKER_URL}`);
  console.log(`===============================================================`);
  
  // Berlangganan ke topik sensor menggunakan Wildcard MQTT (sensor/#)
  mqttClient.subscribe('sensor/#', (err) => {
    if (!err) {
      console.log(`[MQTT] Sukses Subscribe ke topik: sensor/#`);
    }
  });
});

// --- 2. MENERIMA DATA DARI HARDWARE (SUBSCRIBE) & DILEMPAR KE REACT ---
mqttClient.on('message', async (topic, message) => {
  console.log(`[MQTT RECEIVE] Topik: ${topic} -> Payload: ${message.toString()}`);
  
  try {
    const payloadParsed = JSON.parse(message.toString());
    
    // Konversi topik MQTT (sensor/fire) menjadi format dot (sensor.fire) 
    // agar cocok dengan file App.jsx React kamu tanpa perlu mengubah kodenya.
    const normalizedTopic = topic.replace('/', '.');

    // Backend yang langsung menyimpan ke MongoDB begitu dapet data dari ESP32!
    let sensorUpdate = {};
    if (normalizedTopic === 'sensor.fire') sensorUpdate.fire = payloadParsed.isFire;
    if (normalizedTopic === 'sensor.light') sensorUpdate.light = payloadParsed.isDark;

    if (Object.keys(sensorUpdate).length > 0) {
      await Dashboard.findOneAndUpdate({ idName: "smart_lighting" }, sensorUpdate, { upsert: true });
    }

    // Semburkan ke React lewat Socket.io
    io.emit('sensor-update', {
      topic: normalizedTopic,
      data: payloadParsed,
      timestamp: new Date().toLocaleTimeString()
    });

  } catch (error) {
    console.error("[ERROR] Gagal memproses payload MQTT. Pastikan formatnya JSON murni.");
  }
});

mqttClient.on('error', (err) => {
  console.error('[MQTT ERROR] Terjadi kendala koneksi:', err.message);
});


// --- 3. MENERIMA PERINTAH WEB UI & DILEMPAR KE HARDWARE (PUBLISH) ---
io.on('connection', (socket) => {
  console.log(`[SOCKET.IO] Frontend Dashboard terhubung: ID (${socket.id})`);

  // Mendengarkan ketukan tombol Manual Override dari React
  socket.on('manual-control', async (payload) => {
    console.log(`\n[SOCKET.IO RECEIVE] Menerima perintah dari Web UI:`, payload);
    try {
      const isOverrideOn = payload.status === "ON";
      // 💾 AMANKAN KE DATABASE MONGODB DULU
      await Dashboard.findOneAndUpdate(
        { idName: "smart_lighting" },
        { manualOverride: isOverrideOn }, // Menyesuaikan payload true/false kamu
        { upsert: true }
      );

      // 🚀 BARU DI-PUBLISH KE HARDWARE VIA MQTT
      const mqttTopic = 'action/manual';
      mqttClient.publish(mqttTopic, JSON.stringify(payload), { qos: 1 });
      console.log(`[DATABASE & MQTT] Status Manual disimpan & dipublikasikan.`);
    } catch (err) {
      console.error("Gagal memproses kendali manual:", err);
    }
  });

    // Mendengarkan ketukan tombol Manual Override dari React
  socket.on('schedule-control', async (payload) => {
    console.log(`\n[SOCKET.IO RECEIVE] Menerima perintah dari Web UI:`, payload);
    try {
      // 💾 AMANKAN JAM BARU KE DATABASE MONGODB DULU
      await Dashboard.findOneAndUpdate(
        { idName: "smart_lighting" },
        { jamNyala: payload.startTime, jamMati: payload.endTime },
        { upsert: true }
      );

      const mqttTopic = 'action/schedule';
      mqttClient.publish(mqttTopic, JSON.stringify(payload), { qos: 1 });
      console.log(`[DATABASE & MQTT] Jadwal baru disimpan & dipublikasikan.`);
    } catch (err) {
      console.error("Gagal memproses jadwal:", err);
    }
  });

        // Mendengarkan ketukan tombol Manual Override dari React
  socket.on('fire-control', async (payload) => {
    
    console.log(`\n[SOCKET.IO RECEIVE] Menerima perintah dari Web UI:`, payload);
    try {
      // 💾 AMANKAN JAM BARU KE DATABASE MONGODB DULU
      await Dashboard.findOneAndUpdate(
        { idName: "smart_lighting" },
        { fire: payload.fire },
        { upsert: true }
      );
      const mqttTopic = 'action/fire'; // Topik standar MQTT menggunakan garis miring
      const mqttMessage = JSON.stringify(payload);

      // Publish data ke broker MQTT agar bisa dibaca ESP32/Relay Lampu fisik
      mqttClient.publish(mqttTopic, mqttMessage, { qos: 1 });
    } catch (err) {
      console.log(`[MQTT PUBLISH] Sukses mempublikasikan perintah ke topik: '${mqttTopic}'`)
    };
  });

  // Mendengarkan ketukan tombol Manual Override dari React
  socket.on('light-control', async (payload) => {
    console.log(`\n[SOCKET.IO RECEIVE] Menerima perintah dari Web UI:`, payload);
    try {
      // 💾 AMANKAN JAM BARU KE DATABASE MONGODB DULU
      await Dashboard.findOneAndUpdate(
        { idName: "smart_lighting" },
        { light: payload.light },
        { upsert: true }
      );
      const mqttTopic = 'action/light'; // Topik standar MQTT menggunakan garis miring
      const mqttMessage = JSON.stringify(payload);

      // Publish data ke broker MQTT agar bisa dibaca ESP32/Relay Lampu fisik
      mqttClient.publish(mqttTopic, mqttMessage, { qos: 1 });
    } catch (err) {
      console.log(`[MQTT PUBLISH] Sukses mempublikasikan perintah ke topik: '${mqttTopic}'`)
    };
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET.IO] Frontend Dashboard terputus.`);
  });
});

server.listen(PORT, () => {
  console.log(`[SERVER RUNNING] Backend Bridge MQTT berjalan di http://localhost:${PORT}`);
});