#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script Python untuk preview data CSV sebelum diimport
- Membaca file CSV dengan berbagai encoding
- Deteksi kolom otomatis
- Validasi data dasar
- Mengembalikan preview dalam format JSON (maksimal 20 baris)
"""

import sys
import json
import pandas as pd
import re
from datetime import datetime

# Set encoding untuk output di Windows
if sys.platform == "win32":
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8')


def clean_text(text):
    """Membersihkan teks dari karakter tidak valid"""
    if pd.isna(text) or text == '' or str(text).strip() == '':
        return None
    text = str(text).strip()
    text = text.replace('"', '').replace("'", '')
    text = re.sub(r'[^\w\s\-.,()/]', '', text)
    return text if text and text != 'nan' else None


def clean_nim(nim):
    """Membersihkan NIM dari karakter tidak valid"""
    if pd.isna(nim) or nim == '':
        return None
    nim = str(nim).strip()
    nim = nim.replace('"', '').replace("'", '')
    nim = re.sub(r'[^\w]', '', nim)
    return nim if len(nim) >= 5 else None


def validate_nim(nim):
    """Validasi NIM (harus alphanumeric, minimal 5 karakter)"""
    nim = clean_nim(nim)
    return nim if nim and len(nim) >= 5 else None


def detect_columns(df):
    """Deteksi kolom otomatis dari DataFrame - Menggabungkan logika dari process_csv.py dan update_total_responden_from_csv.py"""
    mapping = {}
    
    # Deteksi berdasarkan nama kolom (seperti update_total_responden_from_csv.py)
    for col in df.columns:
        col_lower = str(col).lower().strip()
        
        # Deteksi Prodi (prioritas tinggi)
        if "prodi" not in mapping:
            if col_lower in {"prodi", "program studi", "program studi:", "program studi"}:
                mapping["prodi"] = col
                continue
        if "prodi" not in mapping and "program studi" in col_lower and not col_lower.startswith("ts"):
            mapping["prodi"] = col
            continue
        if "prodi" not in mapping and "af3" in col_lower and "prodi" in col_lower:
            mapping["prodi"] = col
            continue
        
        # Deteksi Fakultas
        if "fakultas" not in mapping and (col_lower == "fakultas" or ("fakultas" in col_lower and len(col_lower) <= 40)):
            mapping["fakultas"] = col
            continue
        
        # Deteksi NIM
        if "nim" not in mapping and ("nomor mahasiswa" in col_lower or col_lower == "nim" or "bp/nim" in col_lower or col_lower == "no bp" or ("bp" in col_lower and "nim" in col_lower)):
            mapping["nim"] = col
            continue
        if "nim" not in mapping and (col_lower == "nim" or (col_lower.startswith("nim") and len(col_lower) <= 10)):
            mapping["nim"] = col
            continue
        
        # Deteksi Nama Lengkap
        if "nama_lengkap" not in mapping and ("nama lengkap" in col_lower or col_lower.startswith("af4")):
            mapping["nama_lengkap"] = col
            continue
        
        # Deteksi Nama
        if "nama" not in mapping and (col_lower in {"nama", "nama mahasiswa", "nama mahasiswa/mahasiswi"} or "nama mahasiswa" in col_lower):
            mapping["nama"] = col
            continue
        
        # Deteksi Email
        if "email" not in mapping and (col_lower == "email" or col_lower.startswith("email")):
            mapping["email"] = col
            continue
        if "email" not in mapping and "email" in col_lower and len(col_lower) <= 60:
            mapping["email"] = col
            continue
        
        # Deteksi Tahun Lulus
        if "tahun_lulus" not in mapping and "tahun lulus" in col_lower:
            mapping["tahun_lulus"] = col
            continue
        
        # Deteksi F8 (Status untuk responden)
        if "f8" not in mapping and (col_lower == "f8" or ("jelaskan status" in col_lower and "saat ini" in col_lower)):
            mapping["f8"] = col
            continue
        
        # Deteksi Status
        if "status" not in mapping and "status" in col_lower and "f8" not in mapping:
            mapping["status"] = col
            continue
        
        # Deteksi F504
        if "f504" not in mapping and (col_lower == "f504" or ("mendapatkan pekerjaan" in col_lower and "berwirausaha" in col_lower)):
            mapping["f504"] = col
            continue
    
    # Validasi data seperti di process_csv.py (untuk NIM dan Nama)
    if len(df) > 0:
        # Validasi NIM: cek apakah kolom benar-benar berisi data seperti NIM
        if "nim" in mapping:
            nim_col = mapping["nim"]
            sample_val = str(df[nim_col].iloc[0]) if pd.notna(df[nim_col].iloc[0]) else ''
            cleaned_val = sample_val.replace('"', '').replace("'", '').strip()
            # Jika data tidak terlihat seperti NIM (8-12 digit), cari berdasarkan pattern
            if not (cleaned_val.isdigit() and 8 <= len(cleaned_val) <= 12):
                # Cari kolom lain yang berisi data seperti NIM
                for col in df.columns:
                    if col != nim_col:
                        sample_val = str(df[col].iloc[0]) if pd.notna(df[col].iloc[0]) else ''
                        cleaned_val = sample_val.replace('"', '').replace("'", '').strip()
                        if cleaned_val.isdigit() and 8 <= len(cleaned_val) <= 12:
                            mapping["nim"] = col
                            break
        
        # Validasi Nama: cek apakah kolom benar-benar berisi data seperti nama
        nama_col = mapping.get("nama_lengkap") or mapping.get("nama")
        if nama_col:
            sample_val = str(df[nama_col].iloc[0]) if pd.notna(df[nama_col].iloc[0]) else ''
            # Jika data tidak terlihat seperti nama, cari berdasarkan pattern
            if not (sample_val and not sample_val.replace(' ', '').isdigit() and len(sample_val) > 3 and len(sample_val) < 50 and not (sample_val.isdigit() and len(sample_val) >= 8)):
                # Cari kolom lain yang berisi data seperti nama
                for col in df.columns:
                    if col != nama_col and col != mapping.get("nim"):
                        sample_val = str(df[col].iloc[0]) if pd.notna(df[col].iloc[0]) else ''
                        if sample_val and not sample_val.replace(' ', '').isdigit() and len(sample_val) > 3 and len(sample_val) < 50:
                            if not (sample_val.isdigit() and len(sample_val) >= 8):
                                if "nama" not in mapping:
                                    mapping["nama"] = col
                                break
    
    return mapping


def preview_csv(csv_path):
    """Memproses file CSV dan mengembalikan preview data"""
    try:
        print(f"[INFO] Membaca file CSV: {csv_path}", file=sys.stderr)
        
        # Coba berbagai encoding dan skip rows
        encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']
        skip_rows_options = [0, 1, 2]
        df = None
        used_encoding = None
        used_skiprows = None
        
        for encoding in encodings:
            for skip_rows in skip_rows_options:
                try:
                    # Test read dengan skip rows yang berbeda
                    test_df = pd.read_csv(csv_path, encoding=encoding, skiprows=skip_rows, nrows=5, on_bad_lines='skip')
                    cols_str = ' '.join([str(c).lower() for c in test_df.columns])
                    
                    if len(test_df) > 0:
                        first_row_str = ' '.join([str(v).lower() for v in test_df.iloc[0].values if pd.notna(v)])
                        # Jika ada kolom NIM atau nama di header, atau data pertama terlihat seperti NIM/nama
                        if 'nim' in cols_str or 'nama' in cols_str or 'prodi' in cols_str or 'fakultas' in cols_str:
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
                try:
                    df = pd.read_csv(csv_path, encoding='utf-8', skiprows=1, on_bad_lines='skip', low_memory=False)
                    used_encoding = 'utf-8'
                    used_skiprows = 1
                except:
                    df = pd.read_csv(csv_path, encoding='utf-8', skiprows=2, on_bad_lines='skip', low_memory=False)
                    used_encoding = 'utf-8'
                    used_skiprows = 2
        
        if df is None or len(df) == 0:
            return {
                "success": False,
                "error": "File CSV kosong atau tidak dapat dibaca"
            }
        
        print(f"[INFO] Total baris sebelum cleaning: {len(df)}", file=sys.stderr)
        print(f"[INFO] Total kolom: {len(df.columns)}", file=sys.stderr)
        print(f"[INFO] Kolom yang ditemukan (10 pertama): {list(df.columns[:10])}", file=sys.stderr)
        
        # 1. DATA CLEANING - Hapus baris yang semua kolomnya kosong (seperti process_csv.py)
        before_empty = len(df)
        df = df.dropna(how='all')
        print(f"[INFO] Hapus baris kosong: {before_empty} -> {len(df)}", file=sys.stderr)
        
        # Normalisasi nama kolom (lowercase, hapus spasi, hapus karakter khusus)
        df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_').str.replace('#', '')
        
        # 2. Deteksi kolom otomatis dengan validasi data
        detected_columns = detect_columns(df)
        print(f"[INFO] Kolom terdeteksi: {detected_columns}", file=sys.stderr)
        
        # Ambil maksimal 20 baris untuk preview
        preview_rows = min(20, len(df))
        df_preview = df.head(preview_rows)
        
        # Konversi ke format yang bisa di-serialize ke JSON
        headers = list(df.columns)
        rows = []
        
        for index, row in df_preview.iterrows():
            row_data = []
            for col in headers:
                value = row[col]
                if pd.isna(value):
                    row_data.append(None)
                else:
                    # Truncate jika terlalu panjang
                    str_value = str(value)
                    if len(str_value) > 100:
                        str_value = str_value[:100] + '...'
                    row_data.append(str_value)
            rows.append(row_data)
        
        # Hitung statistik
        total_rows = len(df)
        total_columns = len(headers)
        
        # Validasi data dasar
        validation_stats = {
            "rows_with_nim": 0,
            "rows_with_nama": 0,
            "rows_with_prodi": 0,
            "rows_with_fakultas": 0,
            "rows_with_email": 0,
            "rows_with_tahun_lulus": 0
        }
        
        if detected_columns.get("nim"):
            validation_stats["rows_with_nim"] = df[detected_columns["nim"]].notna().sum()
        if detected_columns.get("nama") or detected_columns.get("nama_lengkap"):
            nama_col = detected_columns.get("nama") or detected_columns.get("nama_lengkap")
            validation_stats["rows_with_nama"] = df[nama_col].notna().sum() if nama_col else 0
        if detected_columns.get("prodi"):
            validation_stats["rows_with_prodi"] = df[detected_columns["prodi"]].notna().sum()
        if detected_columns.get("fakultas"):
            validation_stats["rows_with_fakultas"] = df[detected_columns["fakultas"]].notna().sum()
        if detected_columns.get("email"):
            validation_stats["rows_with_email"] = df[detected_columns["email"]].notna().sum()
        if detected_columns.get("tahun_lulus"):
            validation_stats["rows_with_tahun_lulus"] = df[detected_columns["tahun_lulus"]].notna().sum()
        
        result = {
            "success": True,
            "headers": headers,
            "rows": rows,
            "total_rows": total_rows,
            "total_columns": total_columns,
            "preview_rows": preview_rows,
            "detected_columns": detected_columns,
            "validation_stats": validation_stats,
            "encoding": used_encoding,
            "skip_rows": used_skiprows
        }
        
        return result
        
    except Exception as e:
        import traceback
        error_msg = str(e).replace('\n', ' ').replace('\r', ' ')
        print(f"[ERROR] {error_msg}", file=sys.stderr)
        print(f"[ERROR] Traceback: {traceback.format_exc()}", file=sys.stderr)
        return {
            "success": False,
            "error": error_msg
        }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        error_result = {
            "success": False,
            "error": "CSV path tidak diberikan"
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)
    
    csv_path = sys.argv[1]
    result = preview_csv(csv_path)
    
    # Print JSON ke stdout (hanya JSON, tanpa print lain)
    # Pastikan tidak ada output lain sebelum atau sesudah JSON
    try:
        json_output = json.dumps(result, ensure_ascii=False)
        # Hanya print JSON, tidak ada karakter lain
        sys.stdout.write(json_output)
        sys.stdout.flush()
    except Exception as e:
        error_result = {
            "success": False,
            "error": f"Error serializing JSON: {str(e)}"
        }
        sys.stdout.write(json.dumps(error_result))
        sys.stdout.flush()
        sys.exit(1)
    
    sys.exit(0 if result.get("success") else 1)

