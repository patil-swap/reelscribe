import sqlite3
import os
import time
import hashlib
import secrets
from contextlib import closing
from typing import Optional, Dict, Any

DB_PATH = os.path.join(os.path.dirname(__file__), "reelscribe.db")

def get_db_connection() -> sqlite3.Connection:
    """
    Returns a new SQLite connection with:
    - Row factory for dict-like access
    - 5-second busy timeout to avoid immediate 'database is locked'
    """
    conn = sqlite3.connect(DB_PATH, timeout=5)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with closing(get_db_connection()) as conn:
        # WAL improves read/write concurrency
        conn.execute("PRAGMA journal_mode=WAL")

        # Create users table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)

        # Create transcription logs table to count usage in a rolling 24-hour window
        conn.execute("""
            CREATE TABLE IF NOT EXISTS transcription_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                identifier TEXT NOT NULL, -- email (for authenticated) or ip_fingerprint_hash (for anonymous)
                timestamp INTEGER NOT NULL
            )
        """)

        # Index for efficient rolling 24h quota queries
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_transcription_logs_identifier_timestamp
            ON transcription_logs(identifier, timestamp)
        """)

        conn.commit()

# Initialize database
init_db()

def create_user(email: str, password_hash: str) -> bool:
    with closing(get_db_connection()) as conn:
        try:
            conn.execute(
                "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
                (email, password_hash, int(time.time()))
            )
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False

def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
        row = cursor.fetchone()
        return dict(row) if row else None

def log_transcription(identifier: str):
    with closing(get_db_connection()) as conn:
        conn.execute(
            "INSERT INTO transcription_logs (identifier, timestamp) VALUES (?, ?)",
            (identifier, int(time.time()))
        )
        conn.commit()

def get_transcription_count(identifier: str) -> int:
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        # Count transcriptions in the last 24 hours
        one_day_ago = int(time.time()) - 86400
        cursor.execute(
            "SELECT COUNT(*) FROM transcription_logs WHERE identifier = ? AND timestamp > ?",
            (identifier, one_day_ago)
        )
        row = cursor.fetchone()
        return row[0] if row else 0

# Password hashing helpers
def hash_password(password: str) -> str:
    # Use PBKDF2 with HMAC-SHA256 (standard built-in and secure)
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return f"{salt}:{key.hex()}"

def verify_password(password: str, hashed_password: str) -> bool:
    try:
        salt, key_hex = hashed_password.split(":")
        expected_key = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            100000
        )
        return secrets.compare_digest(expected_key.hex(), key_hex)
    except Exception:
        return False