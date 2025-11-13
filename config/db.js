import mysql from "mysql2";

const db = mysql.createConnection({
  host: "localhost",
  user: "root",           // ganti sesuai username MySQL kamu
  password: "",           // ganti sesuai password MySQL kamu
  database: "tracer_study_sederhana" // <--- database dari SQL sebelumnya
});

db.connect((err) => {
  if (err) {
    console.error("❌ Error koneksi ke database:", err.message);
    console.error("💡 Pastikan MySQL server sudah berjalan!");
    console.error("💡 Periksa konfigurasi di config/db.js (host, user, password, database)");
    // Jangan throw error, biarkan aplikasi tetap berjalan
    // Aplikasi akan error saat route yang butuh database diakses
  } else {
    console.log("✅ Terhubung ke database tracer_study_sederhana");
  }
});

// Handle error saat koneksi terputus
db.on("error", (err) => {
  if (err.code === "PROTOCOL_CONNECTION_LOST") {
    console.error("❌ Koneksi database terputus. Mencoba reconnect...");
  } else {
    console.error("❌ Database error:", err);
  }
});

export default db;
