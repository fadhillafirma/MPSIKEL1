import express from "express";
import db from "../config/db.js";

const router = express.Router();

// 🟢 Route: GET /dashboard
router.get("/", async (req, res) => {
  try {
    // Grafik 1️⃣: Distribusi Status Alumni (Bekerja, Wirausaha, Pendidikan, Belum Bekerja)
    const [status] = await db.promise().query(`
      SELECT oj.teks_opsi AS status, COUNT(jo.id) AS jumlah
      FROM jawaban_opsi jo
      JOIN opsi_jawaban oj ON jo.opsiJawabanId = oj.id
      GROUP BY oj.teks_opsi
    `);

    // Grafik 2️⃣: Rata-rata Capaian IKU per Fakultas
    const [capaianFakultas] = await db.promise().query(`
      SELECT 
        f.nama AS fakultas,
        ROUND(AVG(oj.nilai),2) AS rata_capaian
      FROM jawaban_opsi jo
      JOIN opsi_jawaban oj ON jo.opsiJawabanId = oj.id
      JOIN alumni a ON jo.alumniId = a.id
      JOIN prodi p ON a.prodiId = p.id
      JOIN fakultas f ON p.fakultasId = f.id
      GROUP BY f.id
    `);

    // Grafik 3️⃣: Jumlah Alumni per Tahun Lulus
    const [lulusanPerTahun] = await db.promise().query(`
      SELECT tahun_lulus, COUNT(*) AS jumlah
      FROM alumni
      GROUP BY tahun_lulus
      ORDER BY tahun_lulus ASC
    `);

    // Hitung total statistik tambahan
    const totalAlumni = (await db.promise().query(`SELECT COUNT(*) AS total FROM alumni`))[0][0].total;
    const totalResponden = (await db.promise().query(`SELECT COUNT(DISTINCT alumniId) AS total FROM jawaban_opsi`))[0][0].total;
    const rataCapaian = (await db.promise().query(`
      SELECT ROUND(AVG(oj.nilai),2) AS rata FROM jawaban_opsi jo 
      JOIN opsi_jawaban oj ON jo.opsiJawabanId = oj.id
    `))[0][0].rata;

    res.render("dashboard", {
      data: {
        status,
        capaianFakultas,
        lulusanPerTahun,
        totalAlumni,
        totalResponden,
        rataCapaian
      }
    });
  } catch (err) {
    console.error("❌ Error mengambil data dashboard:", err);
    res.render("dashboard", { data: {} });
  }
});

export default router;
