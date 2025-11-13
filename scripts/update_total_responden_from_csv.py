#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script Python untuk mengolah data responden tracer study:
- Membaca CSV hasil tracer (seperti Data Bersih Sistem Informasi)
- Memastikan data alumni tercatat (menambah jika belum ada)
- Menandai alumni sebagai responden sesuai status tracer study
- Menghitung total responden per prodi dan menyimpannya di kolom jumlah_responden
"""

import sys
import json
import re
from datetime import datetime
from collections import defaultdict

import pandas as pd
import mysql.connector

# Konfigurasi database
DB_CONFIG = {
    "host": "localhost",
    "user": "root",  # sesuaikan dengan konfigurasi Anda
    "password": "",
    "database": "tracer_study_sederhana",
}


# Pastikan output console di Windows menggunakan UTF-8
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------
def clean_text(text):
    if pd.isna(text) or str(text).strip() == "":
        return None
    text = str(text).strip()
    text = text.replace('"', "").replace("'", "")
    text = re.sub(r"[^\w\s\-.,()/@]", "", text)
    return text if text.lower() != "nan" else None


def clean_nim(nim):
    if pd.isna(nim) or nim == "":
        return None
    nim = str(nim).strip()
    nim = nim.replace('"', "").replace("'", "")
    nim = re.sub(r"[^\w]", "", nim)
    return nim if nim else None


def validate_nim(nim):
    nim = clean_nim(nim)
    return nim if nim and len(nim) >= 5 else None


def validate_email(email):
    if pd.isna(email) or not email:
        return None
    email = str(email).strip().lower().replace('"', "").replace("'", "")
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    return email if re.match(pattern, email) else None


def validate_tahun(tahun):
    if pd.isna(tahun) or tahun == "":
        return None
    try:
        tahun_str = str(tahun).strip().replace('"', "").replace("'", "")
        tahun_val = int(float(tahun_str))
        if 2000 <= tahun_val <= 2035:
            return tahun_val
    except Exception:
        pass
    return None


def normalize_name(name):
    if not name:
        return None
    name = str(name).strip()
    name = re.sub(r"^\([^)]+\)\s*", "", name)  # hapus awalan (S2) / (S3)
    name = re.sub(r"\s+", " ", name)
    return name if name else None


def ensure_jumlah_input_columns(cursor):
    try:
        cursor.execute(
            """
            SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'fakultas'
            AND COLUMN_NAME = 'jumlah_input'
        """
        )
        if cursor.fetchone()[0] == 0:
            cursor.execute("ALTER TABLE fakultas ADD COLUMN jumlah_input INT DEFAULT 0")

        cursor.execute(
            """
            SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'prodi'
            AND COLUMN_NAME = 'jumlah_input'
        """
        )
        if cursor.fetchone()[0] == 0:
            cursor.execute("ALTER TABLE prodi ADD COLUMN jumlah_input INT DEFAULT 0")
    except Exception as err:
        print(f"[WARNING] Gagal memastikan kolom jumlah_input: {err}", file=sys.stderr)


def ensure_jumlah_responden_column(cursor):
    try:
        cursor.execute(
            """
            SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'prodi'
            AND COLUMN_NAME = 'jumlah_responden'
        """
        )
        if cursor.fetchone()[0] == 0:
            cursor.execute("ALTER TABLE prodi ADD COLUMN jumlah_responden INT DEFAULT 0")
    except Exception as err:
        print(f"[WARNING] Gagal memastikan kolom jumlah_responden: {err}", file=sys.stderr)


def update_jumlah_input(cursor, prodi_id, fakultas_id, is_new_insert=True):
    try:
        if prodi_id:
            if is_new_insert:
                cursor.execute(
                    """
                    UPDATE prodi
                    SET jumlah_input = COALESCE(jumlah_input, 0) + 1
                    WHERE id = %s
                """,
                    (prodi_id,),
                )
            else:
                cursor.execute(
                    """
                    UPDATE prodi
                    SET jumlah_input = (
                        SELECT COUNT(*)
                        FROM alumni
                        WHERE prodiId = %s
                    )
                    WHERE id = %s
                """,
                    (prodi_id, prodi_id),
                )

        if fakultas_id:
            cursor.execute(
                """
                UPDATE fakultas
                SET jumlah_input = (
                    SELECT COUNT(*)
                    FROM alumni a
                    JOIN prodi p ON a.prodiId = p.id
                    WHERE p.fakultasId = %s
                )
                WHERE id = %s
            """,
                (fakultas_id, fakultas_id),
            )
    except Exception as err:
        print(f"[WARNING] Gagal mengupdate jumlah_input: {err}", file=sys.stderr)


def get_fakultas_id(cursor, nama_fakultas):
    if not nama_fakultas:
        return None
    nama = clean_text(nama_fakultas)
    if not nama:
        return None

    cursor.execute(
        """
        SELECT id FROM fakultas
        WHERE LOWER(TRIM(nama)) = LOWER(%s)
        LIMIT 1
    """,
        (nama,),
    )
    result = cursor.fetchone()
    if result:
        return result[0]

    cursor.execute(
        """
        SELECT id FROM fakultas
        WHERE LOWER(TRIM(nama)) LIKE LOWER(%s)
        LIMIT 1
    """,
        (f"%{nama}%",),
    )
    result = cursor.fetchone()
    if result:
        return result[0]
    return None


def get_prodi_id(cursor, nama_prodi, fakultas_id=None):
    if not nama_prodi:
        return None

    nama = normalize_name(nama_prodi)
    if not nama:
        return None

    params = (nama, fakultas_id) if fakultas_id else (nama,)
    query = (
        """
        SELECT id FROM prodi
        WHERE LOWER(TRIM(nama)) = LOWER(%s) AND fakultasId = %s
        LIMIT 1
    """
        if fakultas_id
        else """
        SELECT id FROM prodi
        WHERE LOWER(TRIM(nama)) = LOWER(%s)
        LIMIT 1
    """
    )
    cursor.execute(query, params)
    result = cursor.fetchone()
    if result:
        return result[0]

    params_like = (f"%{nama}%", fakultas_id) if fakultas_id else (f"%{nama}%",)
    query_like = (
        """
        SELECT id FROM prodi
        WHERE LOWER(TRIM(nama)) LIKE LOWER(%s) AND fakultasId = %s
        LIMIT 1
    """
        if fakultas_id
        else """
        SELECT id FROM prodi
        WHERE LOWER(TRIM(nama)) LIKE LOWER(%s)
        LIMIT 1
    """
    )
    cursor.execute(query_like, params_like)
    result = cursor.fetchone()
    if result:
        return result[0]
    return None


def get_or_create_opsi_jawaban(cursor, teks_opsi):
    cursor.execute(
        """
        SELECT id FROM opsi_jawaban
        WHERE LOWER(TRIM(teks_opsi)) = LOWER(%s)
        LIMIT 1
    """,
        (teks_opsi.strip(),),
    )
    result = cursor.fetchone()
    if result:
        return result[0]

    cursor.execute(
        """
        INSERT INTO opsi_jawaban (teks_opsi, nilai)
        VALUES (%s, 0.00)
    """,
        (teks_opsi.strip(),),
    )
    return cursor.lastrowid


def map_status_to_opsi(status_text):
    if not status_text:
        return "Belum Bekerja"
    status_lower = status_text.lower()
    if "wirausaha" in status_lower:
        return "Wirausaha"
    if "pendidikan" in status_lower or "studi" in status_lower:
        return "Pendidikan Lanjut"
    if "tidak kerja tetapi" in status_lower or "mencari" in status_lower:
        return "Belum Bekerja"
    if "bekerja" in status_lower:
        return "Bekerja"
    return "Belum Bekerja"


def mark_as_responden(cursor, alumni_id, status_text=None):
    if not alumni_id:
        return
    opsi_teks = map_status_to_opsi(status_text)
    opsi_id = get_or_create_opsi_jawaban(cursor, opsi_teks)

    cursor.execute(
        """
        SELECT id FROM jawaban_opsi
        WHERE alumniId = %s AND opsiJawabanId = %s
        LIMIT 1
    """,
        (alumni_id, opsi_id),
    )
    if cursor.fetchone():
        return

    cursor.execute(
        """
        INSERT INTO jawaban_opsi (alumniId, opsiJawabanId)
        VALUES (%s, %s)
    """,
        (alumni_id, opsi_id),
    )


def is_responden(row, columns):
    status_value = None
    if "f8" in columns:
        status_value = clean_text(row[columns["f8"]])
    elif "status" in columns:
        status_value = clean_text(row[columns["status"]])

    if status_value:
        status_lower = status_value.lower()
        if any(keyword in status_lower for keyword in ["bekerja", "wirausaha", "pendidikan", "mencari", "tidak kerja tetapi"]):
            return True
        if "belum" in status_lower and "mencari" not in status_lower:
            return False

    if "f504" in columns:
        f504_value = clean_text(row[columns["f504"]])
        if f504_value:
            f504_lower = f504_value.lower()
            if f504_lower == "ya" or "mendapatkan" in f504_lower:
                return True

    if "nim" in columns:
        nim_value = validate_nim(row[columns["nim"]])
        if nim_value:
            return True

    for key in ["nama_lengkap", "nama"]:
        if key in columns:
            nama_val = clean_text(row[columns[key]])
            if nama_val:
                return True

    return False


def detect_columns(df):
    mapping = {}
    for col in df.columns:
        col_lower = str(col).lower().strip()

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

        if "fakultas" not in mapping and (col_lower == "fakultas" or "fakultas" in col_lower and len(col_lower) <= 40):
            mapping["fakultas"] = col
            continue

        if "nim" not in mapping and ("nomor mahasiswa" in col_lower or col_lower == "nim" or "bp/nim" in col_lower or col_lower == "no bp" or "bp" in col_lower and "nim" in col_lower):
            mapping["nim"] = col
            continue

        if "nama_lengkap" not in mapping and ("nama lengkap" in col_lower or col_lower.startswith("af4")):
            mapping["nama_lengkap"] = col
            continue

        if "nama" not in mapping and (col_lower in {"nama", "nama mahasiswa", "nama mahasiswa/mahasiswi"} or "nama mahasiswa" in col_lower):
            mapping["nama"] = col
            continue

        if "email" not in mapping and (col_lower == "email" or col_lower.startswith("email")):
            mapping["email"] = col
            continue

        if "email" not in mapping and "email" in col_lower and len(col_lower) <= 60:
            mapping["email"] = col
            continue

        if "tahun_lulus" not in mapping and "tahun lulus" in col_lower:
            mapping["tahun_lulus"] = col
            continue

        if "f8" not in mapping and (col_lower == "f8" or ("jelaskan status" in col_lower and "saat ini" in col_lower)):
            mapping["f8"] = col
            continue

        if "status" not in mapping and "status" in col_lower and "f8" not in mapping:
            mapping["status"] = col
            continue

        if "f504" not in mapping and (col_lower == "f504" or ("mendapatkan pekerjaan" in col_lower and "berwirausaha" in col_lower)):
            mapping["f504"] = col
            continue
    return mapping


def ensure_dashboard_settings(cursor):
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS dashboard_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                setting_key VARCHAR(100) NOT NULL UNIQUE,
                setting_value TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """
        )
    except Exception as err:
        print(f"[WARNING] Gagal memastikan tabel dashboard_settings: {err}", file=sys.stderr)


def update_total_alumni_setting(cursor):
    try:
        cursor.execute(
            """
            SELECT COALESCE(SUM(COALESCE(jumlah_input, 0)), 0) AS total
            FROM prodi
        """
        )
        total = cursor.fetchone()[0] or 0
        cursor.execute(
            """
            INSERT INTO dashboard_settings (setting_key, setting_value)
            VALUES ('total_alumni', %s)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()
        """,
            (str(total),),
        )
    except Exception as err:
        print(f"[WARNING] Gagal memperbarui dashboard_settings: {err}", file=sys.stderr)


def ensure_responden_table(cursor):
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS responden (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nim VARCHAR(30) UNIQUE,
                nama VARCHAR(150) NOT NULL,
                email VARCHAR(150),
                tahun_lulus YEAR(4),
                prodiId INT,
                jumlah_input INT DEFAULT 1,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_responden_prodi (prodiId),
                CONSTRAINT fk_responden_prodi FOREIGN KEY (prodiId) REFERENCES prodi(id) ON DELETE SET NULL ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        """
        )
    except Exception as err:
        print(f"[WARNING] Gagal memastikan tabel responden: {err}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Main Processing Function
# ---------------------------------------------------------------------------
def update_total_responden_from_csv(csv_path):
    try:
        print(f"[INFO] Membaca file CSV: {csv_path}", file=sys.stderr)

        encodings = ["utf-8", "latin-1", "iso-8859-1", "cp1252"]
        skip_rows_options = [0, 1, 2]
        df = None

        for encoding in encodings:
            for skip_rows in skip_rows_options:
                try:
                    preview = pd.read_csv(
                        csv_path,
                        encoding=encoding,
                        skiprows=skip_rows,
                        nrows=5,
                        on_bad_lines="skip",
                    )
                    cols_str = " ".join([str(c).lower() for c in preview.columns])
                    if len(preview) > 0 and (
                        "prodi" in cols_str or "fakultas" in cols_str or "nim" in cols_str
                    ):
                        df = pd.read_csv(
                            csv_path,
                            encoding=encoding,
                            skiprows=skip_rows,
                            on_bad_lines="skip",
                            low_memory=False,
                        )
                        print(
                            f"[INFO] Berhasil membaca dengan encoding: {encoding}, skiprows: {skip_rows}",
                            file=sys.stderr,
                        )
                        break
                except Exception:
                    continue
            if df is not None:
                break

        if df is None:
            return {"success": False, "error": "Gagal membaca file CSV. Pastikan format benar."}

        columns = detect_columns(df)
        if "prodi" not in columns:
            return {"success": False, "error": "Kolom 'Program Studi' tidak ditemukan pada CSV"}

        print(f"[INFO] Kolom terdeteksi: {columns}", file=sys.stderr)

        # Normalisasi nama kolom agar hanya mengambil kolom yang relevan
        rename_map = {}
        if columns.get("nama_lengkap"):
            rename_map[columns["nama_lengkap"]] = "nama_lengkap"
        if columns.get("nama"):
            rename_map[columns["nama"]] = "nama"
        if columns.get("nim"):
            rename_map[columns["nim"]] = "nim"
        if columns.get("fakultas"):
            rename_map[columns["fakultas"]] = "fakultas"
        if columns.get("prodi"):
            rename_map[columns["prodi"]] = "prodi"
        if columns.get("tahun_lulus"):
            rename_map[columns["tahun_lulus"]] = "tahun_lulus"
        if columns.get("email"):
            rename_map[columns["email"]] = "email"
        if columns.get("f8"):
            rename_map[columns["f8"]] = "f8"
        if columns.get("status"):
            rename_map[columns["status"]] = "status"
        if columns.get("f504"):
            rename_map[columns["f504"]] = "f504"

        if rename_map:
            df = df.rename(columns=rename_map)

        selected_columns_order = [
            "nama_lengkap",
            "nama",
            "nim",
            "fakultas",
            "prodi",
            "tahun_lulus",
            "email",
            "f8",
            "status",
            "f504",
        ]
        selected_columns = [col for col in selected_columns_order if col in df.columns]
        if selected_columns:
            df = df[selected_columns].copy()

        columns = {col: col for col in selected_columns}

        connection = mysql.connector.connect(**DB_CONFIG)
        cursor = connection.cursor()

        ensure_jumlah_input_columns(cursor)
        ensure_jumlah_responden_column(cursor)
        ensure_dashboard_settings(cursor)
        ensure_responden_table(cursor)

        cursor.execute("SELECT id, fakultasId FROM prodi")
        prodi_to_fakultas = {row[0]: row[1] for row in cursor.fetchall()}

        prodi_responden_sets = defaultdict(set)
        prodi_alumni_sets = defaultdict(set)
        affected_fakultas = set()
        affected_prodi = set()
        added_alumni = 0
        added_responden = 0

        for index, row in df.iterrows():
            try:
                prodi_nama = clean_text(row[columns["prodi"]])
                if not prodi_nama:
                    continue

                fakultas_nama = (
                    clean_text(row[columns["fakultas"]]) if "fakultas" in columns else None
                )
                fakultas_id = get_fakultas_id(cursor, fakultas_nama) if fakultas_nama else None
                prodi_id = get_prodi_id(cursor, prodi_nama, fakultas_id) or get_prodi_id(
                    cursor, prodi_nama
                )
                if not prodi_id:
                    print(
                        f"[WARNING] Prodi tidak ditemukan: {prodi_nama} (Fakultas: {fakultas_nama})",
                        file=sys.stderr,
                    )
                    continue

                nim = validate_nim(row[columns["nim"]]) if "nim" in columns else None

                nama_val = None
                for key in ["nama_lengkap", "nama"]:
                    if key in columns:
                        nama_val = clean_text(row[columns[key]])
                        if nama_val:
                            break

                email_val = validate_email(row[columns["email"]]) if "email" in columns else None
                tahun_lulus_val = (
                    validate_tahun(row[columns["tahun_lulus"]])
                    if "tahun_lulus" in columns
                    else None
                )

                alumni_id = None
                target_prodi_id = prodi_id

                if nim:
                    cursor.execute("SELECT id, prodiId FROM alumni WHERE nim = %s LIMIT 1", (nim,))
                    result = cursor.fetchone()
                    if result:
                        alumni_id = result[0]
                        existing_prodi = result[1]
                        if existing_prodi:
                            target_prodi_id = existing_prodi
                        elif prodi_id:
                            cursor.execute(
                                "UPDATE alumni SET prodiId = %s WHERE id = %s",
                                (prodi_id, alumni_id),
                            )
                            update_jumlah_input(cursor, prodi_id, fakultas_id, is_new_insert=False)

                if not alumni_id and nama_val:
                    cursor.execute(
                        """
                        SELECT id, prodiId FROM alumni
                        WHERE LOWER(TRIM(nama)) = LOWER(%s)
                        LIMIT 1
                    """,
                        (nama_val,),
                    )
                    result = cursor.fetchone()
                    if result:
                        alumni_id = result[0]
                        existing_prodi = result[1]
                        if existing_prodi:
                            target_prodi_id = existing_prodi
                        elif prodi_id:
                            cursor.execute(
                                "UPDATE alumni SET prodiId = %s WHERE id = %s",
                                (prodi_id, alumni_id),
                            )
                            update_jumlah_input(cursor, prodi_id, fakultas_id, is_new_insert=False)

                if not alumni_id:
                    cursor.execute(
                        """
                        INSERT INTO alumni (nim, nama, email, tahun_lulus, prodiId)
                        VALUES (%s, %s, %s, %s, %s)
                    """,
                        (
                            nim,
                            nama_val or "Responden Tanpa Nama",
                            email_val,
                            tahun_lulus_val or datetime.now().year,
                            prodi_id,
                        ),
                    )
                    alumni_id = cursor.lastrowid
                    target_prodi_id = prodi_id
                    added_alumni += 1
                    update_jumlah_input(cursor, prodi_id, fakultas_id, is_new_insert=True)
                else:
                    if not target_prodi_id and prodi_id:
                        target_prodi_id = prodi_id

                if target_prodi_id:
                    affected_prodi.add(target_prodi_id)

                responden_id = None
                if nim:
                    cursor.execute("SELECT id, prodiId FROM responden WHERE nim = %s LIMIT 1", (nim,))
                    result = cursor.fetchone()
                    if result:
                        responden_id = result[0]
                        existing_prodi = result[1]
                        if prodi_id and existing_prodi != prodi_id:
                            cursor.execute(
                                "UPDATE responden SET prodiId = %s WHERE id = %s",
                                (prodi_id, responden_id),
                            )
                        if email_val:
                            cursor.execute(
                                "UPDATE responden SET email = %s WHERE id = %s",
                                (email_val, responden_id),
                            )
                    else:
                        cursor.execute(
                            """
                            INSERT INTO responden (nim, nama, email, tahun_lulus, prodiId, jumlah_input)
                            VALUES (%s, %s, %s, %s, %s, 1)
                        """,
                            (
                                nim,
                                nama_val or "Responden Tanpa Nama",
                                email_val,
                                tahun_lulus_val or datetime.now().year,
                                target_prodi_id,
                            ),
                        )
                        responden_id = cursor.lastrowid
                        added_responden += 1
                elif nama_val:
                    cursor.execute(
                        """
                        SELECT id, prodiId FROM responden
                        WHERE nim IS NULL AND LOWER(TRIM(nama)) = LOWER(%s)
                        LIMIT 1
                    """,
                        (nama_val,)
                    )
                    result = cursor.fetchone()
                    if result:
                        responden_id = result[0]
                        existing_prodi = result[1]
                        if prodi_id and existing_prodi != prodi_id:
                            cursor.execute(
                                "UPDATE responden SET prodiId = %s WHERE id = %s",
                                (prodi_id, responden_id),
                            )
                        if email_val:
                            cursor.execute(
                                "UPDATE responden SET email = %s WHERE id = %s",
                                (email_val, responden_id),
                            )
                    else:
                        cursor.execute(
                            """
                            INSERT INTO responden (nim, nama, email, tahun_lulus, prodiId, jumlah_input)
                            VALUES (NULL, %s, %s, %s, %s, 1)
                        """,
                            (
                                nama_val,
                                email_val,
                                tahun_lulus_val or datetime.now().year,
                                target_prodi_id,
                            ),
                        )
                        responden_id = cursor.lastrowid
                        added_responden += 1

                if alumni_id and target_prodi_id:
                    prodi_alumni_sets[target_prodi_id].add(alumni_id)
                    fakultas_for_prodi = prodi_to_fakultas.get(target_prodi_id)
                    if fakultas_for_prodi:
                        affected_fakultas.add(fakultas_for_prodi)

                if responden_id and target_prodi_id:
                    prodi_responden_sets[target_prodi_id].add(responden_id)

                if responden_id and is_responden(row, columns):
                    status_text = None
                    if "f8" in columns:
                        status_text = clean_text(row[columns["f8"]])
                    elif "status" in columns:
                        status_text = clean_text(row[columns["status"]])
                    mark_as_responden(cursor, alumni_id, status_text)

            except Exception as err:
                print(f"[WARNING] Error pada baris {index}: {err}", file=sys.stderr)
                continue

        # Pastikan prodi yang ada responden lama juga ikut dicek
        cursor.execute("SELECT DISTINCT prodiId FROM responden WHERE prodiId IS NOT NULL")
        for row in cursor.fetchall():
            if row[0]:
                affected_prodi.add(row[0])

        # Update jumlah_responden per prodi berdasarkan tabel responden
        updated_count = 0
        total_responden = 0

        for prodi_id in affected_prodi:
            try:
                cursor.execute(
                    "SELECT COUNT(*) FROM responden WHERE prodiId = %s",
                    (prodi_id,),
                )
                count = cursor.fetchone()[0] or 0
                cursor.execute(
                    "UPDATE prodi SET jumlah_responden = %s WHERE id = %s",
                    (count, prodi_id),
                )
                total_responden += count
                updated_count += 1
            except Exception as err:
                print(f"[WARNING] Error update prodi {prodi_id}: {err}", file=sys.stderr)

        # Update jumlah_input per prodi menggunakan prodi_alumni_sets
        for prodi_id in affected_prodi:
            try:
                cursor.execute(
                    "SELECT COUNT(*) FROM alumni WHERE prodiId = %s",
                    (prodi_id,),
                )
                count = cursor.fetchone()[0] or 0
                cursor.execute(
                    "UPDATE prodi SET jumlah_input = %s WHERE id = %s",
                    (count, prodi_id),
                )
                fakultas_for_prodi = prodi_to_fakultas.get(prodi_id)
                if fakultas_for_prodi:
                    affected_fakultas.add(fakultas_for_prodi)
            except Exception as err:
                print(f"[WARNING] Error memperbarui jumlah_input prodi {prodi_id}: {err}", file=sys.stderr)

        for fakultas_id in affected_fakultas:
            try:
                cursor.execute(
                    """
                    UPDATE fakultas
                    SET jumlah_input = (
                        SELECT COALESCE(SUM(COALESCE(jumlah_input, 0)), 0)
                        FROM prodi
                        WHERE fakultasId = %s
                    )
                    WHERE id = %s
                """,
                    (fakultas_id, fakultas_id),
                )
            except Exception as err:
                print(f"[WARNING] Error memperbarui jumlah_input fakultas {fakultas_id}: {err}", file=sys.stderr)

        update_total_alumni_setting(cursor)

        cursor.execute("SELECT COUNT(*) FROM responden")
        total_responden_global = cursor.fetchone()[0] or 0
        cursor.execute(
            """
            INSERT INTO dashboard_settings (setting_key, setting_value)
            VALUES ('total_responden', %s)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()
        """,
            (str(total_responden_global),),
        )

        connection.commit()
        cursor.close()
        connection.close()

        print(f"[INFO] Total prodi yang diproses: {updated_count}", file=sys.stderr)
        print(f"[INFO] Total responden: {total_responden_global}", file=sys.stderr)
        print(f"[INFO] Alumni baru ditambahkan: {added_alumni}", file=sys.stderr)
        print(f"[INFO] Responden baru ditambahkan: {added_responden}", file=sys.stderr)

        return {
            "success": True,
            "updated": updated_count,
            "total_responden": total_responden_global,
            "added_alumni": added_alumni,
            "added_responden": added_responden
        }

    except Exception as err:
        error_msg = str(err)
        print(f"[ERROR] {error_msg}", file=sys.stderr)
        return {"success": False, "error": error_msg}


# ---------------------------------------------------------------------------
# Main Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            json.dumps(
                {
                    "success": False,
                    "error": "File CSV tidak ditemukan. Usage: python update_total_responden_from_csv.py <path_to_csv>",
                }
            )
        )
        sys.exit(1)

    csv_path = sys.argv[1]
    result = update_total_responden_from_csv(csv_path)
    print(json.dumps(result))
    sys.exit(0 if result.get("success") else 1)

