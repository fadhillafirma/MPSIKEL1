import express from "express";
import db from "../config/db.js";

const router = express.Router();

router.get("/", (req, res) => {
  // Redirect root path to dashboard
  res.redirect("/dashboard");
});

// Route untuk halaman riwayat capaian
router.get("/riwayat", (req, res) => {
  const capaianQuery = `
    SELECT 
      f.nama AS fakultas, 
      p.nama AS prodi, 
      ROUND(AVG(o.nilai), 2) AS capaian_rata,
      COUNT(DISTINCT a.id) AS jumlah_alumni,
      a.tahun_lulus
    FROM alumni a
    JOIN prodi p ON a.prodiId = p.id
    JOIN fakultas f ON p.fakultasId = f.id
    LEFT JOIN jawaban_opsi jo ON jo.alumniId = a.id
    LEFT JOIN opsi_jawaban o ON o.id = jo.opsiJawabanId
    LEFT JOIN jawaban j ON j.jawabanOpsiId = jo.id
    GROUP BY f.nama, p.nama, a.tahun_lulus
    ORDER BY a.tahun_lulus DESC, f.nama, p.nama;
  `;

  const tahunQuery = `
    SELECT DISTINCT tahun_lulus 
    FROM alumni 
    WHERE tahun_lulus IS NOT NULL 
    ORDER BY tahun_lulus DESC;
  `;

  db.query(capaianQuery, (err, results) => {
    if (err) throw err;

    db.query(tahunQuery, (err2, tahunResults) => {
      if (err2) throw err2;

      const totalAlumni = results.reduce((sum, item) => sum + (item.jumlah_alumni || 0), 0);
      const avgAchievement =
        results.length > 0
          ? (
              results.reduce((sum, item) => sum + parseFloat(item.capaian_rata || 0), 0) /
              results.length
            ).toFixed(1)
          : 0;
      const totalProdi = new Set(results.map((item) => item.prodi)).size;
      const totalFakultas = new Set(results.map((item) => item.fakultas)).size;

      res.render("index", {
        data: results,
        tahunList: tahunResults.map((t) => t.tahun_lulus),
        stats: { totalAlumni, avgAchievement, totalProdi, totalFakultas },
      });
    });
  });
});

// API untuk refresh data (tanpa reload)
router.get("/api/data", (req, res) => {
  const sql = `
    SELECT 
      f.nama AS fakultas, 
      p.nama AS prodi, 
      ROUND(AVG(o.nilai), 2) AS capaian_rata,
      COUNT(DISTINCT a.id) AS jumlah_alumni,
      a.tahun_lulus
    FROM alumni a
    JOIN prodi p ON a.prodiId = p.id
    JOIN fakultas f ON p.fakultasId = f.id
    LEFT JOIN jawaban_opsi jo ON jo.alumniId = a.id
    LEFT JOIN opsi_jawaban o ON o.id = jo.opsiJawabanId
    LEFT JOIN jawaban j ON j.jawabanOpsiId = jo.id
    GROUP BY f.nama, p.nama, a.tahun_lulus
    ORDER BY a.tahun_lulus DESC, f.nama, p.nama;
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, data: results });
  });
});

export default router;
