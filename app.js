import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import logger from "morgan";
import dashboardRouter from "./routes/dashboard.js";
import { uploadRouter } from "./routes/dashboard.js";
import indexRouter from "./routes/index.js";
// import capaianRouter from "./routes/capaian.js"; // ❌ tidak dipakai
import pembobotanRouter from "./routes/pembobotan.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// View engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Middleware
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());



// Static files
app.use(express.static(path.join(__dirname, "public")));
app.use("/images", express.static(path.join(__dirname, "images")));
app.use("/stylesheets", express.static(path.join(__dirname, "stylesheets")));

// Routes
// Mount uploadRouter sebelum indexRouter untuk memastikan route /upload ditangkap
app.use("/", uploadRouter); // Route untuk upload CSV di root /upload
app.use("/", indexRouter);
// app.use("/capaian", capaianRouter); // ❌ hapus atau komentar
app.use("/pembobotan", pembobotanRouter);
app.use("/dashboard", dashboardRouter);

// Debug: Test route
console.log("✅ Routes registered:");
console.log("  - GET /upload (uploadRouter)");
console.log("  - POST /upload (uploadRouter)");
console.log("  - GET /dashboard (dashboardRouter)");



// Handle 404
app.use((req, res) => {
  res.status(404).send("404 - Halaman tidak ditemukan");
});

export default app;
