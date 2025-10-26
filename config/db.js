import mysql from "mysql2";

const db = mysql.createConnection({
  host: "localhost",
  user: "root",           // ganti sesuai username MySQL kamu
  password: "",           // ganti sesuai password MySQL kamu
  database: "tracer_study_sederhana" // <--- database dari SQL sebelumnya
});

db.connect((err) => {
  if (err) throw err;
  console.log("✅ Terhubung ke database tracer_study_sederhana");
});

export default db;
