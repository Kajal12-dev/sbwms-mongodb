# SBWMS - Smart Bill & Warranty Management (Express + MongoDB)

## Run it
1. Have a MongoDB to connect to - either:
   - **Local:** install MongoDB Community Server (https://www.mongodb.com/try/download/community) and make sure it is running, or
   - **Cloud:** create a free MongoDB Atlas cluster, add your IP under *Network Access*, and copy the connection string.
2. Edit `.env` if needed (defaults work for a local MongoDB):
   ```
   MONGODB_URI=mongodb://127.0.0.1:27017
   MONGODB_DB=sbwms
   PORT=3000
   ```
3. Install and start:
   ```
   npm install
   npm start
   ```
4. Open http://localhost:3000

You should see `Connected to MongoDB database "sbwms"` in the terminal.

## Where the data lives
Database `sbwms`, collection `bills`. Each bill is one document with its items embedded:
```
{ _id, store_name, invoice_number, purchase_date, category, total_amount,
  currency, receipt, created_at,
  items: [ { id, line_no, item_name, price, warranty_months, warranty_expiry_date } ] }
```
Check it in MongoDB Compass, or: `mongosh` -> `use sbwms` -> `db.bills.find().pretty()`

## API
| Method | Path | What it does |
|---|---|---|
| GET | /api/bills | list all bills (newest first) |
| POST | /api/bills | save a bill + items (upsert by id) |
| DELETE | /api/bills/:id | delete a bill and its items |
| GET | /api/health | connection check |

## Notes
- Sample bills still show on the dashboard. To show only MongoDB data, set `SHOW_SAMPLE_DATA = false` in `public/index.html`.
- Never commit `.env` (it is in `.gitignore`); use `.env.example` as the template.
