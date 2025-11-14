import express from "express";
import db from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.get("/", (req, res) => {
  // Redirect root path to login
  res.redirect("/login");
});

// Helper function untuk memastikan tabel settings ada (sama seperti di dashboard)
async function ensureSettingsTable() {
  try {
    await db.promise().execute(`
      CREATE TABLE IF NOT EXISTS dashboard_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Inisialisasi total alumni jika belum ada
    const [existing] = await db.promise().execute(
      "SELECT * FROM dashboard_settings WHERE setting_key = 'total_alumni'"
    );
    
    if (existing.length === 0) {
      // Jika belum ada, ambil dari COUNT alumni sebagai default
      const [countResult] = await db.promise().query(`SELECT COUNT(*) AS total FROM alumni`);
      const defaultTotal = countResult[0]?.total || 0;
      await db.promise().execute(
        "INSERT INTO dashboard_settings (setting_key, setting_value) VALUES ('total_alumni', ?)",
        [defaultTotal.toString()]
      );
    }
  } catch (error) {
    console.error("Error creating dashboard_settings table:", error);
    throw error;
  }
}

// Route untuk halaman riwayat capaian
router.get("/riwayat", requireAuth, async (req, res) => {
  try {
    // Pastikan tabel settings ada
    await ensureSettingsTable();

    // Query menggunakan rumus yang sama dengan dashboard: (Jumlah Responden / Total Alumni) × 100%
    // Menggunakan tabel responden (bukan jawaban_opsi) dan jumlah_input dari prodi
    // Menghitung capaian per prodi secara keseluruhan (sama seperti dashboard)
    const capaianQuery = `
      SELECT 
        f.nama AS fakultas, 
        p.nama AS prodi, 
        ROUND(
          COALESCE(
            (SELECT COUNT(*) FROM responden r WHERE r.prodiId = p.id), 
            0
          ) * 100.0 / 
          NULLIF(
            COALESCE(p.jumlah_input, (SELECT COUNT(*) FROM alumni a2 WHERE a2.prodiId = p.id), 0), 
            0
          ), 
          2
        ) AS capaian_rata,
        COALESCE(p.jumlah_input, (SELECT COUNT(*) FROM alumni a3 WHERE a3.prodiId = p.id), 0) AS jumlah_alumni,
        MIN(a.tahun_lulus) AS tahun_lulus
      FROM prodi p
      JOIN fakultas f ON p.fakultasId = f.id
      LEFT JOIN alumni a ON a.prodiId = p.id
      GROUP BY f.nama, p.nama, p.id, p.jumlah_input
      ORDER BY f.nama, p.nama;
    `;

    const tahunQuery = `
      SELECT DISTINCT tahun_lulus 
      FROM alumni 
      WHERE tahun_lulus IS NOT NULL 
      ORDER BY tahun_lulus DESC;
    `;

    // Query untuk mengambil semua fakultas yang ada di database
    const fakultasQuery = `
      SELECT DISTINCT nama 
      FROM fakultas 
      ORDER BY nama;
    `;

    // Query untuk mengambil semua opsi status jawaban
    const opsiQuery = `
      SELECT teks_opsi 
      FROM opsi_jawaban
      ORDER BY teks_opsi;
    `;

    // Ambil total alumni dari settings (sama seperti dashboard)
    const [settingsResult] = await db.promise().execute(
      "SELECT setting_value FROM dashboard_settings WHERE setting_key = 'total_alumni'"
    );
    const totalAlumni = settingsResult.length > 0 ? parseInt(settingsResult[0].setting_value) || 0 : 0;

    // Hitung total responden (sama seperti dashboard) - menggunakan tabel responden
    const [respondenResult] = await db.promise().query(
      `SELECT COUNT(*) AS total FROM responden`
    );
    const totalResponden = respondenResult[0]?.total || 0;

    // Hitung rata-rata capaian IKU (sama seperti dashboard): (Total Responden / Total Alumni Manual) × 100%
    const avgAchievement = totalAlumni > 0 
      ? ((totalResponden * 100.0) / totalAlumni).toFixed(2)
      : 0;

    db.query(capaianQuery, (err, results) => {
      if (err) throw err;

      db.query(tahunQuery, (err2, tahunResults) => {
        if (err2) throw err2;

        db.query(fakultasQuery, (err3, fakultasResults) => {
          if (err3) throw err3;

          db.query(opsiQuery, (err4, opsiResults) => {
            if (err4) throw err4;

            const totalProdi = new Set(results.map((item) => item.prodi)).size;
            const totalFakultas = new Set(results.map((item) => item.fakultas)).size;

            res.render("index", {
              data: results,
              tahunList: tahunResults.map((t) => t.tahun_lulus),
              fakultasList: fakultasResults.map((f) => f.nama),
              opsiList: opsiResults.map((o) => o.teks_opsi),
              stats: { totalAlumni, avgAchievement, totalProdi, totalFakultas },
            });
          });
        });
      });
    });
  } catch (error) {
    console.error("❌ Error di route /riwayat:", error);
    res.status(500).send("Error loading riwayat page: " + error.message);
  }
});

// API untuk refresh data (tanpa reload)
router.get("/api/data", requireAuth, async (req, res) => {
  try {
    // Pastikan tabel settings ada
    await ensureSettingsTable();

    // Query menggunakan rumus yang sama dengan dashboard: (Jumlah Responden / Total Alumni) × 100%
    // Menggunakan tabel responden (bukan jawaban_opsi) dan jumlah_input dari prodi
    // Menghitung capaian per prodi secara keseluruhan (sama seperti dashboard)
    const sql = `
      SELECT 
        f.nama AS fakultas, 
        p.nama AS prodi, 
        ROUND(
          COALESCE(
            (SELECT COUNT(*) FROM responden r WHERE r.prodiId = p.id), 
            0
          ) * 100.0 / 
          NULLIF(
            COALESCE(p.jumlah_input, (SELECT COUNT(*) FROM alumni a2 WHERE a2.prodiId = p.id), 0), 
            0
          ), 
          2
        ) AS capaian_rata,
        COALESCE(p.jumlah_input, (SELECT COUNT(*) FROM alumni a3 WHERE a3.prodiId = p.id), 0) AS jumlah_alumni,
        MIN(a.tahun_lulus) AS tahun_lulus
      FROM prodi p
      JOIN fakultas f ON p.fakultasId = f.id
      LEFT JOIN alumni a ON a.prodiId = p.id
      GROUP BY f.nama, p.nama, p.id, p.jumlah_input
      ORDER BY f.nama, p.nama;
    `;

    // Ambil total alumni dari settings (sama seperti dashboard)
    const [settingsResult] = await db.promise().execute(
      "SELECT setting_value FROM dashboard_settings WHERE setting_key = 'total_alumni'"
    );
    const totalAlumni = settingsResult.length > 0 ? parseInt(settingsResult[0].setting_value) || 0 : 0;

    // Hitung total responden (sama seperti dashboard) - menggunakan tabel responden
    const [respondenResult] = await db.promise().query(
      `SELECT COUNT(*) AS total FROM responden`
    );
    const totalResponden = respondenResult[0]?.total || 0;

    // Hitung rata-rata capaian IKU (sama seperti dashboard): (Total Responden / Total Alumni Manual) × 100%
    const avgAchievement = totalAlumni > 0 
      ? ((totalResponden * 100.0) / totalAlumni).toFixed(2)
      : 0;

    // Hitung total prodi dan fakultas
    db.query(sql, (err, results) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      
      const totalProdi = new Set(results.map((item) => item.prodi)).size;
      const totalFakultas = new Set(results.map((item) => item.fakultas)).size;

      res.json({ 
        success: true, 
        data: results,
        stats: {
          totalAlumni,
          avgAchievement: parseFloat(avgAchievement),
          totalProdi,
          totalFakultas
        }
      });
    });
  } catch (error) {
    console.error("❌ Error di API /api/data:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
