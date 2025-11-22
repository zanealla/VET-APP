from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

# Utilisez le chemin absolu
base_dir = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(base_dir, 'invoice_app.db')

print(f"📁 Database path: {DB_PATH}")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ======================================================
# 📊 Statistics Endpoints
# ======================================================
@app.route('/api/stats/overview', methods=['GET'])
def get_stats_overview():
    """Get overview statistics"""
    conn = get_db()
    cur = conn.cursor()
    try:
        # Total invoices
        cur.execute("SELECT COUNT(*) as total FROM invoices")
        total_invoices = cur.fetchone()['total']
        
        # Total clients
        cur.execute("SELECT COUNT(*) as total FROM clients")
        total_clients = cur.fetchone()['total']
        
        # Total companies
        cur.execute("SELECT COUNT(*) as total FROM companies")
        total_companies = cur.fetchone()['total']
        
        # Total revenue
        cur.execute("SELECT COALESCE(SUM(total), 0) as total FROM invoices")
        total_revenue = cur.fetchone()['total']
        
        # Paid vs Unpaid invoices
        cur.execute("SELECT COUNT(*) as count FROM invoices WHERE paid = 1")
        paid_invoices = cur.fetchone()['count']
        
        cur.execute("SELECT COUNT(*) as count FROM invoices WHERE paid = 0")
        unpaid_invoices = cur.fetchone()['count']
        
        # Recent invoices (last 30 days)
        thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        cur.execute("SELECT COUNT(*) as count FROM invoices WHERE date >= ?", (thirty_days_ago,))
        recent_invoices = cur.fetchone()['count']
        
        return jsonify({
            "total_invoices": total_invoices,
            "total_clients": total_clients,
            "total_companies": total_companies,
            "total_revenue": float(total_revenue),
            "paid_invoices": paid_invoices,
            "unpaid_invoices": unpaid_invoices,
            "recent_invoices": recent_invoices
        })
    except Exception as e:
        return jsonify({"error": f"Error fetching stats: {str(e)}"}), 500
    finally:
        conn.close()

@app.route('/api/stats/payment-stats', methods=['GET'])
def get_payment_stats():
    """Get payment statistics"""
    conn = get_db()
    cur = conn.cursor()
    try:
        # Payment status distribution
        cur.execute("""
            SELECT 
                SUM(CASE WHEN paid = 1 THEN 1 ELSE 0 END) as paid_count,
                SUM(CASE WHEN paid = 0 THEN 1 ELSE 0 END) as unpaid_count,
                COUNT(*) as total_count,
                COALESCE(SUM(CASE WHEN paid = 1 THEN total ELSE 0 END), 0) as paid_amount,
                COALESCE(SUM(CASE WHEN paid = 0 THEN total ELSE 0 END), 0) as unpaid_amount
            FROM invoices
        """)
        
        stats = cur.fetchone()
        total_count = stats['total_count'] or 0
        paid_count = stats['paid_count'] or 0
        paid_percentage = (paid_count / total_count * 100) if total_count > 0 else 0
        
        return jsonify({
            "paid_count": paid_count,
            "unpaid_count": stats['unpaid_count'] or 0,
            "total_count": total_count,
            "paid_amount": float(stats['paid_amount'] or 0),
            "unpaid_amount": float(stats['unpaid_amount'] or 0),
            "paid_percentage": round(paid_percentage, 2)
        })
    except Exception as e:
        return jsonify({"error": f"Error fetching payment stats: {str(e)}"}), 500
    finally:
        conn.close()

@app.route('/api/stats/monthly-revenue', methods=['GET'])
def get_monthly_revenue():
    """Get monthly revenue data for charts"""
    conn = get_db()
    cur = conn.cursor()
    try:
        # Get revenue for last 6 months
        cur.execute("""
            SELECT strftime('%Y-%m', date) as month, 
                   SUM(total) as revenue,
                   COUNT(*) as invoice_count
            FROM invoices 
            WHERE date >= date('now', '-6 months')
            GROUP BY strftime('%Y-%m', date)
            ORDER BY month
        """)
        
        monthly_data = []
        for row in cur.fetchall():
            monthly_data.append({
                "month": row['month'],
                "revenue": float(row['revenue'] or 0),
                "invoice_count": row['invoice_count']
            })
        
        return jsonify(monthly_data)
    except Exception as e:
        return jsonify({"error": f"Error fetching monthly revenue: {str(e)}"}), 500
    finally:
        conn.close()

@app.route('/api/stats/client-stats', methods=['GET'])
def get_client_stats():
    """Get client statistics"""
    conn = get_db()
    cur = conn.cursor()
    try:
        # Top clients by invoice count
        cur.execute("""
            SELECT c.name, COUNT(i.id) as invoice_count, 
                   COALESCE(SUM(i.total), 0) as total_spent
            FROM clients c
            LEFT JOIN invoices i ON c.id = i.client_id
            GROUP BY c.id, c.name
            ORDER BY total_spent DESC
            LIMIT 10
        """)
        
        top_clients = []
        for row in cur.fetchall():
            top_clients.append({
                "name": row['name'],
                "invoice_count": row['invoice_count'],
                "total_spent": float(row['total_spent'] or 0)
            })
        
        return jsonify(top_clients)
    except Exception as e:
        return jsonify({"error": f"Error fetching client stats: {str(e)}"}), 500
    finally:
        conn.close()

# ======================================================
# 🧾 Existing Invoice Endpoint
# ======================================================
@app.route("/api/invoices/<int:id>", methods=["GET"])
def get_invoice(id):
    conn = get_db()
    cur = conn.cursor()
    try:
        # Vérifier si la colonne 'paid' existe
        try:
            cur.execute("ALTER TABLE invoices ADD COLUMN paid INTEGER DEFAULT 0")
            conn.commit()
            print("🆕 Added 'paid' column to invoices table.")
        except Exception:
            pass  # already exists
        
        inv = cur.execute("SELECT * FROM invoices WHERE id=?", (id,)).fetchone()
        if not inv: 
            return jsonify({"error":"not found"}), 404
        
        items = cur.execute("""
            SELECT description, quantity, price, tax, total 
            FROM invoice_items 
            WHERE invoice_id=?
        """, (id,)).fetchall()
        
        # Map items to match frontend expectations
        mapped_items = []
        for item in items:
            mapped_items.append({
                "desc": item['description'],
                "qty": item['quantity'],
                "price": item['price'],
                "tax": item['tax'],
                "line": item['total']
            })
        
        return jsonify({
            **dict(inv),
            "items": mapped_items
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

# ======================================================
# 🏠 Simple home route for testing
# ======================================================
@app.route('/')
def home():
    return "Flask app is running! Use /api/stats/overview for statistics."

if __name__ == '__main__':
    print("🚀 Starting Flask app on port 5001...")
    print("📊 Available stats endpoints:")
    print("   GET /api/stats/overview")
    print("   GET /api/stats/payment-stats") 
    print("   GET /api/stats/monthly-revenue")
    print("   GET /api/stats/client-stats")
    app.run(debug=True, port=5000)