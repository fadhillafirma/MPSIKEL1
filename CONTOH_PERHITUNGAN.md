# 📊 CONTOH PERHITUNGAN CAPAIAN IKU1

## 📌 Rumus IKU1
```
Capaian IKU1 = (Jumlah Alumni yang Berhasil / Total Alumni) × 100%
```
Dimana:
- **Alumni Berhasil** = Alumni yang sudah memiliki status (Bekerja/Wirausaha/Pendidikan)
- **Total Alumni** = Semua alumni yang terdaftar

---

## 📋 CONTOH DATA

### Data di Database:

#### Tabel `alumni`
| ID | Nama | NIM | Tahun Lulus | Prodi ID |
|----|------|----|---------|---------|
| 1 | Budi | 12345 | 2023 | 1 |
| 2 | Siti | 12346 | 2023 | 1 |
| 3 | Ahmad | 12347 | 2023 | 2 |
| 4 | Devi | 12348 | 2022 | 2 |
| 5 | Rudi | 12349 | 2022 | 1 |

**Total Alumni: 5 orang**

#### Tabel `jawaban_opsi` (Alumni yang sudah mengisi)
| ID | Alumni ID | Opsi Jawaban ID | Status |
|----|----------|-----------------|---------|
| 1 | 1 | 1 | Bekerja |
| 2 | 2 | 1 | Bekerja |
| 3 | 3 | 1 | Bekerja |
| 4 | 4 | 2 | Wirausaha |

**Alumni Berhasil: 4 orang** (Alumni 1, 2, 3, 4 sudah mengisi)
**Alumni Tidak Berhasil: 1 orang** (Alumni 5 belum mengisi)

---

## 🎯 PERHITUNGAN CAPAIAN IKU1

### 1️⃣ Capaian Keseluruhan
```
Capaian = (Alumni Berhasil / Total Alumni) × 100%
        = (4 / 5) × 100%
        = 80%
```

**SQL Query:**
```sql
SELECT 
  ROUND(
    COALESCE((SELECT COUNT(DISTINCT alumniId) FROM jawaban_opsi), 0) * 100.0 / 
    NULLIF((SELECT COUNT(*) FROM alumni), 0), 
    2
  ) AS rata
```

**Hasil: 80.00%**

---

### 2️⃣ Capaian per Fakultas

Misalkan struktur fakultas dan prodi:
- **Fakultas Teknik** (ID: 1)
  - Prodi Teknik Sipil (ID: 1) → Alumni: 1, 2, 5
  - Prodi Teknik Informatika (ID: 2) → Alumni: 3, 4

#### Perhitungan per Fakultas Teknik:
```
Total Alumni di Fakultas Teknik = 5
Alumni yang Berhasil = 4 (Alumni 1, 2, 3, 4)
Alumni yang Tidak Berhasil = 1 (Alumni 5)

Capaian Fakultas Teknik = (4 / 5) × 100% = 80%
```

**SQL Query:**
```sql
SELECT 
  f.nama AS fakultas,
  ROUND(
    COALESCE(COUNT(DISTINCT jo.alumniId), 0) * 100.0 / 
    NULLIF(COUNT(DISTINCT a.id), 0), 
    2
  ) AS rata_capaian
FROM fakultas f
JOIN prodi p ON p.fakultasId = f.id
JOIN alumni a ON a.prodiId = p.id
LEFT JOIN jawaban_opsi jo ON jo.alumniId = a.id
GROUP BY f.id
```

**Hasil: 80.00%**

---

### 3️⃣ Capaian per Prodi

#### Prodi Teknik Sipil:
```
Total Alumni = 3 (Alumni 1, 2, 5)
Alumni yang Berhasil = 2 (Alumni 1, 2)
Alumni yang Tidak Berhasil = 1 (Alumni 5)

Capaian Teknik Sipil = (2 / 3) × 100% = 66.67%
```

#### Prodi Teknik Informatika:
```
Total Alumni = 2 (Alumni 3, 4)
Alumni yang Berhasil = 2 (Alumni 3, 4)
Alumni yang Tidak Berhasil = 0

Capaian Teknik Informatika = (2 / 2) × 100% = 100.00%
```

**SQL Query:**
```sql
SELECT 
  f.nama AS fakultas, 
  p.nama AS prodi, 
  ROUND(
    COALESCE(COUNT(DISTINCT jo.alumniId), 0) * 100.0 / 
    NULLIF(COUNT(DISTINCT a.id), 0), 
    2
  ) AS capaian_rata,
  COUNT(DISTINCT a.id) AS jumlah_alumni,
  a.tahun_lulus
FROM alumni a
JOIN prodi p ON a.prodiId = p.id
JOIN fakultas f ON p.fakultasId = f.id
LEFT JOIN jawaban_opsi jo ON jo.alumniId = a.id
GROUP BY f.nama, p.nama, a.tahun_lulus
```

**Hasil:**
| Fakultas | Prodi | Capaian | Jumlah Alumni |
|----------|-------|---------|---------------|
| Fakultas Teknik | Teknik Sipil | 66.67% | 3 |
| Fakultas Teknik | Teknik Informatika | 100.00% | 2 |

---

## 📊 RINGKASAN PERHITUNGAN

### Top Level (Keseluruhan)
```
Formula: (4 / 5) × 100%
Capaian: 80.00%
```

### Per Fakultas
```
Fakultas Teknik: (4 / 5) × 100% = 80.00%
```

### Per Prodi
```
Teknik Sipil:       (2 / 3) × 100% = 66.67%
Teknik Informatika: (2 / 2) × 100% = 100.00%
```

---

## 🔍 PENJELASAN COMPONENTS SQL

### `COUNT(DISTINCT jo.alumniId)`
- Menghitung jumlah alumni yang **unik** (tidak duplikat) yang sudah mengisi jawaban
- Menggunakan `DISTINCT` karena satu alumni bisa punya multiple jawaban

### `COUNT(DISTINCT a.id)`
- Menghitung jumlah total alumni yang **unik**

### `COALESCE`
- Jika tidak ada data, return 0 (bukan NULL)
- Mencegah error perhitungan

### `NULLIF(COUNT(...), 0)`
- Jika total alumni = 0, return NULL (bukan 0)
- Mencegah pembagian dengan nol

### `ROUND(..., 2)`
- Bulatkan hasil ke 2 angka desimal
- Contoh: 66.666... → 66.67%

---

## 💡 CATATAN PENTING

1. **"Alumni Berhasil"** = Alumni yang sudah ada di tabel `jawaban_opsi`
2. **"Total Alumni"** = Semua alumni di tabel `alumni`
3. **LEFT JOIN** digunakan agar semua alumni dihitung, termasuk yang belum mengisi
4. Rumus ini mengukur **persentase alumni yang responsive**, bukan kualitas pekerjaan

---

## 🎯 CONTOH SKENARIO

### Skenario A: Semua Alumni Mengisi
```
Total Alumni: 100
Alumni Berhasil: 100
Capaian: (100 / 100) × 100% = 100%
```

### Skenario B: Setengah Alumni Mengisi
```
Total Alumni: 100
Alumni Berhasil: 50
Capaian: (50 / 100) × 100% = 50%
```

### Skenario C: Seperempat Alumni Mengisi
```
Total Alumni: 100
Alumni Berhasil: 25
Capaian: (25 / 100) × 100% = 25%
```

---

## 📝 KESIMPULAN

Formula IKU1 mengukur **persentase keberhasilan** alumni dalam **melaporkan status mereka** (bekerja/wirausaha/pendidikan), bukan kualitas pekerjaan itu sendiri.

**Capaian tinggi (80-100%)** = Hampir semua alumni sudah respond
**Capaian rendah (<50%)** = Banyak alumni belum respond, perlu follow-up


