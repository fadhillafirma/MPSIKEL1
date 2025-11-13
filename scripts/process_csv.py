#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script Python untuk memproses dan membersihkan data CSV
- Data cleaning (menghapus duplikat, null values, dll)
- Data filtering (menghapus data yang tidak diperlukan)
- Preprocessing data dengan dummy untuk null values
- Insert ke database MySQL
"""

import sys
import json
import pandas as pd
import mysql.connector
from mysql.connector import Error
import re
from datetime import datetime
import random
import io

# Set encoding untuk output di Windows
if sys.platform == "win32":
    # Set stdout encoding ke UTF-8 untuk Windows
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')

# Konfigurasi Database
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '',  # Sesuaikan dengan password MySQL Anda
    'database': 'tracer_study_sederhana'
}

# Dummy data untuk mengisi null values
DUMMY_DATA = {
    'email': lambda: f"dummy_{random.randint(1000, 9999)}@unand.ac.id",
    'tahun_lulus': lambda: 2023,  # Default tahun lulus
    'fakultas': lambda: "Fakultas Teknologi Informasi",
    'prodi': lambda: "Sistem Informasi"
}

def clean_text(text):
    """Membersihkan teks dari karakter tidak valid"""
    if pd.isna(text) or text == '' or str(text).strip() == '':
        return None
    text = str(text).strip()
    # Hapus tanda kutip ganda dan tunggal
    text = text.replace('"', '').replace("'", '')
    # Hapus karakter khusus yang tidak diinginkan, tapi tetap pertahankan karakter penting
    text = re.sub(r'[^\w\s\-.,()/]', '', text)
    return text if text and text != 'nan' else None

def clean_nim(nim):
    """Membersihkan NIM dari karakter tidak valid"""
    if pd.isna(nim) or nim == '':
        return None
    nim = str(nim).strip()
    # Hapus tanda kutip ganda dan tunggal
    nim = nim.replace('"', '').replace("'", '')
    # Hapus spasi dan karakter khusus, tapi pertahankan angka dan huruf
    nim = re.sub(r'[^\w]', '', nim)
    return nim if len(nim) >= 5 else None

def validate_email(email):
    """Validasi format email"""
    if pd.isna(email) or not email or str(email).strip() == '' or str(email).lower() == 'nan':
        return None
    email = str(email).strip().lower()
    # Hapus tanda kutip
    email = email.replace('"', '').replace("'", '')
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return email if re.match(pattern, email) else None

def validate_nim(nim):
    """Validasi NIM (harus alphanumeric, minimal 5 karakter)"""
    nim = clean_nim(nim)
    return nim if nim and len(nim) >= 5 else None

def validate_tahun(tahun):
    """Validasi tahun lulus (antara 2000-2030)"""
    if pd.isna(tahun) or tahun == '':
        return None
    try:
        # Handle jika tahun dalam format string dengan tanda kutip
        tahun_str = str(tahun).strip().replace('"', '').replace("'", '')
        tahun = int(float(tahun_str))
        if 2000 <= tahun <= 2030:
            return tahun
    except:
        pass
    return None

def get_dummy_value(field_name):
    """Mendapatkan dummy value untuk field yang null"""
    if field_name in DUMMY_DATA:
        return DUMMY_DATA[field_name]()
    return None

def normalize_name(name):
    """Normalisasi nama untuk matching (case-insensitive, trim, hapus karakter khusus)"""
    if not name:
        return None
    # Convert ke string, trim whitespace, lowercase untuk comparison
    normalized = str(name).strip()
    # Hapus multiple spaces
    normalized = re.sub(r'\s+', ' ', normalized)
    return normalized

def get_or_create_fakultas(cursor, nama_fakultas):
    """Mendapatkan ID fakultas yang sudah ada di database (tidak membuat baru)"""
    if not nama_fakultas:
        # Jika tidak ada nama, cari default dari database
        cursor.execute("SELECT id FROM fakultas WHERE nama LIKE %s LIMIT 1", 
                      ("%Teknologi Informasi%",))
        result = cursor.fetchone()
        if result:
            return result[0]
        # Jika tidak ada, ambil ID pertama yang ada
        cursor.execute("SELECT id FROM fakultas LIMIT 1")
        result = cursor.fetchone()
        return result[0] if result else None
    
    # Normalisasi nama untuk matching
    nama_normalized = normalize_name(nama_fakultas)
    if not nama_normalized:
        return None
    
    # Filter nilai yang tampaknya adalah nama orang agar tidak masuk sebagai fakultas
    def is_likely_person_name(text):
        if not text:
            return False
        t = str(text).strip()
        # Jika mengandung kata 'fakultas' maka jelas ini nama fakultas
        if 'fakultas' in t.lower():
            return False
        # Nama orang biasanya 2-4 kata, huruf semua, tiap kata kapital di awal
        words = [w for w in re.split(r'\s+', t) if w]
        if 1 <= len(words) <= 4:
            alpha_ratio = sum(ch.isalpha() for ch in t) / max(1, len(t))
            proper_case = sum(1 for w in words if (w[:1].isupper() and w[1:].islower()))
            if alpha_ratio > 0.8 and proper_case >= max(1, len(words) - 1):
                return True
        return False
    
    if is_likely_person_name(nama_fakultas):
        # Abaikan nilai yang tampak seperti nama orang, cari default
        cursor.execute("SELECT id FROM fakultas WHERE nama LIKE %s LIMIT 1", 
                      ("%Teknologi Informasi%",))
        result = cursor.fetchone()
        if result:
            return result[0]
        cursor.execute("SELECT id FROM fakultas LIMIT 1")
        result = cursor.fetchone()
        return result[0] if result else None
    
    # Cari fakultas dengan case-insensitive matching
    # Coba exact match dulu (case-insensitive)
    cursor.execute("SELECT id FROM fakultas WHERE LOWER(TRIM(nama)) = LOWER(%s)", 
                  (nama_normalized,))
    result = cursor.fetchone()
    
    if result:
        return result[0]
    
    # Coba partial match (jika nama dari CSV adalah substring dari nama di database atau sebaliknya)
    cursor.execute("SELECT id FROM fakultas WHERE LOWER(TRIM(nama)) LIKE LOWER(%s) OR LOWER(%s) LIKE CONCAT('%%', LOWER(TRIM(nama)), '%%')", 
                  (f"%{nama_normalized}%", nama_normalized))
    result = cursor.fetchone()
    
    if result:
        return result[0]
    
    # Jika tidak ditemukan, jangan buat baru - return None atau default
    # Cari default dari database
    cursor.execute("SELECT id FROM fakultas WHERE nama LIKE %s LIMIT 1", 
                  ("%Teknologi Informasi%",))
    result = cursor.fetchone()
    if result:
        print(f"[WARNING] Fakultas '{nama_fakultas}' tidak ditemukan di database, menggunakan default", file=sys.stderr)
        return result[0]
    
    # Jika tidak ada default, ambil ID pertama yang ada
    cursor.execute("SELECT id FROM fakultas LIMIT 1")
    result = cursor.fetchone()
    if result:
        print(f"[WARNING] Fakultas '{nama_fakultas}' tidak ditemukan di database, menggunakan fakultas pertama", file=sys.stderr)
        return result[0]
    
    return None

def get_or_create_prodi(cursor, nama_prodi, fakultas_id):
    """Mendapatkan ID prodi yang sudah ada di database (tidak membuat baru)"""
    if not nama_prodi:
        # Jika tidak ada nama, cari default dari database berdasarkan fakultas
        if fakultas_id:
            cursor.execute("SELECT id FROM prodi WHERE fakultasId = %s LIMIT 1", 
                          (fakultas_id,))
            result = cursor.fetchone()
            if result:
                return result[0]
        # Jika tidak ada, cari prodi default
        cursor.execute("SELECT id FROM prodi WHERE nama LIKE %s LIMIT 1", 
                      ("%Sistem Informasi%",))
        result = cursor.fetchone()
        if result:
            return result[0]
        # Jika tidak ada, ambil ID pertama yang ada
        cursor.execute("SELECT id FROM prodi LIMIT 1")
        result = cursor.fetchone()
        return result[0] if result else None
    
    if not fakultas_id:
        return None
    
    # Normalisasi nama untuk matching
    nama_normalized = normalize_name(nama_prodi)
    if not nama_normalized:
        return None
    
    # Cari prodi dengan case-insensitive matching dan sesuai fakultas
    # Coba exact match dulu (case-insensitive)
    cursor.execute("SELECT id FROM prodi WHERE LOWER(TRIM(nama)) = LOWER(%s) AND fakultasId = %s", 
                  (nama_normalized, fakultas_id))
    result = cursor.fetchone()
    
    if result:
        return result[0]
    
    # Coba tanpa memperhatikan fakultas (jika nama prodi sama tapi fakultas berbeda)
    cursor.execute("SELECT id FROM prodi WHERE LOWER(TRIM(nama)) = LOWER(%s) LIMIT 1", 
                  (nama_normalized,))
    result = cursor.fetchone()
    
    if result:
        print(f"[WARNING] Prodi '{nama_prodi}' ditemukan tapi dengan fakultas berbeda, menggunakan prodi yang ada", file=sys.stderr)
        return result[0]
    
    # Coba partial match
    cursor.execute("SELECT id FROM prodi WHERE (LOWER(TRIM(nama)) LIKE LOWER(%s) OR LOWER(%s) LIKE CONCAT('%%', LOWER(TRIM(nama)), '%%')) AND fakultasId = %s LIMIT 1", 
                  (f"%{nama_normalized}%", nama_normalized, fakultas_id))
    result = cursor.fetchone()
    
    if result:
        return result[0]
    
    # Jika tidak ditemukan, jangan buat baru - return None atau default
    # Cari default dari database berdasarkan fakultas
    if fakultas_id:
        cursor.execute("SELECT id FROM prodi WHERE fakultasId = %s LIMIT 1", 
                      (fakultas_id,))
        result = cursor.fetchone()
        if result:
            print(f"[WARNING] Prodi '{nama_prodi}' tidak ditemukan di database untuk fakultas ID {fakultas_id}, menggunakan prodi pertama dari fakultas tersebut", file=sys.stderr)
            return result[0]
    
    # Jika tidak ada, cari prodi default
    cursor.execute("SELECT id FROM prodi WHERE nama LIKE %s LIMIT 1", 
                  ("%Sistem Informasi%",))
    result = cursor.fetchone()
    if result:
        print(f"[WARNING] Prodi '{nama_prodi}' tidak ditemukan di database, menggunakan default", file=sys.stderr)
        return result[0]
    
    # Jika tidak ada, ambil ID pertama yang ada
    cursor.execute("SELECT id FROM prodi LIMIT 1")
    result = cursor.fetchone()
    if result:
        print(f"[WARNING] Prodi '{nama_prodi}' tidak ditemukan di database, menggunakan prodi pertama", file=sys.stderr)
        return result[0]
    
    return None

def get_or_create_opsi_jawaban(cursor, teks_opsi):
    """Mendapatkan atau membuat opsi jawaban untuk status"""
    if not teks_opsi:
        # Default status jika tidak ada
        teks_opsi = "Bekerja"
    
    # Normalisasi teks status
    teks_opsi = clean_text(teks_opsi)
    if not teks_opsi:
        teks_opsi = "Bekerja"
    
    # Mapping status dari CSV ke status standar
    # Dari CSV: "Bekerja (full time / part time)", "Tidak Kerja tetapi sedang mencari kerja", dll
    status_mapping = {
        # Bekerja
        'bekerja (full time / part time)': 'Bekerja',
        'bekerja': 'Bekerja',
        # Wirausaha / Wiraswasta
        'wiraswasta': 'Wirausaha',
        'wirausaha': 'Wirausaha',
        'perusahaan sendiri': 'Wirausaha',
        # Pendidikan lanjut
        'melanjutkan pendidikan': 'Pendidikan Lanjut',
        'pendidikan lanjut': 'Pendidikan Lanjut',
        'study lanjut': 'Pendidikan Lanjut',
        'studi lanjut': 'Pendidikan Lanjut',
        # Belum bekerja
        'belum bekerja': 'Belum Bekerja',
        'tidak kerja': 'Belum Bekerja',
        'mencari kerja': 'Belum Bekerja',
        'tidak kerja tetapi sedang mencari kerja': 'Belum Bekerja',
        'belum pasti': 'Belum Bekerja'
    }
    
    # Cek apakah ada mapping
    teks_lower = teks_opsi.lower()
    for key, value in status_mapping.items():
        if key in teks_lower:
            teks_opsi = value
            break
    
    # Jika tidak ada mapping yang cocok, default ke "Bekerja"
    if teks_opsi not in ['Bekerja', 'Wirausaha', 'Pendidikan Lanjut', 'Belum Bekerja']:
        teks_opsi = 'Bekerja'
    
    # Cari opsi jawaban
    cursor.execute("SELECT id FROM opsi_jawaban WHERE teks_opsi = %s", (teks_opsi,))
    result = cursor.fetchone()
    
    if result:
        return result[0]
    
    # Buat opsi jawaban baru
    cursor.execute("INSERT INTO opsi_jawaban (teks_opsi, nilai) VALUES (%s, %s)", 
                   (teks_opsi, 0.00))
    return cursor.lastrowid

def ensure_jumlah_input_columns(cursor):
    """Memastikan kolom jumlah_input ada di tabel fakultas dan prodi, return True jika kolom baru ditambahkan"""
    columns_added = False
    try:
        # Cek apakah kolom jumlah_input sudah ada di tabel fakultas
        cursor.execute("""
            SELECT COUNT(*) 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'fakultas' 
            AND COLUMN_NAME = 'jumlah_input'
        """)
        if cursor.fetchone()[0] == 0:
            # Tambahkan kolom jumlah_input ke tabel fakultas
            cursor.execute("ALTER TABLE fakultas ADD COLUMN jumlah_input INT DEFAULT 0")
            print("[INFO] Kolom jumlah_input ditambahkan ke tabel fakultas", file=sys.stderr)
            columns_added = True
        
        # Cek apakah kolom jumlah_input sudah ada di tabel prodi
        cursor.execute("""
            SELECT COUNT(*) 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'prodi' 
            AND COLUMN_NAME = 'jumlah_input'
        """)
        if cursor.fetchone()[0] == 0:
            # Tambahkan kolom jumlah_input ke tabel prodi
            cursor.execute("ALTER TABLE prodi ADD COLUMN jumlah_input INT DEFAULT 0")
            print("[INFO] Kolom jumlah_input ditambahkan ke tabel prodi", file=sys.stderr)
            columns_added = True
        
        return columns_added
    except Exception as e:
        print(f"[WARNING] Error memastikan kolom jumlah_input: {str(e)}", file=sys.stderr)
        return False

def update_jumlah_input(cursor, prodi_id, fakultas_id, is_new_insert=True):
    """Update jumlah_input di tabel prodi dan fakultas saat alumni masuk"""
    try:
        if prodi_id:
            if is_new_insert:
                # Increment jumlah_input untuk prodi baru
                cursor.execute("""
                    UPDATE prodi 
                    SET jumlah_input = COALESCE(jumlah_input, 0) + 1 
                    WHERE id = %s
                """, (prodi_id,))
            else:
                # Untuk update, recalculate berdasarkan COUNT alumni
                cursor.execute("""
                    UPDATE prodi 
                    SET jumlah_input = (
                        SELECT COUNT(*) 
                        FROM alumni 
                        WHERE prodiId = %s
                    )
                    WHERE id = %s
                """, (prodi_id, prodi_id))
        
        if fakultas_id:
            if is_new_insert:
                # Increment jumlah_input untuk fakultas baru
                cursor.execute("""
                    UPDATE fakultas 
                    SET jumlah_input = COALESCE(jumlah_input, 0) + 1 
                    WHERE id = %s
                """, (fakultas_id,))
            else:
                # Untuk update, recalculate berdasarkan COUNT alumni dari semua prodi di fakultas
                cursor.execute("""
                    UPDATE fakultas 
                    SET jumlah_input = (
                        SELECT COUNT(*) 
                        FROM alumni a
                        JOIN prodi p ON a.prodiId = p.id
                        WHERE p.fakultasId = %s
                    )
                    WHERE id = %s
                """, (fakultas_id, fakultas_id))
    except Exception as e:
        print(f"[WARNING] Error update jumlah_input: {str(e)}", file=sys.stderr)

def mark_as_responden(cursor, alumni_id, status_text=None):
    """Menandai alumni sebagai responden dengan insert ke jawaban_opsi"""
    try:
        # Cek apakah sudah ada di jawaban_opsi
        cursor.execute("SELECT id FROM jawaban_opsi WHERE alumniId = %s", (alumni_id,))
        if cursor.fetchone():
            # Sudah ada, skip
            return True
        
        # Dapatkan atau buat opsi jawaban
        opsi_id = get_or_create_opsi_jawaban(cursor, status_text)
        
        # Insert ke jawaban_opsi untuk menandai sebagai responden
        cursor.execute("""
            INSERT INTO jawaban_opsi (alumniId, opsiJawabanId)
            VALUES (%s, %s)
        """, (alumni_id, opsi_id))
        
        return True
    except Exception as e:
        print(f"[WARNING] Error menandai responden untuk alumni ID {alumni_id}: {str(e)}", file=sys.stderr)
        return False

def process_csv(csv_path):
    """Memproses file CSV dan insert ke database"""
    try:
        # Baca CSV - auto-detect header position
        print(f"[INFO] Membaca file CSV: {csv_path}", file=sys.stderr)
        
        # Coba berbagai encoding dan skip rows
        encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']
        skip_rows_options = [0, 1, 2]  # Coba header di baris 1, 2, atau 3
        df = None
        used_encoding = None
        used_skiprows = None
        
        for encoding in encodings:
            for skip_rows in skip_rows_options:
                try:
                    # Test read dengan skip rows yang berbeda
                    test_df = pd.read_csv(csv_path, encoding=encoding, skiprows=skip_rows, nrows=5, on_bad_lines='skip')
                    # Cek apakah ada kolom NIM atau nama
                    cols_str = ' '.join([str(c).lower() for c in test_df.columns])
                    # Cek juga baris pertama data untuk memastikan format benar
                    if len(test_df) > 0:
                        first_row_str = ' '.join([str(v).lower() for v in test_df.iloc[0].values if pd.notna(v)])
                        # Jika ada kolom NIM atau nama di header, atau data pertama terlihat seperti NIM/nama
                        if 'nim' in cols_str or 'nama' in cols_str or any(len(str(v)) >= 5 and str(v).isdigit() for v in test_df.iloc[0].values if pd.notna(v)):
                            # Baca full CSV dengan konfigurasi ini
                            df = pd.read_csv(csv_path, encoding=encoding, skiprows=skip_rows, on_bad_lines='skip', low_memory=False)
                            used_encoding = encoding
                            used_skiprows = skip_rows
                            print(f"[INFO] Berhasil membaca dengan encoding: {encoding}, skiprows: {skip_rows}", file=sys.stderr)
                            break
                except Exception as e:
                    print(f"[DEBUG] Error dengan encoding {encoding}, skiprows {skip_rows}: {str(e)}", file=sys.stderr)
                    continue
            if df is not None:
                break
        
        if df is None:
            # Fallback: baca dengan utf-8 tanpa skip rows
            print(f"[INFO] Mencoba fallback dengan UTF-8, skiprows=0...", file=sys.stderr)
            try:
                df = pd.read_csv(csv_path, encoding='utf-8', skiprows=0, on_bad_lines='skip', low_memory=False)
                used_encoding = 'utf-8'
                used_skiprows = 0
            except:
                # Jika masih gagal, coba skip 1 baris
                try:
                    df = pd.read_csv(csv_path, encoding='utf-8', skiprows=1, on_bad_lines='skip', low_memory=False)
                    used_encoding = 'utf-8'
                    used_skiprows = 1
                except:
                    df = pd.read_csv(csv_path, encoding='utf-8', skiprows=2, on_bad_lines='skip', low_memory=False)
                    used_encoding = 'utf-8'
                    used_skiprows = 2
        
        print(f"[INFO] Total baris sebelum cleaning: {len(df)}", file=sys.stderr)
        print(f"[INFO] Total kolom: {len(df.columns)}", file=sys.stderr)
        print(f"[INFO] Kolom yang ditemukan (10 pertama): {list(df.columns[:10])}", file=sys.stderr)
        
        # 1. DATA CLEANING
        # Hapus baris yang semua kolomnya kosong
        before_empty = len(df)
        df = df.dropna(how='all')
        print(f"[INFO] Hapus baris kosong: {before_empty} -> {len(df)}", file=sys.stderr)
        
        # Normalisasi nama kolom (lowercase, hapus spasi, hapus karakter khusus)
        df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_').str.replace('#', '')
        
        # 2. MAPPING KOLOM - Cari kolom yang diperlukan
        # CSV memiliki: No, Tanggal Input, Nama Lengkap, NIM, Fakultas, Prodi, Tahun Lulus, Email
        actual_columns = {}
        
        # Cari kolom NIM (bisa "nim" atau mengandung "nim")
        nim_col_from_header = None
        for col in df.columns:
            col_lower = str(col).lower().strip()
            if col_lower == 'nim' or (col_lower.startswith('nim') and len(col_lower) <= 10):
                nim_col_from_header = col
                break
        
        # Validasi: cek apakah kolom dari header benar-benar berisi data seperti NIM
        if nim_col_from_header and len(df) > 0:
            sample_val = str(df[nim_col_from_header].iloc[0]) if pd.notna(df[nim_col_from_header].iloc[0]) else ''
            cleaned_val = sample_val.replace('"', '').replace("'", '').strip()
            # Jika data di kolom ini terlihat seperti NIM (angka panjang 8-12 digit)
            if cleaned_val.isdigit() and 8 <= len(cleaned_val) <= 12:
                actual_columns['nim'] = nim_col_from_header
            else:
                # Kolom header mengatakan "nim" tapi data tidak sesuai, cari berdasarkan pattern
                print(f"[INFO] Kolom '{nim_col_from_header}' terdeteksi sebagai NIM di header, tapi data tidak sesuai. Mencari berdasarkan pattern...", file=sys.stderr)
                nim_col_from_header = None
        
        # Jika belum ditemukan, coba cari berdasarkan pattern data (angka panjang 8-12 digit)
        if 'nim' not in actual_columns:
            for col in df.columns:
                if len(df) > 0:
                    sample_val = str(df[col].iloc[0]) if pd.notna(df[col].iloc[0]) else ''
                    # Jika nilai pertama terlihat seperti NIM (angka panjang 8-12 digit)
                    cleaned_val = sample_val.replace('"', '').replace("'", '').strip()
                    if cleaned_val.isdigit() and 8 <= len(cleaned_val) <= 12:
                        actual_columns['nim'] = col
                        print(f"[INFO] NIM terdeteksi di kolom: {col} (berdasarkan pattern data)", file=sys.stderr)
                        break
        
        # Cari kolom Nama Lengkap
        nama_col_from_header = None
        for col in df.columns:
            col_lower = str(col).lower().strip()
            if 'nama' in col_lower and 'lengkap' in col_lower:
                nama_col_from_header = col
                break
            elif col_lower == 'nama' or col_lower == 'nama_lengkap':
                nama_col_from_header = col
                break
        
        # Validasi: cek apakah kolom dari header benar-benar berisi data seperti nama
        if nama_col_from_header and len(df) > 0:
            sample_val = str(df[nama_col_from_header].iloc[0]) if pd.notna(df[nama_col_from_header].iloc[0]) else ''
            # Jika data di kolom ini terlihat seperti nama (huruf, bukan angka panjang)
            if sample_val and not sample_val.replace(' ', '').isdigit() and len(sample_val) > 3 and len(sample_val) < 50:
                if not (sample_val.isdigit() and len(sample_val) >= 8):
                    actual_columns['nama'] = nama_col_from_header
            else:
                # Kolom header mengatakan "nama" tapi data tidak sesuai, cari berdasarkan pattern
                print(f"[INFO] Kolom '{nama_col_from_header}' terdeteksi sebagai Nama di header, tapi data tidak sesuai. Mencari berdasarkan pattern...", file=sys.stderr)
                nama_col_from_header = None
        
        # Jika belum ditemukan, coba cari berdasarkan posisi atau pattern data
        if 'nama' not in actual_columns:
            # Cek kolom pertama yang berisi teks (bukan angka panjang seperti NIM)
            for col in df.columns:
                if len(df) > 0:
                    sample_val = str(df[col].iloc[0]) if pd.notna(df[col].iloc[0]) else ''
                    # Jika nilai pertama terlihat seperti nama (huruf, bukan angka panjang)
                    if sample_val and not sample_val.replace(' ', '').isdigit() and len(sample_val) > 3 and len(sample_val) < 50:
                        # Cek apakah ini bukan NIM (NIM biasanya angka panjang)
                        if not (sample_val.isdigit() and len(sample_val) >= 8):
                            actual_columns['nama'] = col
                            print(f"[INFO] Nama terdeteksi di kolom: {col} (berdasarkan pattern data)", file=sys.stderr)
                            break
        
        # Cari kolom Fakultas
        for col in df.columns:
            col_lower = str(col).lower().strip()
            if 'fakultas' in col_lower:
                actual_columns['fakultas'] = col
                break
        
        # Jika belum ditemukan, coba cari berdasarkan pattern data
        if 'fakultas' not in actual_columns:
            for col in df.columns:
                if len(df) > 0:
                    sample_val = str(df[col].iloc[0]) if pd.notna(df[col].iloc[0]) else ''
                    # Jika nilai pertama mengandung "Fakultas"
                    if 'fakultas' in sample_val.lower():
                        actual_columns['fakultas'] = col
                        print(f"[INFO] Fakultas terdeteksi di kolom: {col} (berdasarkan pattern data)", file=sys.stderr)
                        break
        
        # Cari kolom Prodi
        for col in df.columns:
            col_lower = str(col).lower().strip()
            if 'prodi' in col_lower or 'program_studi' in col_lower:
                actual_columns['prodi'] = col
                break
        
        # Jika belum ditemukan, coba cari berdasarkan pattern data
        if 'prodi' not in actual_columns:
            for col in df.columns:
                if len(df) > 0:
                    sample_val = str(df[col].iloc[0]) if pd.notna(df[col].iloc[0]) else ''
                    # Jika nilai pertama terlihat seperti nama prodi (huruf, bukan angka)
                    cleaned_val = sample_val.replace('"', '').replace("'", '').strip()
                    if cleaned_val and not cleaned_val.replace(' ', '').isdigit() and len(cleaned_val) > 3 and len(cleaned_val) < 50:
                        # Cek apakah ini bukan nama orang (biasanya nama prodi lebih pendek atau berbeda pattern)
                        # Prodi biasanya satu kata atau beberapa kata pendek
                        if 'fakultas' not in cleaned_val.lower() and not cleaned_val.replace(' ', '').isdigit():
                            # Cek apakah kolom ini bukan kolom nama yang sudah terdeteksi
                            if col != actual_columns.get('nama', ''):
                                actual_columns['prodi'] = col
                                print(f"[INFO] Prodi terdeteksi di kolom: {col} (berdasarkan pattern data)", file=sys.stderr)
                                break
        
        # Cari kolom Tahun Lulus
        for col in df.columns:
            col_lower = str(col).lower().strip()
            if 'tahun' in col_lower and 'lulus' in col_lower:
                actual_columns['tahun_lulus'] = col
                break
        
        # Jika belum ditemukan, coba cari berdasarkan pattern data (tahun 2000-2030)
        if 'tahun_lulus' not in actual_columns:
            for col in df.columns:
                if len(df) > 0:
                    sample_val = str(df[col].iloc[0]) if pd.notna(df[col].iloc[0]) else ''
                    try:
                        # Coba parse sebagai tahun
                        cleaned_val = sample_val.replace('"', '').replace("'", '').strip()
                        tahun = int(float(cleaned_val))
                        if 2000 <= tahun <= 2030:
                            actual_columns['tahun_lulus'] = col
                            print(f"[INFO] Tahun lulus terdeteksi di kolom: {col} (berdasarkan pattern data)", file=sys.stderr)
                            break
                    except:
                        continue
        
        # Cari kolom Email
        for col in df.columns:
            col_lower = str(col).lower().strip()
            if col_lower == 'email' or col_lower.startswith('email'):
                actual_columns['email'] = col
                break
        
        # Jika belum ditemukan, coba cari berdasarkan pattern data (mengandung @)
        if 'email' not in actual_columns:
            for col in df.columns:
                if len(df) > 0:
                    sample_val = str(df[col].iloc[0]) if pd.notna(df[col].iloc[0]) else ''
                    # Jika nilai pertama mengandung @ (email)
                    if '@' in sample_val:
                        actual_columns['email'] = col
                        print(f"[INFO] Email terdeteksi di kolom: {col} (berdasarkan pattern data)", file=sys.stderr)
                        break
        
        # Cari kolom Status (untuk menandai sebagai responden)
        # Kolom status bisa: "f8. Jelaskan Status anda saat ini?", "Status", dll
        for col in df.columns:
            # Setelah normalisasi header, spasi menjadi underscore. Siapkan dua bentuk.
            col_lower = str(col).lower().strip()
            col_lower_spaces = col_lower.replace('_', ' ')
            # Cari kolom yang mengandung "status" dan "saat ini" atau "anda"
            if ('status' in col_lower or 'status' in col_lower_spaces) and (
                'saat_ini' in col_lower or 'saat ini' in col_lower_spaces or
                'anda' in col_lower or 'anda' in col_lower_spaces or
                'jelaskan' in col_lower or 'jelaskan' in col_lower_spaces or
                'f8' in col_lower or 'f8' in col_lower_spaces
            ):
                actual_columns['status'] = col
                break
            elif col_lower == 'status':
                actual_columns['status'] = col
                break
        
        print(f"[INFO] Kolom yang terdeteksi:", file=sys.stderr)
        for key, col in actual_columns.items():
            print(f"   {key}: {col}", file=sys.stderr)

        # Normalisasi DataFrame ke template standar agar siap masuk DB
        standard_columns = ['nim', 'nama', 'email', 'tahun_lulus', 'fakultas', 'prodi', 'status']
        normalized_df = pd.DataFrame(index=df.index)
        missing_for_template = []

        for field in standard_columns:
            source_col = actual_columns.get(field)
            if source_col:
                normalized_df[field] = df[source_col]
            else:
                normalized_df[field] = pd.Series([None] * len(df))
                missing_for_template.append(field)

        if missing_for_template:
            print(f"[INFO] Kolom tidak ditemukan di CSV, akan diisi otomatis/dummy: {missing_for_template}", file=sys.stderr)

        # Gunakan DF yang sudah distandarkan
        df = normalized_df
        # Mapping kolom sekarang langsung ke nama standar
        actual_columns = {field: field for field in standard_columns}
        
        # 3. FILTERING - Hapus data yang tidak valid
        eliminated_count = 0
        initial_count = len(df)
        
        # Filter: Hapus baris tanpa NIM atau NIM tidak valid
        if 'nim' in actual_columns:
            before_filter = len(df)
            # Hapus baris dengan NIM kosong
            df = df[df[actual_columns['nim']].notna()]
            # Clean dan validasi NIM
            df[actual_columns['nim']] = df[actual_columns['nim']].apply(validate_nim)
            eliminated_count += len(df[df[actual_columns['nim']].isna()])
            df = df[df[actual_columns['nim']].notna()]
            print(f"[INFO] Filter NIM: {before_filter} -> {len(df)} baris", file=sys.stderr)
        
        # Filter: Hapus duplikat berdasarkan NIM
        if 'nim' in actual_columns:
            before_dedup = len(df)
            df = df.drop_duplicates(subset=[actual_columns['nim']], keep='first')
            eliminated_count += (before_dedup - len(df))
            print(f"[INFO] Hapus duplikat: {before_dedup} -> {len(df)} baris", file=sys.stderr)
        
        # Filter: Hapus baris tanpa nama
        if 'nama' in actual_columns:
            before_filter = len(df)
            df = df[df[actual_columns['nama']].notna()]
            df[actual_columns['nama']] = df[actual_columns['nama']].apply(clean_text)
            eliminated_count += len(df[df[actual_columns['nama']].isna()])
            df = df[df[actual_columns['nama']].notna()]
            print(f"[INFO] Filter nama: {before_filter} -> {len(df)} baris", file=sys.stderr)
        
        # Filter: Validasi tahun lulus (tapi jangan hapus, isi dengan dummy jika null)
        if 'tahun_lulus' in actual_columns:
            df[actual_columns['tahun_lulus']] = df[actual_columns['tahun_lulus']].apply(validate_tahun)
            # Tidak hapus, nanti akan diisi dummy
        
        # Clean email jika ada
        if 'email' in actual_columns:
            df[actual_columns['email']] = df[actual_columns['email']].apply(validate_email)
        
        print(f"[INFO] Total baris setelah cleaning: {len(df)}", file=sys.stderr)
        print(f"[INFO] Data dieliminasi: {eliminated_count}", file=sys.stderr)
        
        # 4. KONEKSI KE DATABASE
        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor()
        
        # Pastikan kolom jumlah_input ada di tabel fakultas dan prodi
        columns_added = ensure_jumlah_input_columns(cursor)
        
        # Inisialisasi jumlah_input dengan nilai yang benar berdasarkan data yang sudah ada
        # Hanya dilakukan jika kolom baru saja ditambahkan
        if columns_added:
            try:
                print("[INFO] Menginisialisasi jumlah_input berdasarkan data yang sudah ada...", file=sys.stderr)
                # Update jumlah_input untuk semua prodi
                cursor.execute("""
                    UPDATE prodi p
                    SET p.jumlah_input = (
                        SELECT COUNT(*) 
                        FROM alumni a 
                        WHERE a.prodiId = p.id
                    )
                """)
                
                # Update jumlah_input untuk semua fakultas
                cursor.execute("""
                    UPDATE fakultas f
                    SET f.jumlah_input = (
                        SELECT COUNT(*) 
                        FROM alumni a
                        JOIN prodi p ON a.prodiId = p.id
                        WHERE p.fakultasId = f.id
                    )
                """)
                print("[INFO] Inisialisasi jumlah_input selesai", file=sys.stderr)
            except Exception as e:
                print(f"[WARNING] Error inisialisasi jumlah_input: {str(e)}", file=sys.stderr)
        
        inserted_count = 0
        skipped_count = 0
        updated_count = 0
        
        # 5. INSERT KE DATABASE
        for index, row in df.iterrows():
            try:
                # Ambil data dari CSV
                nim = None
                if 'nim' in actual_columns:
                    nim = validate_nim(row[actual_columns['nim']])
                
                nama = None
                if 'nama' in actual_columns:
                    nama = clean_text(row[actual_columns['nama']])
                
                email = None
                if 'email' in actual_columns:
                    email = validate_email(row[actual_columns['email']])
                
                tahun_lulus = None
                if 'tahun_lulus' in actual_columns:
                    tahun_lulus = validate_tahun(row[actual_columns['tahun_lulus']])
                
                fakultas_nama = None
                if 'fakultas' in actual_columns:
                    fakultas_nama = clean_text(row[actual_columns['fakultas']])
                    # Jika kolom fakultas berisi nama orang (mis-placed), kosongkan agar tidak dibuat sebagai fakultas
                    if fakultas_nama and nama and fakultas_nama.strip().lower() == str(nama).strip().lower():
                        fakultas_nama = None
                
                prodi_nama = None
                if 'prodi' in actual_columns:
                    prodi_nama = clean_text(row[actual_columns['prodi']])
                
                # Ambil status untuk menandai sebagai responden
                status_text = None
                if 'status' in actual_columns:
                    status_text = clean_text(row[actual_columns['status']])
                
                # Validasi data wajib
                if not nim or not nama:
                    skipped_count += 1
                    continue
                
                # Isi dummy untuk data yang null
                if not email:
                    email = get_dummy_value('email')
                
                if not tahun_lulus:
                    tahun_lulus = get_dummy_value('tahun_lulus')
                
                if not fakultas_nama:
                    fakultas_nama = get_dummy_value('fakultas')
                
                if not prodi_nama:
                    prodi_nama = get_dummy_value('prodi')
                
                # Cek apakah NIM sudah ada
                cursor.execute("SELECT id FROM alumni WHERE nim = %s", (nim,))
                existing = cursor.fetchone()
                
                # Get atau create fakultas dan prodi (sebelum cek existing)
                fakultas_id = None
                prodi_id = None
                
                if fakultas_nama:
                    fakultas_id = get_or_create_fakultas(cursor, fakultas_nama)
                    if prodi_nama and fakultas_id:
                        prodi_id = get_or_create_prodi(cursor, prodi_nama, fakultas_id)
                
                alumni_id = None
                
                # Ambil fakultas_id dari prodi_id jika ada
                old_prodi_id = None
                old_fakultas_id = None
                if existing:
                    # Ambil prodi_id lama untuk update jumlah_input
                    cursor.execute("SELECT prodiId FROM alumni WHERE id = %s", (existing[0],))
                    old_prodi_result = cursor.fetchone()
                    if old_prodi_result and old_prodi_result[0]:
                        old_prodi_id = old_prodi_result[0]
                        # Ambil fakultas_id dari prodi lama
                        cursor.execute("SELECT fakultasId FROM prodi WHERE id = %s", (old_prodi_id,))
                        old_fakultas_result = cursor.fetchone()
                        if old_fakultas_result:
                            old_fakultas_id = old_fakultas_result[0]
                
                if existing:
                    # Update data yang sudah ada
                    alumni_id = existing[0]
                    cursor.execute("""
                        UPDATE alumni 
                        SET nama = %s, email = %s, tahun_lulus = %s, prodiId = %s
                        WHERE nim = %s
                    """, (nama, email, tahun_lulus, prodi_id, nim))
                    updated_count += 1
                    
                    # Update jumlah_input untuk prodi dan fakultas lama (jika berubah)
                    if old_prodi_id and old_prodi_id != prodi_id:
                        update_jumlah_input(cursor, old_prodi_id, old_fakultas_id, is_new_insert=False)
                    
                    # Update jumlah_input untuk prodi dan fakultas baru
                    if prodi_id:
                        # Ambil fakultas_id dari prodi baru
                        cursor.execute("SELECT fakultasId FROM prodi WHERE id = %s", (prodi_id,))
                        new_fakultas_result = cursor.fetchone()
                        new_fakultas_id = new_fakultas_result[0] if new_fakultas_result else None
                        update_jumlah_input(cursor, prodi_id, new_fakultas_id, is_new_insert=False)
                else:
                    # Insert alumni baru
                    cursor.execute("""
                        INSERT INTO alumni (nim, nama, email, tahun_lulus, prodiId)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (nim, nama, email, tahun_lulus, prodi_id))
                    alumni_id = cursor.lastrowid
                    inserted_count += 1
                    
                    # Update jumlah_input untuk prodi dan fakultas baru
                    if prodi_id:
                        # Ambil fakultas_id dari prodi
                        cursor.execute("SELECT fakultasId FROM prodi WHERE id = %s", (prodi_id,))
                        fakultas_result = cursor.fetchone()
                        new_fakultas_id = fakultas_result[0] if fakultas_result else None
                        update_jumlah_input(cursor, prodi_id, new_fakultas_id, is_new_insert=True)
                
            except Exception as e:
                print(f"[WARNING] Error pada baris {index}: {str(e)}", file=sys.stderr)
                skipped_count += 1
                continue
        
        # Commit transaksi
        connection.commit()
        cursor.close()
        connection.close()
        
        print(f"[INFO] Data berhasil diimpor: {inserted_count}", file=sys.stderr)
        print(f"[INFO] Data diupdate: {updated_count}", file=sys.stderr)
        print(f"[INFO] Data dilewati: {skipped_count}", file=sys.stderr)
        
        # Return hasil dalam format JSON - HANYA print JSON ke stdout
        result = {
            "success": True,
            "inserted": inserted_count,
            "updated": updated_count,
            "eliminated": eliminated_count,
            "skipped": skipped_count,
            "total_processed": len(df)
        }
        
        # Print JSON ke stdout (hanya JSON, tanpa print lain)
        json_output = json.dumps(result, ensure_ascii=False)
        print(json_output, flush=True)
        return result
        
    except Exception as e:
        import traceback
        error_msg = str(e).replace('\n', ' ').replace('\r', ' ')
        error_result = {
            "success": False,
            "error": error_msg
        }
        # Print error ke stderr sebagai JSON
        json.dump(error_result, sys.stderr, ensure_ascii=False)
        sys.stderr.write('\n')
        sys.stderr.flush()
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "CSV path tidak diberikan"}), file=sys.stderr)
        sys.exit(1)
    
    csv_path = sys.argv[1]
    process_csv(csv_path)
