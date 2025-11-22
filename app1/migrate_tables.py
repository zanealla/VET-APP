import sqlite3

conn = sqlite3.connect("invoice_app.db")
cur = conn.cursor()

rename_map = {
    "company": "companies",
    "client": "clients",
    "invoice": "invoices",
    "invoice_item": "invoice_items"
}

for old, new in rename_map.items():
    # Delete the new empty tables first so rename will succeed
    cur.execute(f"DROP TABLE IF EXISTS {new}")
    cur.execute(f"ALTER TABLE {old} RENAME TO {new}")
    print(f"✅ Renamed {old} → {new}")

conn.commit()
conn.close()
print("🎉 Migration complete! Restart your Flask server now.")
