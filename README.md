# Hardware Shop POS

Single-location POS for hardware retail (TV, monitor, laptop, CCTV, accessories).

## Stack

- **Backend:** Express.js + TypeScript + PostgreSQL (`pg`, no ORM)
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind

## Setup

### Database

PostgreSQL required. Default connection (this machine uses port **5433**):

```
postgresql://postgres:password@localhost:5433/hardware_pos
```

Update `backend/.env` if your password/port differ.

```bash
cd backend
npm install
npm run migrate
npm run seed
npm run dev
```

API: http://localhost:9006

### Frontend

```bash
cd frontend
npm install
# create .env.local with NEXT_PUBLIC_API_URL=http://localhost:9006
npm run dev
```

UI: http://localhost:9005

### Demo logins

| Email | Password | Role |
|-------|----------|------|
| admin@shop.local | admin123 | admin |
| manager@shop.local | admin123 | manager |
| cashier@shop.local | admin123 | cashier |

## Features (v1)

- Auth / RBAC / shop settings
- Catalog, stock, serials, barcode/QR labels, low-stock
- Purchase demand → purchase / goods receive, suppliers
- POS retail & wholesale, backdate sale, barcode/QR scan, hold/recall
- Credit/due collection, EMI, returns, exchange, warranty claims
- Expenses, dashboard/reports/CSV, shifts, audit log

## Backup

```bash
pg_dump -U postgres -p 5433 hardware_pos > backup.sql
```
