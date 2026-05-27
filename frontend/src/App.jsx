import { useState, useEffect } from 'react';
import { io } from 'socket.io-client'; // Import client Socket.io

// Hubungkan ke pipa server Node.js Backend di Port 5000
const BACKEND_URL = 'http://192.168.4.2:5000';
const socket = io(BACKEND_URL);

// 1. Fungsi mengubah string "06:30 PM" menjadi angka total menit dari jam 00:00 dini hari
const convertTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [time, period] = timeStr.split(" ");
  let [hours, minutes] = time.split(":").map(Number);
  
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  
  return hours * 60 + minutes;
};

// 2. Fungsi mengecek apakah waktu sekarang berada di dalam rentang jadwal nyala-mati
const checkIsTimeInRange = (startStr, endStr) => {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes(); // Menit berjalan saat ini
  const startMinutes = convertTimeToMinutes(startStr);
  const endMinutes = convertTimeToMinutes(endStr);

  if (startMinutes <= endMinutes) {
    // Jadwal normal (Contoh: 08:00 AM sampai 05:00 PM)
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Jadwal melewati tengah malam (Contoh: 06:00 PM sampai 06:00 AM)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
};

function App() {
  // 1. STATE REAKTIF (Otak Dashboard untuk Simulasi)
  const [isFire, setIsFire] = useState(false);       // false = AMAN, true = BAHAYA
  const [isDark, setIsDark] = useState(true);       // true = Gelap, false = Terang
  const [manualOverride, setManualOverride] = useState(false); // Toggle Switch Manual
  const [timestamp, setTimestamp] = useState('--:--:--');
  const [isServerConnected, setIsServerConnected] = useState(false);

  // State untuk menampung input jam otomatis
  const [jamNyala, setJamNyala] = useState("06:00 PM");
  const [jamMati, setJamMati] = useState("06:00 AM");
  // Tambahkan di baris setelah state jamMati kamu:
  const [isScheduleActive, setIsScheduleActive] = useState(false);

  // State pembantu khusus untuk Modal Jam Analog
  const [showClockModal, setShowClockModal] = useState(false);
  const [activeInput, setActiveInput] = useState(""); // mencatat "nyala" atau "mati"
  const [tempHour, setTempHour] = useState(6);
  const [tempMinute, setTempMinute] = useState(0);
  const [tempPeriod, setTempPeriod] = useState("PM");

  useEffect(() => {
    const timer = setInterval(() => {
      // Mengambil nilai jamNyala dan jamMati terbaru yang valid dari layar
      const isActive = checkIsTimeInRange(jamNyala, jamMati);
      setIsScheduleActive(isActive);
    }, 1000); // Melakukan pengecekan ulang setiap 1 detik sekali

    return () => {
      clearInterval(timer); // Bersihkan memori timer lama saat jam diubah
    };
  }, [jamNyala, jamMati]); // 🔥 WAJIB DIISI agar timer reaktif saat jadwal diubah!

  // 2. JALUR PIPA KONEKSI AUTOMATIS (Mendengarkan data Node.js)
  useEffect(() => {
    socket.on('connect', () => {
      setIsServerConnected(true);
      console.log("[SOCKET] Sukses terhubung ke server Node.js Bridge!");
    });

    socket.on('disconnect', () => {
      setIsServerConnected(false);
    });

    // Menangkap semburan data dari RabbitMQ yang diteruskan oleh Node.js
    socket.on('sensor-update', (response) => {
      console.log("[DATA MASUK]", response);
      setTimestamp(response.timestamp);

      // Otomatis ubah UI jika topik yang masuk sesuai data sensor
      if (response.topic === 'sensor.fire') {
        setIsFire(response.data.isFire); // Ekspektasi payload JSON: {"isFire": true/false}
      } else if (response.topic === 'sensor.light') {
        setIsDark(response.data.isDark); // Ekspektasi payload JSON: {"isDark": true/false}
      }
    });

    fetch(`${BACKEND_URL}/api/status`)
      .then(res => res.json())
      .then(data => {
        setManualOverride(data.manualOverride);
        setJamNyala(data.jamNyala);
        setJamMati(data.jamMati);
        setIsFire(data.fire);
        setIsDark(data.light);
      })
      .catch(err => console.error("Gagal sinkronisasi data server:", err));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('sensor-update');
    };
  }, []);

  // 2. SKEMA WARNA PREMIUM (Sesuai Foto Mockup)
  const colors = {
    bodyBg: '#121212',      // Hitam pekat dasar web
    cardBg: '#1a1a1a',      // Abu-abu gelap kontainer panel
    border: '#262626',      // Garis tepi tipis elegan
    textMain: '#ffffff',    // Teks putih utama
    textMuted: '#8e8e8e',   // Teks abu-abu keterangan
    green: '#22c55e',       // Hijau status AMAN / Connected
    red: '#ef4444',         // Merah status BAHAYA
    blueBtn: '#1d9bf0',     // Biru tombol simpan jadwal
    bulbOn: '#facc15',      // Kuning terang untuk lampu menyala
    bulbOff: '#444444'      // Abu-abu mati untuk lampu padam
  };

  // Fungsi untuk menangani klik Manual Override dan mencetak log
  const handleManualOverride = () => {
    const nextState = !manualOverride; // Menangkap status terbaru (kebalikan dari status saat ini)
    setManualOverride(nextState);      // Mengubah state React

    // Cetak pesan ke console.log berdasarkan kondisi terbaru
    if (nextState) {
      console.log(
        "%c[CONTROL] Manual Override dinyalakan (ON). Logika otomatisasi sensor diabaikan!", 
        "color: #1d9bf0; font-weight: bold; background-color: #1e293b; padding: 4px 8px; border-radius: 4px;"
      );
    } else {
      console.log(
        "%c[CONTROL] Manual Override dimatikan (OFF). Sistem kembali ke Mode Otomatis.", 
        "color: #8e8e8e; font-weight: bold; background-color: #1e293b; padding: 4px 8px; border-radius: 4px;"
      );
    }

    socket.emit('manual-control', {
      device: "Lampu Manual (Web)",
      status: nextState ? "ON" : "OFF", // Mengirimkan status riil setelah diklik
      timestamp: new Date().toLocaleTimeString()
    });

    // Kirim data terbaru ke server untuk diamankan di database
    fetch(`${BACKEND_URL}/api/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualOverride: nextState, jamNyala, jamMati, isFire, isDark})
    }).catch(err => console.error("Gagal menyimpan sakelar:", err));
  };

  const handleToggleFireSensor = () => {
    const nextState = !isFire; // Menangkap status terbaru (kebalikan dari status saat ini)
    setIsFire(nextState);      // Mengubah state React

    // Cetak pesan ke console.log berdasarkan kondisi terbaru (isFire)
    if (nextState) {
      console.log(
        "%c[SENSOR] Kebakaran! Terdeteksi indikasi API di dalam ruangan. Lampu Darurat otomatis ON!", 
        "color: #ef4444; font-weight: bold; background-color: #1e293b; padding: 4px 8px; border-radius: 4px;"
      );
      socket.emit('fire-control', {
        device: "Toggle Fire",
        action: "FIRE_ON",
        fire: true,
        triggeredBy: "Web Dashboard User",
        timestamp: new Date().toLocaleTimeString()
      });
    } else {
      console.log(
        "%c[SENSOR] Kondisi ruangan telah teratasi dan AMAN. Lampu Darurat otomatis OFF.", 
        "color: #22c55e; font-weight: bold; background-color: #1e293b; padding: 4px 8px; border-radius: 4px;"
      );
      socket.emit('fire-control', {
        device: "Toggle Fire",
        action: "FIRE_OFF",
        fire: false,
        triggeredBy: "Web Dashboard User",
        timestamp: new Date().toLocaleTimeString()
      });
    }

    // Kirim data terbaru ke server untuk diamankan di database
    fetch(`${BACKEND_URL}/api/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualOverride, jamNyala, jamMati, fire: nextState, isDark})
    }).catch(err => console.error("Gagal menyimpan sakelar:", err));
  };

  const handleToggleLightSensor = () => {
    const nextState = !isDark; // Menangkap status terbaru (kebalikan dari status saat ini)
    setIsDark(nextState);      // Mengubah state React

    // Cetak pesan ke console.log berdasarkan kondisi terbaru (isDark)
    if (nextState) {
      console.log(
        "%c[SENSOR] Lingkungan Luar: GELAP. Sistem otomatis memerintahkan Lampu Taman (LDR) untuk ON!", 
        "color: #facc15; font-weight: bold; background-color: #1e293b; padding: 4px 8px; border-radius: 4px;"
      );
      // Kirim payload jadwal ke Node.js Backend untuk diteruskan ke MQTT
      socket.emit('light-control', {
        device: "Toggle Light",
        action: "LIGHT_ON",
        light: true,
        triggeredBy: "Web Dashboard User",
        timestamp: new Date().toLocaleTimeString()
      });
    } else {
      console.log(
        "%c[SENSOR] Lingkungan Luar: TERANG. Sistem otomatis memerintahkan Lampu Taman (LDR) untuk OFF.", 
        "color: #94a3b8; font-weight: bold; background-color: #1e293b; padding: 4px 8px; border-radius: 4px;"
      );
      socket.emit('light-control', {
        device: "Toggle Light",
        action: "LIGHT_OFF",
        light: false,
        triggeredBy: "Web Dashboard User",
        timestamp: new Date().toLocaleTimeString()
      });
    }

    // Kirim data terbaru ke server untuk diamankan di database
    fetch(`${BACKEND_URL}/api/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualOverride, jamNyala, jamMati, isFire, light: nextState})
    }).catch(err => console.error("Gagal menyimpan sakelar:", err));
  };

  const handleSaveSchedule = (e) => {
    e.preventDefault();
    console.log(
      `%c[SCHEDULE] Memperbarui jadwal otomatis di hardware...`, 
      "color: #3b82f6; font-weight: bold; background-color: #1e293b; padding: 4px 8px; border-radius: 4px;"
    );
    console.log("-> Jam Nyala Baru:", jamNyala);
    console.log("-> Jam Mati Baru:", jamMati);

    // Kirim payload jadwal ke Node.js Backend untuk diteruskan ke MQTT
    socket.emit('schedule-control', {
      device: "Lampu Jadwal (RTC)",
      action: "UPDATE_RTC_SCHEDULE",
      startTime: jamNyala,   // Mengirim nilai dari state jamNyala
      endTime: jamMati,     // Mengirim nilai dari state jamMati
      triggeredBy: "Web Dashboard User",
      timestamp: new Date().toLocaleTimeString()
    });
    
    fetch(`${BACKEND_URL}/api/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualOverride, jamNyala, jamMati, isFire, isDark })
    })
    .then(() => alert("Jadwal Tersimpan"))
    .catch(err => console.error("Gagal menyimpan jadwal:", err));
  };

  // 1. Fungsi untuk membuka modal sesuai input yang diklik
  const openTimePicker = (target, currentVal) => {
    setActiveInput(target); // mencatat apakah yang diedit jam nyala atau mati
    
    // Pecah nilai string lama (ex: "06:15 PM") untuk dimasukkan ke roda jam analog
    try {
      const [time, period] = currentVal.split(" ");
      const [hour, minute] = time.split(":");
      setTempHour(parseInt(hour));
      setTempMinute(parseInt(minute));
      setTempPeriod(period);
    } catch (e) {
      // Default jika data awal gagal dipecah
      setTempHour(6);
      setTempMinute(0);
      setTempPeriod("PM");
    }
    setShowClockModal(true);
  };

  // 2. Fungsi untuk mengonversi hasil jam analog ke string AM/PM lalu menyimpannya
  const saveAnalogTime = () => {
    // Format agar angka di bawah 10 selalu punya awalan nol (ex: 6 jadi "06")
    const formattedHour = String(tempHour).padStart(2, '0');
    const formattedMinute = String(tempMinute).padStart(2, '0');
    const finalTimeResult = `${formattedHour}:${formattedMinute} ${tempPeriod}`;

    if (activeInput === "nyala") {
      setJamNyala(finalTimeResult);
    } else if (activeInput === "mati") {
      setJamMati(finalTimeResult);
    }
    
    setShowClockModal(false); // Tutup modal setelah disimpan
    console.log(`[CLOCK] Berhasil mengonversi ke format AM/PM: ${finalTimeResult}`);
  };

  return (
    <div style={{
      backgroundColor: colors.bodyBg,
      color: colors.textMain,
      minHeight: '100vh',
      padding: '30px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box'
    }}>
      
      {/* ================= HEADER UTAMA ================= */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '30px',
        borderBottom: `1px solid ${colors.border}`,
        paddingBottom: '15px'
      }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: '700', margin: 0, letterSpacing: '-0.5px' }}>
          IoT Smart Lighting Dashboard
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: colors.textMuted }}>
          RMQ Status: 
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: colors.green, fontWeight: '600' }}>
            <span style={{ width: '8px', height: '8px', backgroundColor: colors.green, borderRadius: '50%' }}></span>
            Connected
          </span>
        </div>
      </header>

      {/* ================= LAYOUT 3 KOLOM GRID ================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '24px',
        alignItems: 'start'
      }}>
        
        {/* ----------------- KOLOM 1: SENSOR & SIMULATOR ----------------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Card: Status Keamanan Ruangan */}
          <div style={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.border}`, padding: '24px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: colors.textMuted, fontSize: '0.85rem', marginBottom: '15px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z"/></svg>
              Status Keamanan Ruangan
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: '700', color: isFire ? colors.red : colors.green }}>
              {isFire ? 'BAHAYA API' : 'AMAN'}
            </div>
          </div>

          {/* Card: Intensitas Cahaya Luar */}
          <div style={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.border}`, padding: '24px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: colors.textMuted, fontSize: '0.85rem', marginBottom: '15px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              Intensitas Cahaya Luar
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: '700', color: colors.textMain }}>
              {isDark ? 'Gelap' : 'Terang'}
            </div>
          </div>

          {/* Panel: Demo Controls */}
          <div style={{ padding: '0 5px' }}>
            <div style={{ color: colors.textMuted, fontSize: '0.8rem', marginBottom: '12px' }}>Demo Controls:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                onClick={handleToggleFireSensor}
                style={{ backgroundColor: '#222', border: `1px solid ${colors.border}`, color: '#fff', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', transition: '0.2s' }}
              >
                Toggle Fire Sensor
              </button>
              <button 
                onClick={handleToggleLightSensor}
                style={{ backgroundColor: '#222', border: `1px solid ${colors.border}`, color: '#fff', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', transition: '0.2s' }}
              >
                Toggle Light Sensor
              </button>
            </div>
          </div>
        </div>

        {/* ----------------- KOLOM 2: CONTROLS & JADWAL ----------------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Card: Manual Override */}
          <div style={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.border}`, padding: '24px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', width: '100%' }}>
              <div style={{ flexGrow: 1 }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem', fontWeight: '600' }}>Manual Override</h3>
                <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>Kendali langsung untuk Lampu Manual</p>
                <p style={{ margin: '8px 0 0 0', color: colors.textMuted, fontSize: '0.8rem' }}>Status saat ini: <span style={{color: manualOverride ? colors.blueBtn : colors.textMuted, fontWeight: 'bold'}}>{manualOverride ? 'ON' : 'OFF'}</span></p>
              </div>
              
              {/* Toggle Switch */}
              <div 
                onClick={handleManualOverride}
                style={{
                  width: '50px',
                  height: '26px',
                  backgroundColor: manualOverride ? colors.blueBtn : '#444',
                  borderRadius: '13px',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
              >
                <div style={{
                  width: '20px',
                  height: '20px',
                  backgroundColor: '#fff',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '3px',
                  left: manualOverride ? '27px' : '3px',
                  transition: 'left 0.2s'
                }} />
              </div>
            </div>
          </div>

          {/* Card: Jadwal Lampu Otomatis */}
          <div style={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.border}`, padding: '24px', borderRadius: '14px' }}>
            <h3 style={{ margin: '0 0 18px 0', fontSize: '1rem', fontWeight: '600' }}>Jadwal Lampu Otomatis</h3>
            
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: colors.textMuted, fontSize: '0.8rem', marginBottom: '8px' }}>Jam Nyala</label>
                <div 
                  onClick={() => openTimePicker("nyala", jamNyala)} // <-- Pemicu modal
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111', border: `1px solid ${colors.border}`, borderRadius: '8px', padding: '12px 14px', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: '0.95rem', fontWeight: '500' }}>{jamNyala}</span>
                  <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>🕒</span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: colors.textMuted, fontSize: '0.8rem', marginBottom: '8px' }}>Jam Mati</label>
                <div 
                  onClick={() => openTimePicker("mati", jamMati)} // <-- Pemicu modal
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111', border: `1px solid ${colors.border}`, borderRadius: '8px', padding: '12px 14px', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: '0.95rem', fontWeight: '500' }}>{jamMati}</span>
                  <span style={{ color: colors.textMuted, fontSize: '0.85rem' }}>🕒</span>
                </div>
              </div>
            </div>

            <button 
            onClick={handleSaveSchedule}
            style={{
              width: '100%',
              backgroundColor: colors.blueBtn,
              color: '#fff',
              border: 'none',
              padding: '12px',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}>
              Simpan Jadwal
            </button>
          </div>
        </div>

        {/* ----------------- KOLOM 3: STATUS LAMPU REAL-TIME ----------------- */}
        <div style={{ backgroundColor: colors.cardBg, border: `1px solid ${colors.border}`, padding: '24px', borderRadius: '14px', minHeight: '340px' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: '600' }}>Status Lampu Real-time</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Lampu 1: Lampu Darurat (Menyala otomatis jika ada indikasi kebakaran/Api) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #222' }}>
              <span style={{ fontSize: '0.95rem', color: isFire ? '#fff' : colors.textMuted }}>Lampu Darurat</span>
              <BulbIcon isOn={isFire} color={colors.bulbOn} offColor={colors.bulbOff} />
            </div>

            {/* Lampu 2: Lampu Taman (LDR) (Menyala otomatis jika di luar Gelap, kecuali di-override) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #222' }}>
              <span style={{ fontSize: '0.95rem', color: (isDark) ? '#fff' : colors.textMuted }}>Lampu Taman (LDR)</span>
              <BulbIcon isOn={isDark} color={colors.bulbOn} offColor={colors.bulbOff} />
            </div>

            {/* Lampu 3: Lampu Jadwal (RTC) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid #222' }}>
              <span style={{ fontSize: '0.95rem', color: isScheduleActive ? '#fff' : colors.textMuted }}>Lampu Jadwal (RTC)</span>
              <BulbIcon isOn={isScheduleActive} color={colors.bulbOn} offColor={colors.bulbOff} />
            </div>

            {/* Lampu 4: Lampu Manual (Web) (Mengikuti sakelar Manual Override di kolom tengah) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.95rem', color: manualOverride ? '#fff' : colors.textMuted }}>Lampu Manual (Web)</span>
              <BulbIcon isOn={manualOverride} color={colors.bulbOn} offColor={colors.bulbOff} />
            </div>

          </div>
        </div>

      </div>
      {showClockModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: '#1a1a1a', border: `1px solid ${colors.border}`, padding: '30px', borderRadius: '16px', width: '320px', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
            
            <h4 style={{ margin: '0 0 5px 0', fontSize: '1.1rem' }}>Atur Waktu Lampu</h4>
            <p style={{ margin: '0 0 20px 0', color: colors.textMuted, fontSize: '0.85rem' }}>Mengubah pengaturan untuk Jam {activeInput === 'nyala' ? 'Nyala' : 'Mati'}</p>

            {/* AREA UTAMA: LINGKARAN JAM ANALOG */}
            <div style={{ width: '200px', height: '200px', backgroundColor: '#111', borderRadius: '50%', margin: '0 auto 25px auto', position: 'relative', border: '2px solid #262626' }}>
              
              {/* Titik Poros Tengah Jam */}
              <div style={{ width: '8px', height: '8px', backgroundColor: colors.blueBtn, borderRadius: '50%', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 5 }} />

              {/* JARUM JAM (Berputar otomatis berdasarkan State tempHour & tempMinute) */}
              <div style={{
                width: '4px', height: '50px', backgroundColor: '#fff', position: 'absolute', bottom: '50%', left: 'calc(50% - 2px)', borderRadius: '4px',
                transformOrigin: 'bottom center',
                transform: `rotate(${(tempHour % 12) * 30 + tempMinute * 0.5}deg)`,
                transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }} />

              {/* JARUM MENIT (Berputar otomatis berdasarkan State tempMinute) */}
              <div style={{
                width: '2px', height: '75px', backgroundColor: colors.blueBtn, position: 'absolute', bottom: '50%', left: 'calc(50% - 1px)', borderRadius: '2px',
                transformOrigin: 'bottom center',
                transform: `rotate(${tempMinute * 6}deg)`,
                transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }} />

              {/* ME-RENDER ANGKA 1-12 SECARA MATEMATIS DI SEKELILING LINGKARAN */}
              {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((num) => {
                const angle = (num * 30) * (Math.PI / 180);
                const x = 90 + 72 * Math.sin(angle);
                const y = 90 - 72 * Math.cos(angle);
                const isSelected = tempHour === num;
                return (
                  <button
                    key={num}
                    onClick={() => setTempHour(num)}
                    style={{
                      position: 'absolute', left: `${x}px`, top: `${y}px`, width: '22px', height: '22px', background: isSelected ? colors.blueBtn : 'none',
                      border: 'none', color: isSelected ? '#fff' : '#666', borderRadius: '50%', fontSize: '0.75rem', fontWeight: isSelected ? 'bold' : 'normal',
                      cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center'
                    }}
                  >
                    {num}
                  </button>
                );
              })}
            </div>

            {/* SLIDER INTERAKTIF UNTUK MENYESUAIKAN MENIT */}
            <div style={{ marginBottom: '20px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '5px' }}>
                <span style={{ color: colors.textMuted }}>Menit:</span>
                <strong style={{ color: colors.blueBtn }}>{String(tempMinute).padStart(2, '0')} Menit</strong>
              </div>
              <input 
                type="range" min="0" max="59" value={tempMinute} 
                onChange={(e) => setTempMinute(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: colors.blueBtn, cursor: 'pointer' }}
              />
            </div>

            {/* PILIHAN FORMAT: AM / PM */}
            <div style={{ display: 'flex', backgroundColor: '#111', padding: '4px', borderRadius: '8px', marginBottom: '25px', border: '1px solid #262626' }}>
              <button onClick={() => setTempPeriod("AM")} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', backgroundColor: tempPeriod === 'AM' ? '#222' : 'transparent', color: tempPeriod === 'AM' ? '#fff' : '#555' }}>AM (Pagi)</button>
              <button onClick={() => setTempPeriod("PM")} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', backgroundColor: tempPeriod === 'PM' ? '#222' : 'transparent', color: tempPeriod === 'PM' ? '#fff' : '#555' }}>PM (Malam)</button>
            </div>

            {/* AKSI TOMBOL MODAL */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowClockModal(false)} style={{ flex: 1, backgroundColor: 'transparent', border: '1px solid #333', color: colors.textMuted, padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>Batal</button>
              <button onClick={saveAnalogTime} style={{ flex: 1, backgroundColor: colors.blueBtn, border: 'none', color: '#fff', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>OK</button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// 3. KOMPONEN KECIL: RENDERING GRAPHIC BULB LAMPU (SVG) WITH GLOW EFFECT
function BulbIcon({ isOn, color, offColor }) {
  return (
    <svg 
      width="22" 
      height="22" 
      viewBox="0 0 24 24" 
      fill={isOn ? color : "none"} 
      stroke={isOn ? color : offColor} 
      strokeWidth="2"
      style={{
        filter: isOn ? `drop-shadow(0 0 6px ${color})` : 'none',
        transition: 'all 0.3s ease'
      }}
    >
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .6 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  );
}

export default App;