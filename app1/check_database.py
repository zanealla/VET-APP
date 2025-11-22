import sqlite3
import os

def check_database():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    DB_PATH = os.path.join(base_dir, "invoice_app.db")
    
    print(f"📁 Database path: {DB_PATH}")
    print(f"📁 File exists: {os.path.exists(DB_PATH)}")
    
    if not os.path.exists(DB_PATH):
        print("❌ Database file does not exist!")
        return False
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        
        # Liste toutes les tables
        cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cur.fetchall()
        print("📊 Tables found:")
        for table in tables:
            print(f"  - {table[0]}")
        
        # Vérifie le schéma de chaque table
        for table in tables:
            table_name = table[0]
            print(f"\n🔍 Schema for {table_name}:")
            cur.execute(f"PRAGMA table_info({table_name})")
            columns = cur.fetchall()
            for col in columns:
                print(f"  - {col[1]} ({col[2]})")
        
        # Vérifie les données d'exemple
        print(f"\n📋 Sample data:")
        for table in tables:
            table_name = table[0]
            cur.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cur.fetchone()[0]
            print(f"  - {table_name}: {count} rows")
            
            if count > 0:
                cur.execute(f"SELECT * FROM {table_name} LIMIT 2")
                sample_data = cur.fetchall()
                print(f"    Sample: {sample_data}")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Error checking database: {e}")
        return False

if __name__ == "__main__":
    check_database()