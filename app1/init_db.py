import sqlite3
import os

# Utilisez le chemin absolu pour la base de données
base_dir = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(base_dir, "invoice_app.db")

print(f"📁 Database path: {DB_PATH}")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

try:
    cur.executescript("""
    CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        email TEXT
    );

    CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        email TEXT
    );

    CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        client_id INTEGER,
        number TEXT,
        date TEXT,
        subtotal REAL,
        tax_total REAL,
        total REAL,
        paid INTEGER DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER,
        description TEXT,
        quantity REAL,
        price REAL,
        tax REAL,
        total REAL,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );
    """)

    conn.commit()
    print("✅ Database initialized successfully!")
    
    # Vérifiez que les tables ont été créées
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cur.fetchall()
    print("📊 Tables created:", [table[0] for table in tables])
    
except Exception as e:
    print(f"❌ Error: {e}")
finally:
    conn.close()

