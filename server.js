const express = require('express');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Serve static files from both public directories
app.use('/app1', express.static(path.join(__dirname, 'app1', 'public')));
app.use('/app2', express.static(path.join(__dirname, 'app2', 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));

// Database configuration
const DB_PATH = path.join(__dirname, 'app1', 'invoice_app.db');

// Shared files paths
const sharedDir = path.join(__dirname, 'shared');
const medicinesFile = path.join(sharedDir, 'medicines.json');
const categoriesFile = path.join(sharedDir, 'categories.json');

console.log(`📁 Database path: ${DB_PATH}`);
console.log(`📁 Shared medicines path: ${medicinesFile}`);

// Create shared directory if it doesn't exist
if (!fs.existsSync(sharedDir)) {
  fs.mkdirSync(sharedDir, { recursive: true });
}

// Helper function to get database connection
function getDb() {
  return new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
    }
  });
}

// Helper function to convert row to object
function dictFromRow(row) {
  return row ? { ...row } : null;
}

// ======================================================
// 🏠 Serve Frontend Pages
// ======================================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Application Portal</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; text-align: center; }
            .container { max-width: 600px; margin: 0 auto; }
            .app-link { 
                display: block; 
                padding: 20px; 
                margin: 20px 0; 
                background: #007bff; 
                color: white; 
                text-decoration: none; 
                border-radius: 5px;
                font-size: 18px;
            }
            .app-link:hover { background: #0056b3; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Welcome to Combined Applications</h1>
            <p>Choose an application to use:</p>
            <a href="/app1" class="app-link">📊 Invoice Management App</a>
            <a href="/app2" class="app-link">💊 Veterinary Medicines App</a>
        </div>
    </body>
    </html>
  `);
});

app.get('/app1', (req, res) => {
  res.sendFile(path.join(__dirname, 'app1', 'public', 'index.html'));
});

app.get('/app2', (req, res) => {
  res.sendFile(path.join(__dirname, 'app2', 'public', 'index.html'));
});

// ======================================================
// 📊 Statistics Endpoints (From app1)
// ======================================================
app.get('/api/stats/overview', (req, res) => {
  const db = getDb();
  
  db.serialize(() => {
    try {
      // Total invoices
      db.get("SELECT COUNT(*) as total FROM invoices", (err, row) => {
        if (err) {
          res.status(500).json({ error: `Error fetching stats: ${err.message}` });
          return;
        }
        const totalInvoices = row.total;

        // Total clients
        db.get("SELECT COUNT(*) as total FROM clients", (err, row) => {
          const totalClients = row.total;

          // Total companies
          db.get("SELECT COUNT(*) as total FROM companies", (err, row) => {
            const totalCompanies = row.total;

            // Total revenue
            db.get("SELECT COALESCE(SUM(total), 0) as total FROM invoices", (err, row) => {
              const totalRevenue = row.total;

              // Paid vs Unpaid invoices
              db.get("SELECT COUNT(*) as count FROM invoices WHERE paid = 1", (err, row) => {
                const paidInvoices = row.count;

                db.get("SELECT COUNT(*) as count FROM invoices WHERE paid = 0", (err, row) => {
                  const unpaidInvoices = row.count;

                  // Recent invoices (last 30 days)
                  const thirtyDaysAgo = new Date();
                  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                  const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

                  db.get("SELECT COUNT(*) as count FROM invoices WHERE date >= ?", [dateStr], (err, row) => {
                    const recentInvoices = row.count;

                    res.json({
                      total_invoices: totalInvoices,
                      total_clients: totalClients,
                      total_companies: totalCompanies,
                      total_revenue: parseFloat(totalRevenue),
                      paid_invoices: paidInvoices,
                      unpaid_invoices: unpaidInvoices,
                      recent_invoices: recentInvoices
                    });

                    db.close();
                  });
                });
              });
            });
          });
        });
      });
    } catch (error) {
      res.status(500).json({ error: `Error fetching stats: ${error.message}` });
      db.close();
    }
  });
});

app.get('/api/stats/payment-stats', (req, res) => {
  const db = getDb();
  
  db.get(`
    SELECT 
      SUM(CASE WHEN paid = 1 THEN 1 ELSE 0 END) as paid_count,
      SUM(CASE WHEN paid = 0 THEN 1 ELSE 0 END) as unpaid_count,
      COUNT(*) as total_count,
      COALESCE(SUM(CASE WHEN paid = 1 THEN total ELSE 0 END), 0) as paid_amount,
      COALESCE(SUM(CASE WHEN paid = 0 THEN total ELSE 0 END), 0) as unpaid_amount
    FROM invoices
  `, (err, stats) => {
    if (err) {
      res.status(500).json({ error: `Error fetching payment stats: ${err.message}` });
      db.close();
      return;
    }

    const totalCount = stats.total_count || 0;
    const paidCount = stats.paid_count || 0;
    const paidPercentage = totalCount > 0 ? (paidCount / totalCount * 100) : 0;

    res.json({
      paid_count: paidCount,
      unpaid_count: stats.unpaid_count || 0,
      total_count: totalCount,
      paid_amount: parseFloat(stats.paid_amount || 0),
      unpaid_amount: parseFloat(stats.unpaid_amount || 0),
      paid_percentage: Math.round(paidPercentage * 100) / 100
    });

    db.close();
  });
});

app.get('/api/stats/monthly-revenue', (req, res) => {
  const db = getDb();
  
  db.all(`
    SELECT strftime('%Y-%m', date) as month, 
           SUM(total) as revenue,
           COUNT(*) as invoice_count
    FROM invoices 
    WHERE date >= date('now', '-6 months')
    GROUP BY strftime('%Y-%m', date)
    ORDER BY month
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: `Error fetching monthly revenue: ${err.message}` });
      db.close();
      return;
    }

    const monthlyData = rows.map(row => ({
      month: row.month,
      revenue: parseFloat(row.revenue || 0),
      invoice_count: row.invoice_count
    }));

    res.json(monthlyData);
    db.close();
  });
});

app.get('/api/stats/client-stats', (req, res) => {
  const db = getDb();
  
  db.all(`
    SELECT c.name, COUNT(i.id) as invoice_count, 
           COALESCE(SUM(i.total), 0) as total_spent
    FROM clients c
    LEFT JOIN invoices i ON c.id = i.client_id
    GROUP BY c.id, c.name
    ORDER BY total_spent DESC
    LIMIT 10
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: `Error fetching client stats: ${err.message}` });
      db.close();
      return;
    }

    const topClients = rows.map(row => ({
      name: row.name,
      invoice_count: row.invoice_count,
      total_spent: parseFloat(row.total_spent || 0)
    }));

    res.json(topClients);
    db.close();
  });
});

// ======================================================
// 👥 Clients Endpoints (From app1)
// ======================================================
app.get('/api/clients', (req, res) => {
  const db = getDb();
  
  db.all("SELECT * FROM clients", (err, rows) => {
    if (err) {
      res.status(500).json({ error: `Database error: ${err.message}` });
      db.close();
      return;
    }
    
    res.json(rows.map(row => dictFromRow(row)));
    db.close();
  });
});

app.get('/api/clients/:id', (req, res) => {
  const db = getDb();
  const clientId = req.params.id;
  
  db.get("SELECT * FROM clients WHERE id = ?", [clientId], (err, row) => {
    if (err) {
      res.status(500).json({ error: `Database error: ${err.message}` });
      db.close();
      return;
    }
    
    if (!row) {
      res.status(404).json({ error: "Client not found" });
      db.close();
      return;
    }
    
    res.json(dictFromRow(row));
    db.close();
  });
});

app.post('/api/clients', (req, res) => {
  const { name, address, phone, email } = req.body;
  const db = getDb();
  
  db.run(
    "INSERT INTO clients (name, address, phone, email) VALUES (?, ?, ?, ?)",
    [name, address, phone, email],
    function(err) {
      if (err) {
        res.status(500).json({ error: `Database error: ${err.message}` });
        db.close();
        return;
      }
      
      res.status(201).json({ message: "Client added successfully", id: this.lastID });
      db.close();
    }
  );
});

app.delete('/api/clients/:id', (req, res) => {
  const db = getDb();
  const clientId = req.params.id;
  
  db.run("DELETE FROM clients WHERE id = ?", [clientId], function(err) {
    if (err) {
      res.status(500).json({ error: `Database error: ${err.message}` });
      db.close();
      return;
    }
    
    if (this.changes === 0) {
      res.status(404).json({ error: "Client not found" });
    } else {
      res.json({ message: "Client deleted successfully" });
    }
    db.close();
  });
});

// ======================================================
// 🏢 Companies Endpoints (From app1)
// ======================================================
app.get('/api/companies', (req, res) => {
  const db = getDb();
  
  db.all("SELECT * FROM companies", (err, rows) => {
    if (err) {
      res.status(500).json({ error: `Database error: ${err.message}` });
      db.close();
      return;
    }
    
    res.json(rows.map(row => dictFromRow(row)));
    db.close();
  });
});

app.get('/api/companies/:id', (req, res) => {
  const db = getDb();
  const companyId = req.params.id;
  
  db.get("SELECT * FROM companies WHERE id = ?", [companyId], (err, row) => {
    if (err) {
      res.status(500).json({ error: `Database error: ${err.message}` });
      db.close();
      return;
    }
    
    if (!row) {
      res.status(404).json({ error: "Company not found" });
      db.close();
      return;
    }
    
    res.json(dictFromRow(row));
    db.close();
  });
});

app.post('/api/companies', (req, res) => {
  const { name, address, phone, email } = req.body;
  const db = getDb();
  
  db.run(
    "INSERT INTO companies (name, address, phone, email) VALUES (?, ?, ?, ?)",
    [name, address, phone, email],
    function(err) {
      if (err) {
        res.status(500).json({ error: `Database error: ${err.message}` });
        db.close();
        return;
      }
      
      res.status(201).json({ message: "Company added successfully", id: this.lastID });
      db.close();
    }
  );
});

app.delete('/api/companies/:id', (req, res) => {
  const db = getDb();
  const companyId = req.params.id;
  
  db.run("DELETE FROM companies WHERE id = ?", [companyId], function(err) {
    if (err) {
      res.status(500).json({ error: `Database error: ${err.message}` });
      db.close();
      return;
    }
    
    if (this.changes === 0) {
      res.status(404).json({ error: "Company not found" });
    } else {
      res.json({ message: "Company deleted successfully" });
    }
    db.close();
  });
});

// ======================================================
// 🧾 Invoices Endpoints (From app1)
// ======================================================
app.get('/api/invoices', (req, res) => {
  const db = getDb();
  
  // Ensure paid column exists
  db.run("ALTER TABLE invoices ADD COLUMN paid INTEGER DEFAULT 0", (err) => {
    // Ignore error if column already exists
    
    db.all(`
      SELECT invoices.*, 
             clients.name AS client_name, 
             companies.name AS company_name
      FROM invoices
      LEFT JOIN clients ON invoices.client_id = clients.id
      LEFT JOIN companies ON invoices.company_id = companies.id
      ORDER BY invoices.id DESC
    `, (err, rows) => {
      if (err) {
        res.status(500).json({ error: `Database error: ${err.message}` });
        db.close();
        return;
      }
      
      res.json(rows.map(row => dictFromRow(row)));
      db.close();
    });
  });
});

// GET single invoice by ID - THIS IS THE MISSING ENDPOINT!
app.get('/api/invoices/:id', (req, res) => {
  const db = getDb();
  const invoiceId = req.params.id;
  
  console.log(`Fetching invoice ${invoiceId}`);
  
  // Ensure paid column exists
  db.run("ALTER TABLE invoices ADD COLUMN paid INTEGER DEFAULT 0", (err) => {
    // Get invoice with client and company names
    db.get(`
      SELECT invoices.*, 
             clients.name AS client_name, 
             companies.name AS company_name
      FROM invoices
      LEFT JOIN clients ON invoices.client_id = clients.id
      LEFT JOIN companies ON invoices.company_id = companies.id
      WHERE invoices.id = ?
    `, [invoiceId], (err, invoiceRow) => {
      if (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: `Database error: ${err.message}` });
        db.close();
        return;
      }
      
      if (!invoiceRow) {
        console.log(`Invoice ${invoiceId} not found`);
        res.status(404).json({ error: "Invoice not found" });
        db.close();
        return;
      }
      
      // Get invoice items
      db.all(`
        SELECT description, quantity, price, tax, total
        FROM invoice_items 
        WHERE invoice_id = ?
      `, [invoiceId], (err, itemsRows) => {
        if (err) {
          console.error('Error fetching items:', err);
          res.status(500).json({ error: `Error fetching items: ${err.message}` });
          db.close();
          return;
        }
        
        const invoice = dictFromRow(invoiceRow);
        invoice.items = itemsRows.map(item => ({
          desc: item.description,
          qty: item.quantity,
          price: item.price,
          tax: item.tax,
          line: item.total
        }));
        
        console.log(`Successfully fetched invoice ${invoiceId}`);
        res.json(invoice);
        db.close();
      });
    });
  });
});

app.post('/api/invoices', (req, res) => {
  const data = req.body;
  const db = getDb();
  
  db.run("ALTER TABLE invoices ADD COLUMN paid INTEGER DEFAULT 0", (err) => {
    // Ignore error if column already exists
    
    db.run(
      `INSERT INTO invoices (company_id, client_id, number, date, subtotal, tax_total, total, paid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.company_id, data.client_id, data.number, data.date, data.subtotal, 
       data.tax_total, data.total, data.paid || 0],
      function(err) {
        if (err) {
          res.status(500).json({ error: `Database error: ${err.message}` });
          db.close();
          return;
        }
        
        const invoiceId = this.lastID;
        
        // Insert items
        const items = data.items || [];
        let itemsProcessed = 0;
        
        if (items.length === 0) {
          res.status(201).json({ message: "Invoice saved", invoice: { id: invoiceId } });
          db.close();
          return;
        }
        
        items.forEach(item => {
          db.run(
            `INSERT INTO invoice_items (invoice_id, description, quantity, price, tax, total)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [invoiceId, item.desc, item.qty, item.price, item.tax, item.line],
            (err) => {
              if (err) {
                console.error('Error inserting item:', err);
              }
              
              itemsProcessed++;
              if (itemsProcessed === items.length) {
                res.status(201).json({ message: "Invoice saved", invoice: { id: invoiceId } });
                db.close();
              }
            }
          );
        });
      }
    );
  });
});

app.patch('/api/invoices/:id', (req, res) => {
  const db = getDb();
  const invoiceId = req.params.id;
  const data = req.body;
  
  db.run("ALTER TABLE invoices ADD COLUMN paid INTEGER DEFAULT 0", (err) => {
    // Build update query dynamically
    const updateFields = [];
    const values = [];
    
    const allowedFields = {
      'company_id': data.company_id,
      'client_id': data.client_id, 
      'number': data.number,
      'date': data.date,
      'subtotal': data.subtotal,
      'tax_total': data.tax_total,
      'total': data.total,
      'paid': data.paid
    };
    
    for (const [field, value] of Object.entries(allowedFields)) {
      if (value !== undefined) {
        updateFields.push(`${field} = ?`);
        values.push(value);
      }
    }
    
    if (updateFields.length === 0 && !data.items) {
      res.status(400).json({ error: "No valid fields to update" });
      db.close();
      return;
    }
    
    // Update invoice fields
    if (updateFields.length > 0) {
      values.push(invoiceId);
      const updateQuery = `UPDATE invoices SET ${updateFields.join(', ')} WHERE id = ?`;
      
      db.run(updateQuery, values, function(err) {
        if (err) {
          res.status(500).json({ error: `Error updating invoice: ${err.message}` });
          db.close();
          return;
        }
        
        // Update items if provided
        if (data.items) {
          db.run("DELETE FROM invoice_items WHERE invoice_id = ?", [invoiceId], (err) => {
            if (err) {
              res.status(500).json({ error: `Error deleting old items: ${err.message}` });
              db.close();
              return;
            }
            
            let itemsProcessed = 0;
            if (data.items.length === 0) {
              res.json({ message: "Invoice updated successfully" });
              db.close();
              return;
            }
            
            data.items.forEach(item => {
              db.run(
                `INSERT INTO invoice_items (invoice_id, description, quantity, price, tax, total)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [invoiceId, item.desc, item.qty, item.price, item.tax, item.line],
                (err) => {
                  if (err) {
                    console.error('Error inserting item:', err);
                  }
                  
                  itemsProcessed++;
                  if (itemsProcessed === data.items.length) {
                    res.json({ message: "Invoice updated successfully" });
                    db.close();
                  }
                }
              );
            });
          });
        } else {
          res.json({ message: "Invoice updated successfully" });
          db.close();
        }
      });
    } else {
      // Only updating items
      db.run("DELETE FROM invoice_items WHERE invoice_id = ?", [invoiceId], (err) => {
        if (err) {
          res.status(500).json({ error: `Error deleting old items: ${err.message}` });
          db.close();
          return;
        }
        
        let itemsProcessed = 0;
        if (data.items.length === 0) {
          res.json({ message: "Invoice updated successfully" });
          db.close();
          return;
        }
        
        data.items.forEach(item => {
          db.run(
            `INSERT INTO invoice_items (invoice_id, description, quantity, price, tax, total)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [invoiceId, item.desc, item.qty, item.price, item.tax, item.line],
            (err) => {
              if (err) {
                console.error('Error inserting item:', err);
              }
              
              itemsProcessed++;
              if (itemsProcessed === data.items.length) {
                res.json({ message: "Invoice updated successfully" });
                db.close();
              }
            }
          );
        });
      });
    }
  });
});

app.delete('/api/invoices/:id', (req, res) => {
  const db = getDb();
  const invoiceId = req.params.id;
  
  db.serialize(() => {
    // First delete invoice items
    db.run('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId], function(err) {
      if (err) {
        res.status(500).json({ error: `Error deleting invoice items: ${err.message}` });
        db.close();
        return;
      }
      
      // Then delete the invoice
      db.run('DELETE FROM invoices WHERE id = ?', [invoiceId], function(err) {
        if (err) {
          res.status(500).json({ error: `Error deleting invoice: ${err.message}` });
          db.close();
          return;
        }
        
        if (this.changes === 0) {
          res.status(404).json({ error: "Invoice not found" });
        } else {
          res.json({ message: "Invoice deleted successfully" });
        }
        db.close();
      });
    });
  });
});

// ======================================================
// 💊 Medicines Endpoints (From app2)
// ======================================================
// Helper functions for medicines
const readMedicines = () => {
  try {
    if (fs.existsSync(medicinesFile)) {
      const data = fs.readFileSync(medicinesFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading shared medicines file:', error);
  }
  return [];
};

const writeMedicines = (medicines) => {
  try {
    fs.writeFileSync(medicinesFile, JSON.stringify(medicines, null, 2));
  } catch (error) {
    console.error('Error writing shared medicines file:', error);
  }
};

const readCategories = () => {
  try {
    if (fs.existsSync(categoriesFile)) {
      const data = fs.readFileSync(categoriesFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading shared categories file:', error);
  }
  return ['Antiparasitaire', 'Antibiotique', 'Vitamine', 'Anti-inflammatoire', 'Vaccin', 'Désinfectant', 'Consumables'];
};

const writeCategories = (categories) => {
  try {
    fs.writeFileSync(categoriesFile, JSON.stringify(categories, null, 2));
  } catch (error) {
    console.error('Error writing shared categories file:', error);
  }
};

// Initialize shared files if they don't exist
if (!fs.existsSync(medicinesFile)) {
  writeMedicines([]);
}

if (!fs.existsSync(categoriesFile)) {
  writeCategories(readCategories());
}

// Categories routes
app.get("/api/categories", (req, res) => {
  const categories = readCategories();
  res.json(categories);
});

app.post("/api/categories", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });
  
  const categories = readCategories();
  if (!categories.includes(name)) {
    categories.push(name);
    writeCategories(categories);
  }
  res.json(categories);
});

// Medicines routes
app.get('/api/medicines', (req, res) => {
  const medicines = readMedicines();
  res.json(medicines);
});

app.post('/api/medicines', (req, res) => {
  try {
    const medicines = readMedicines();
    const { name, category, price, dosage, manufacturer, originalPrice, image, stock } = req.body;

    const newMedicine = {
      id: Date.now(),
      name,
      category,
      price: parseFloat(price),
      stock: parseInt(stock, 10) || 0,
      dosage,
      manufacturer,
      originalPrice: parseFloat(originalPrice || price),
    };

    if (image && image.startsWith('data:image')) {
      newMedicine.image = image;
    }

    medicines.push(newMedicine);
    writeMedicines(medicines);
    res.status(201).json(newMedicine);
  } catch (error) {
    console.error('Error creating medicine:', error);
    res.status(500).json({ error: 'Failed to create medicine' });
  }
});

app.put('/api/medicines/:id', (req, res) => {
  try {
    const medicines = readMedicines();
    const medicineId = parseInt(req.params.id);
    const { name, category, price, dosage, manufacturer, originalPrice, image, stock } = req.body;

    const medicineIndex = medicines.findIndex(m => m.id === medicineId);
    if (medicineIndex === -1) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    const updatedMedicine = {
      ...medicines[medicineIndex],
      name,
      category,
      price: parseFloat(price),
      stock: parseInt(stock, 10) || 0,
      dosage,
      manufacturer,
      originalPrice: parseFloat(originalPrice || price)
    };

    if (image !== undefined) {
      if (image && image.startsWith('data:image')) {
        updatedMedicine.image = image;
      } else if (image === null || image === '') {
        delete updatedMedicine.image;
      }
    }

    medicines[medicineIndex] = updatedMedicine;
    writeMedicines(medicines);
    res.json(updatedMedicine);
  } catch (error) {
    console.error('Error updating medicine:', error);
    res.status(500).json({ error: 'Failed to update medicine' });
  }
});

app.delete('/api/medicines/:id', (req, res) => {
  try {
    const medicines = readMedicines();
    const medicineId = parseInt(req.params.id);
    const medicineIndex = medicines.findIndex(m => m.id === medicineId);

    if (medicineIndex === -1) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    medicines.splice(medicineIndex, 1);
    writeMedicines(medicines);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting medicine:', error);
    res.status(500).json({ error: 'Failed to delete medicine' });
  }
});

app.get('/api/medicines/search', (req, res) => {
  try {
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    const medicines = readMedicines();
    
    if (query) {
      const filteredMedicines = medicines.filter(medicine =>
        medicine.name.toLowerCase().includes(query) ||
        (medicine.category && medicine.category.toLowerCase().includes(query)) ||
        (medicine.manufacturer && medicine.manufacturer.toLowerCase().includes(query))
      );
      res.json(filteredMedicines);
    } else {
      res.json(medicines);
    }
  } catch (error) {
    console.error('Error searching medicines:', error);
    res.status(500).json({ error: 'Failed to search medicines' });
  }
});

// ======================================================
// 🚀 Start Server
// ======================================================
app.listen(PORT, () => {
  console.log(`🚀 Combined server running on http://localhost:${PORT}`);
  console.log(`📊 Invoice App: http://localhost:${PORT}/app1`);
  console.log(`💊 Medicines App: http://localhost:${PORT}/app2`);
  console.log(`📁 Using database: ${DB_PATH}`);
});