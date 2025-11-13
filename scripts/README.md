# 📋 Setup Python untuk CSV Processing

## 🚀 Instalasi Dependencies

1. **Pastikan Python sudah terinstall** (Python 3.7 atau lebih baru)
   ```bash
   python --version
   # atau
   python3 --version
   ```

2. **Install dependencies Python**
   ```bash
   pip install -r requirements.txt
   # atau
   pip3 install -r requirements.txt
   ```

## 🔧 Konfigurasi Database

Edit file `process_csv.py` dan sesuaikan konfigurasi database di bagian:

```python
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',  # Ganti dengan password MySQL Anda
    'database': 'tracer_study_sederhana'
}
```

## 📊 Format CSV yang Didukung

Script Python akan otomatis mendeteksi kolom berikut (case-insensitive):

- **NIM**: `nim`, `nomor_induk`, `no_induk`
- **Nama**: `nama`, `name`, `nama_lengkap`
- **Email**: `email`, `e_mail`, `email_address`
- **Tahun Lulus**: `tahun_lulus`, `tahun`, `year`, `tahun_kelulusan`
- **Fakultas**: `fakultas`, `faculty`
- **Prodi**: `prodi`, `program_studi`, `jurusan`, `program`

## 🧹 Data Cleaning yang Dilakukan

1. **Menghapus baris kosong** (semua kolom kosong)
2. **Validasi NIM**: Minimal 5 karakter, alphanumeric
3. **Validasi Email**: Format email yang valid
4. **Validasi Tahun**: Antara 2000-2030
5. **Menghapus duplikat** berdasarkan NIM
6. **Membersihkan teks** dari karakter tidak valid
7. **Auto-create Fakultas dan Prodi** jika belum ada

## 🗑️ Data yang Akan Dieliminasi

- Baris tanpa NIM atau NIM tidak valid
- Baris tanpa nama
- Baris dengan tahun lulus tidak valid
- Data duplikat (berdasarkan NIM)
- Data yang sudah ada di database (berdasarkan NIM)

## 📝 Output

Script akan mengembalikan JSON dengan format:

```json
{
  "success": true,
  "inserted": 150,
  "eliminated": 25,
  "skipped": 5,
  "total_processed": 180
}
```

## ⚠️ Troubleshooting

### Error: "python: command not found"
- Gunakan `python3` sebagai gantinya
- Edit `routes/dashboard.js` baris 122: `spawn("python3", ...)`

### Error: "Module not found"
- Pastikan dependencies sudah diinstall: `pip install -r requirements.txt`

### Error: "Access denied for user"
- Periksa konfigurasi database di `process_csv.py`
- Pastikan MySQL running dan user memiliki akses

### Error: "Table doesn't exist"
- Pastikan database `tracer_study_sederhana` sudah dibuat
- Pastikan tabel `alumni`, `fakultas`, `prodi` sudah ada

