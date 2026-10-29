const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB || 'sbwms';

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
let db;

// Connect once at startup and create indexes (safe to run every time).
async function connect() {
  await client.connect();
  db = client.db(dbName);
  await db.command({ ping: 1 });

  const bills = db.collection('bills');
  await bills.createIndex({ purchase_date: -1 });
  await bills.createIndex({ store_name: 1 });
  await bills.createIndex({ 'items.warranty_expiry_date': 1 });
  return db;
}

function bills() {
  if (!db) throw new Error('Database not connected yet');
  return db.collection('bills');
}

async function close() {
  await client.close();
}

module.exports = { connect, bills, close, dbName };
