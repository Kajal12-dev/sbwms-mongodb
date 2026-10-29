require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { connect, bills, close, dbName } = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
// Serve ONLY the public/ folder (so .env and source files are never exposed)
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- validation + mapping ----------
   A bill is stored as ONE document with its items embedded:
   { _id: <bill id>, store_name, invoice_number, purchase_date, category,
     total_amount, currency, receipt, created_at, items: [ ... ] }
   The API sends/receives the same { bill, items } shape the frontend uses. */

const isStr = (v, max = 200) => typeof v === 'string' && v.trim() !== '' && v.length <= max;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function toDocument(body) {
  const b = body && body.bill;
  const items = body && body.items;
  if (!b || typeof b !== 'object') return { error: 'bill is required' };
  if (!isStr(b.id, 100)) return { error: 'bill.id is required' };
  if (!isStr(b.store_name)) return { error: 'bill.store_name is required' };
  if (!isStr(b.invoice_number)) return { error: 'bill.invoice_number is required' };
  if (!isDate(b.purchase_date)) return { error: 'bill.purchase_date must be YYYY-MM-DD' };
  if (!isStr(b.category, 100)) return { error: 'bill.category is required' };
  if (!isNum(b.total_amount)) return { error: 'bill.total_amount must be a number >= 0' };
  if (!Array.isArray(items) || items.length === 0 || items.length > 200) {
    return { error: 'items must be a non-empty array' };
  }

  const cleanItems = [];
  for (const [i, it] of items.entries()) {
    if (!it || !isStr(it.id, 100)) return { error: `items[${i}].id is required` };
    if (!isStr(it.item_name)) return { error: `items[${i}].item_name is required` };
    if (!isNum(it.price)) return { error: `items[${i}].price must be a number >= 0` };
    if (!Number.isInteger(it.warranty_months) || it.warranty_months < 0) {
      return { error: `items[${i}].warranty_months must be a whole number >= 0` };
    }
    if (it.warranty_expiry_date != null && !isDate(it.warranty_expiry_date)) {
      return { error: `items[${i}].warranty_expiry_date must be YYYY-MM-DD or null` };
    }
    cleanItems.push({
      id: it.id,
      bill_id: b.id,
      line_no: Number.isInteger(it.line_no) ? it.line_no : i + 1,
      item_name: it.item_name.trim(),
      price: it.price,
      warranty_months: it.warranty_months,
      warranty_expiry_date: it.warranty_expiry_date || null
    });
  }

  const r = b.receipt;
  const receipt = r && typeof r === 'object'
    ? { file_name: String(r.file_name || ''), mime_type: String(r.mime_type || ''), size_bytes: Number(r.size_bytes) || 0 }
    : null;
  const created = new Date(b.created_at);

  return {
    doc: {
      _id: b.id,
      store_name: b.store_name.trim(),
      invoice_number: b.invoice_number.trim(),
      purchase_date: b.purchase_date,
      category: b.category,
      total_amount: b.total_amount,
      currency: typeof b.currency === 'string' ? b.currency : 'INR',
      receipt,
      created_at: isNaN(created) ? new Date() : created,
      items: cleanItems
    }
  };
}

function toPayload(doc) {
  const { _id, items, created_at, ...rest } = doc;
  return {
    bill: { id: _id, ...rest, created_at: new Date(created_at).toISOString() },
    items: items || []
  };
}

/* ---------- routes ---------- */

app.get('/api/health', (req, res) => res.json({ ok: true, database: dbName }));

// List all bills (newest first)
app.get('/api/bills', async (req, res) => {
  try {
    const docs = await bills().find({}).sort({ purchase_date: -1, created_at: -1 }).toArray();
    res.json(docs.map(toPayload));
  } catch (err) {
    console.error('GET /api/bills failed:', err);
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
});

// Save a bill with its items (upsert by id, so retrying / undo never duplicates)
app.post('/api/bills', async (req, res) => {
  const { doc, error } = toDocument(req.body);
  if (error) return res.status(400).json({ error });
  try {
    await bills().replaceOne({ _id: doc._id }, doc, { upsert: true });
    res.status(201).json({ message: 'Bill saved to MongoDB', billId: doc._id });
  } catch (err) {
    console.error('POST /api/bills failed:', err);
    res.status(500).json({ error: 'Failed to save bill' });
  }
});

// Delete a bill (its items are embedded, so they go with it)
app.delete('/api/bills/:id', async (req, res) => {
  try {
    const result = await bills().deleteOne({ _id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Bill not found' });
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /api/bills failed:', err);
    res.status(500).json({ error: 'Failed to delete bill' });
  }
});

/* ---------- start ---------- */

const PORT = process.env.PORT || 3000;

connect()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Connected to MongoDB database "${dbName}"`);
      console.log(`SBWMS running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    console.error('Check that MongoDB is running and MONGODB_URI in .env is correct.');
    process.exit(1);
  });

process.on('SIGINT', async () => { await close(); process.exit(0); });
