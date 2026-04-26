# MAVTAT Motors Backend - Setup & Run

## Quick Start (3 steps)

### 1️⃣ Install Dependencies

```bash
cd backend
npm install
```

### 2️⃣ Start the Server

```bash
npm start
```

You should see:
```
✅ Database connected
✅ Vehicles table ready
✅ Maintenance table ready
✅ Rental table ready
✅ Fuel logs table ready

🚀 MAVTAT Motors API Server
📍 Running on http://localhost:3000
```

### 3️⃣ Open in Browser

Go to: **http://localhost:3000**

That's it! 🎉

---

## 📝 What's Running

- **Backend API**: `http://localhost:3000/api`
- **Frontend**: Served from `/public` folder
- **Database**: SQLite (local file: `database.sqlite`)
- **Port**: 3000 (change in `.env` if needed)

---

## 📊 API Endpoints

### Vehicles
```
GET    /api/vehicles                 - List all vehicles
GET    /api/vehicles/:id             - Get one vehicle
POST   /api/vehicles                 - Create vehicle
PATCH  /api/vehicles/:id             - Update vehicle
DELETE /api/vehicles/:id             - Delete vehicle
```

### Maintenance
```
GET    /api/maintenance              - All maintenance records
GET    /api/maintenance/vehicle/:id  - For specific vehicle
POST   /api/maintenance              - Log maintenance
```

### Reports
```
GET    /api/reports/summary          - Fleet summary
GET    /api/reports/revenue          - Revenue per vehicle
GET    /api/reports/fuel             - Fuel consumption
```

---

## 🧪 Test API with curl

```bash
# List vehicles
curl http://localhost:3000/api/vehicles

# Create vehicle
curl -X POST http://localhost:3000/api/vehicles \
  -H "Content-Type: application/json" \
  -d '{
    "make": "Toyota",
    "model": "Corolla",
    "license_plate": "ABC 123",
    "type": "taxi",
    "mileage": 45000
  }'

# Update mileage
curl -X PATCH http://localhost:3000/api/vehicles/1 \
  -H "Content-Type: application/json" \
  -d '{"mileage": 46000}'

# Get revenue report
curl http://localhost:3000/api/reports/revenue
```

---

## 🐛 Troubleshooting

**"Cannot find module sqlite3"**
```bash
npm install sqlite3 --save
```

**Port 3000 already in use?**
Edit `.env` and change `PORT=8080`

**Database errors?**
Delete `database.sqlite` and restart (fresh DB created)

**CORS errors?**
Make sure you're accessing from `http://localhost:3000`, not another port

---

## 📁 File Structure

```
backend/
├── server.js              ← Main backend server
├── package.json           ← Dependencies
├── .env                   ← Configuration
├── database.sqlite        ← Data (created on first run)
└── routes/                ← (optional) For organizing later
```

---

## 🚀 How It Works

1. **Server starts** → Creates SQLite database with tables
2. **Frontend loads** → Loads `/public/index.html`
3. **Frontend requests data** → API returns JSON from database
4. **Frontend displays** → Renders on screen with Tailwind CSS

All data is saved in `database.sqlite` file (survives restarts).

---

## 📝 Next Steps

1. ✅ Backend running
2. ✅ Frontend connected
3. Add vehicles via the UI
4. Watch real-time updates
5. Generate reports
6. Export to CSV/PDF

---

**You're all set! Now vibe code the rest 🎵**
