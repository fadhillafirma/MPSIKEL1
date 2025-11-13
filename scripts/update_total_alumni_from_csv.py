#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script Python untuk mengupdate total alumni per prodi dari CSV
- Membaca CSV dengan format data alumni
- Menghitung jumlah alumni per program studi
- Update kolom jumlah_input di tabel prodi
"""

import sys
import json
import pandas as pd
import mysql.connector
from mysql.connector import Error
import re

# Set encoding untuk output di Windows
if sys.platform == "win32":
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

def clean_text(text):
    """Membersihkan teks dari karakter tidak valid"""
    if pd.isna(text) or text == '' or str(text).strip() == '':
        return None
    text = str(text).strip()
    text = text.replace('"', '').replace("'", '')
    text = re.sub(r'[^\w\s\-.,()/]', '', text)
    return text if text and text != 'nan' else None

def normalize_name(name):
    """Normalisasi nama untuk matching"""
    if not name:
        return None
    name = str(name).strip()
    # Hapus tanda kurung dan isinya jika ada di awal (seperti "(S2)", "(S3)")
    name = re.sub(r'^\([^)]+\)\s*', '', name)
    # Hapus spasi ganda
    name = re.sub(r'\s+', ' ', name)
    return name.strip() if name else None

def get_prodi_id(cursor, prodi_nama, fakultas_id):
    """Mendapatkan ID prodi berdasarkan nama dan fakultas"""
    if not prodi_nama or not fakultas_id:
        return None
    
    prodi_normalized = normalize_name(prodi_nama)
    if not prodi_normalized:
        return None
    
    # Coba exact match (case-insensitive)
    cursor.execute("""
        SELECT id FROM prodi 
        WHERE LOWER(TRIM(nama)) = LOWER(%s) 
        AND fakultasId = %s
        LIMIT 1
    """, (prodi_normalized, fakultas_id))
    result = cursor.fetchone()
    if result:
        return result[0]
    
    # Coba partial match (mengandung nama prodi)
    cursor.execute("""
        SELECT id FROM prodi 
        WHERE LOWER(TRIM(nama)) LIKE LOWER(%s) 
        AND fakultasId = %s
        LIMIT 1
    """, (f"%{prodi_normalized}%", fakultas_id))
    result = cursor.fetchone()
    if result:
        return result[0]
    
    # Coba tanpa memperhatikan fakultas (jika nama prodi sama)
    cursor.execute("""
        SELECT id FROM prodi 
        WHERE LOWER(TRIM(nama)) = LOWER(%s)
        LIMIT 1
    """, (prodi_normalized,))
    result = cursor.fetchone()
    if result:
        return result[0]
    
    return None

def get_fakultas_id(cursor, fakultas_nama):
    """Mendapatkan ID fakultas berdasarkan nama"""
    if not fakultas_nama:
        return None
    
    fakultas_clean = clean_text(fakultas_nama)
    if not fakultas_clean:
        return None
    
    # Coba exact match (case-insensitive)
    cursor.execute("""
        SELECT id FROM fakultas 
        WHERE LOWER(TRIM(nama)) = LOWER(%s)
        LIMIT 1
    """, (fakultas_clean,))
    result = cursor.fetchone()
    if result:
        return result[0]
    
    # Coba partial match
    cursor.execute("""
        SELECT id FROM fakultas 
        WHERE LOWER(TRIM(nama)) LIKE LOWER(%s)
        LIMIT 1
    """, (f"%{fakultas_clean}%",))
    result = cursor.fetchone()
    if result:
        return result[0]
    
    return None

def update_total_alumni_from_csv(csv_path):
    """Memproses CSV dan update total alumni per prodi"""
    try:
        print(f"[INFO] Membaca file CSV: {csv_path}", file=sys.stderr)
        
        # Baca CSV dengan berbagai encoding dan skip rows
        encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']
        skip_rows_options = [0, 1, 2]
        df = None
        used_encoding = None
        used_skiprows = None
        
        for encoding in encodings:
            for skip_rows in skip_rows_options:
                try:
                    test_df = pd.read_csv(csv_path, encoding=encoding, skiprows=skip_rows, nrows=5, on_bad_lines='skip')
                    cols_str = ' '.join([str(c).lower() for c in test_df.columns])
                    if len(test_df) > 0:
                        first_row_str = ' '.join([str(v).lower() for v in test_df.iloc[0].values if pd.notna(v)])
                        if 'program studi' in cols_str or 'prodi' in cols_str or 'fakultas' in cols_str:
                            df = pd.read_csv(csv_path, encoding=encoding, skiprows=skip_rows, on_bad_lines='skip', low_memory=False)
                            used_encoding = encoding
                            used_skiprows = skip_rows
                            print(f"[INFO] Berhasil membaca dengan encoding: {encoding}, skiprows: {skip_rows}", file=sys.stderr)
                            break
                except Exception as e:
                    continue
            if df is not None:
                break
        
        if df is None:
            return {
                "success": False,
                "error": "Gagal membaca file CSV. Pastikan format file benar."
            }
        
        # Deteksi kolom yang ada
        actual_columns = {}
        for col in df.columns:
            col_lower = str(col).lower().strip()
            if 'program studi' in col_lower or col_lower == 'prodi':
                actual_columns['prodi'] = col
            elif 'fakultas' in col_lower:
                actual_columns['fakultas'] = col
        
        if 'prodi' not in actual_columns:
            return {
                "success": False,
                "error": "Kolom 'Program Studi' tidak ditemukan di CSV"
            }
        
        print(f"[INFO] Kolom yang terdeteksi: {actual_columns}", file=sys.stderr)
        
        # Koneksi ke database
        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor()
        
        # Pastikan kolom jumlah_input ada
        try:
            cursor.execute("""
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'prodi' 
                AND COLUMN_NAME = 'jumlah_input'
            """)
            if cursor.fetchone()[0] == 0:
                cursor.execute("ALTER TABLE prodi ADD COLUMN jumlah_input INT DEFAULT 0")
                connection.commit()
                print("[INFO] Kolom jumlah_input ditambahkan ke tabel prodi", file=sys.stderr)
        except Exception as e:
            print(f"[WARNING] Error memastikan kolom jumlah_input: {str(e)}", file=sys.stderr)
        
        # Hitung jumlah alumni per prodi
        prodi_counts = {}
        
        for index, row in df.iterrows():
            try:
                prodi_nama = None
                if 'prodi' in actual_columns:
                    prodi_nama = clean_text(row[actual_columns['prodi']])
                
                fakultas_nama = None
                if 'fakultas' in actual_columns:
                    fakultas_nama = clean_text(row[actual_columns['fakultas']])
                
                if not prodi_nama:
                    continue
                
                # Dapatkan fakultas_id
                fakultas_id = None
                if fakultas_nama:
                    fakultas_id = get_fakultas_id(cursor, fakultas_nama)
                
                # Dapatkan prodi_id
                prodi_id = None
                if fakultas_id:
                    prodi_id = get_prodi_id(cursor, prodi_nama, fakultas_id)
                else:
                    # Coba tanpa fakultas
                    prodi_id = get_prodi_id(cursor, prodi_nama, None)
                
                if prodi_id:
                    if prodi_id not in prodi_counts:
                        prodi_counts[prodi_id] = 0
                    prodi_counts[prodi_id] += 1
                else:
                    print(f"[WARNING] Prodi tidak ditemukan: {prodi_nama} (Fakultas: {fakultas_nama})", file=sys.stderr)
            
            except Exception as e:
                print(f"[WARNING] Error pada baris {index}: {str(e)}", file=sys.stderr)
                continue
        
        # Update jumlah_input di tabel prodi
        updated_count = 0
        for prodi_id, count in prodi_counts.items():
            try:
                cursor.execute("""
                    UPDATE prodi 
                    SET jumlah_input = %s 
                    WHERE id = %s
                """, (count, prodi_id))
                updated_count += 1
                print(f"[INFO] Prodi ID {prodi_id}: {count} alumni", file=sys.stderr)
            except Exception as e:
                print(f"[WARNING] Error update prodi {prodi_id}: {str(e)}", file=sys.stderr)
        
        # Update jumlah_input di tabel fakultas (sum dari semua prodi)
        cursor.execute("""
            UPDATE fakultas f
            SET f.jumlah_input = (
                SELECT COALESCE(SUM(COALESCE(p.jumlah_input, 0)), 0)
                FROM prodi p
                WHERE p.fakultasId = f.id
            )
        """)
        
        connection.commit()
        cursor.close()
        connection.close()
        
        # Hitung total alumni
        total_alumni = sum(prodi_counts.values())
        
        print(f"[INFO] Total prodi yang diupdate: {updated_count}", file=sys.stderr)
        print(f"[INFO] Total alumni: {total_alumni}", file=sys.stderr)
        
        return {
            "success": True,
            "updated": updated_count,
            "total_alumni": total_alumni,
            "prodi_counts": len(prodi_counts)
        }
    
    except Exception as e:
        error_msg = str(e)
        print(f"[ERROR] {error_msg}", file=sys.stderr)
        return {
            "success": False,
            "error": error_msg
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "File CSV tidak ditemukan. Usage: python update_total_alumni_from_csv.py <path_to_csv>"
        }))
        sys.exit(1)
    
    csv_path = sys.argv[1]
    result = update_total_alumni_from_csv(csv_path)
    print(json.dumps(result))
    sys.exit(0 if result.get("success") else 1)

