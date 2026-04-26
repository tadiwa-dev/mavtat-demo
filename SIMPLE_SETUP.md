# MAVTAT Motors - Simple Free Setup for Small Business

> Build a working fleet management app in 2-4 weeks with free tools. No complex architecture, just vibes.

---

## 🎯 The Simple Stack

| Layer | Tool | Cost |
|-------|------|------|
| **Frontend** | Keep your HTML/Tailwind | FREE |
| **Backend** | Node.js + Express | FREE |
| **Database** | SQLite (local) or PostgreSQL (free tier) | FREE |
| **Hosting** | Render.com or Railway.app | FREE tier available |
| **Real-time** | Polling instead of WebSocket | FREE |

**Total Cost to Start**: $0 💰

---

## 📁 Project Structure (Simple)

```
mavtat/
├── backend/                    # Node.js API
│   ├── server.js              # Main entry
│   ├── db.js                  # Database setup
│   ├── routes/
│   │   ├── vehicles.js
│   │   ├── auth.js
│   │   ├── maintenance.js
│   │   └── reports.js
│   ├── .env                   # Secrets
│   └── package.json
│
├── public/                     # Frontend
│   ├── index.html             # Keep your existing HTML
│   ├── css/
│   ├── js/
│   │   ├── app.js
│   │   ├── api.js             # Fetch calls to backend
│   │   └── ui.js
│   └── assets/
│
├── database.sqlite            # Local SQLite DB
└── README.md
```

---

## 🚀 Quick Start (30 minutes)

### Step 1: Initialize Backend

```bash
mkdir mavtat
cd mavtat
npm init -y
npm install express sqlite3 dotenv cors body-parser
```

### Step 2: Create Basic Server

**server.js**:
```javascript
const express = require('express');
const sqlite3 = require('sqlite3');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('DB Error:', err);
    else console.log('✅ Database connected');
});

// Initialize DB tables on startup
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY,
            make TEXT,
            model TEXT,
            license_plate TEXT UNIQUE,
            type TEXT,
            mileage INTEGER DEFAULT 0,
            fuel_level INTEGER DEFAULT 100,
            status TEXT DEFAULT 'available',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS maintenance (
            id INTEGER PRIMARY KEY,
            vehicle_id INTEGER,
            service_type TEXT,
            cost REAL,
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS rental (
            id INTEGER PRIMARY KEY,
            vehicle_id INTEGER,
            driver_name TEXT,
            start_date DATETIME,
            end_date DATETIME,
            price REAL,
            status TEXT DEFAULT 'active',
            FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
        )
    `);
});

// API Routes
app.get('/api/vehicles', (req, res) => {
    db.all(`SELECT * FROM vehicles ORDER BY created_at DESC`, (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

app.post('/api/vehicles', (req, res) => {
    const { make, model, license_plate, type, mileage } = req.body;
    db.run(
        `INSERT INTO vehicles (make, model, license_plate, type, mileage) 
         VALUES (?, ?, ?, ?, ?)`,
        [make, model, license_plate, type, mileage],
        function(err) {
            if (err) res.status(400).json({ error: err.message });
            else res.json({ id: this.lastID });
        }
    );
});

app.patch('/api/vehicles/:id', (req, res) => {
    const { mileage, status, fuel_level } = req.body;
    db.run(
        `UPDATE vehicles SET mileage=?, status=?, fuel_level=? WHERE id=?`,
        [mileage, status, fuel_level, req.params.id],
        (err) => {
            if (err) res.status(400).json({ error: err.message });
            else res.json({ success: true });
        }
    );
});

app.delete('/api/vehicles/:id', (req, res) => {
    db.run(`DELETE FROM vehicles WHERE id=?`, [req.params.id], (err) => {
        if (err) res.status(400).json({ error: err.message });
        else res.json({ success: true });
    });
});

// Maintenance endpoints
app.get('/api/maintenance/:vehicle_id', (req, res) => {
    db.all(
        `SELECT * FROM maintenance WHERE vehicle_id=? ORDER BY date DESC`,
        [req.params.vehicle_id],
        (err, rows) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json(rows);
        }
    );
});

app.post('/api/maintenance', (req, res) => {
    const { vehicle_id, service_type, cost } = req.body;
    db.run(
        `INSERT INTO maintenance (vehicle_id, service_type, cost) VALUES (?, ?, ?)`,
        [vehicle_id, service_type, cost],
        (err) => {
            if (err) res.status(400).json({ error: err.message });
            else res.json({ success: true });
        }
    );
});

// Financial reports
app.get('/api/reports/revenue', (req, res) => {
    db.all(`
        SELECT 
            v.id, 
            v.make || ' ' || v.model as vehicle,
            COUNT(r.id) as rentals,
            SUM(r.price) as total_revenue
        FROM vehicles v
        LEFT JOIN rental r ON v.id = r.vehicle_id
        GROUP BY v.id
    `, (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
```

### Step 3: Update Frontend (public/index.html)

Keep your existing HTML but add this at the bottom to connect to backend:

```html
<script src="js/api.js"></script>
<script>
// When page loads, fetch from backend instead of hardcoded data
document.addEventListener('DOMContentLoaded', () => {
    loadVehicles();
    loadReports();
});

async function loadVehicles() {
    const vehicles = await fetch('/api/vehicles').then(r => r.json());
    app.state.vehicles = vehicles;
    renderVehicles();
}

async function loadReports() {
    const reports = await fetch('/api/reports/revenue').then(r => r.json());
    // Update your report displays with real data
    console.log('Financial reports:', reports);
}
</script>
```

### Step 4: Create .env file

```
PORT=3000
NODE_ENV=development
```

### Step 5: Run It

```bash
node server.js
```

Visit: `http://localhost:3000`

---

## 📊 Database Queries (for future optimization)

```sql
-- Total revenue per vehicle
SELECT 
    v.make || ' ' || v.model as vehicle,
    SUM(r.price) as revenue,
    COUNT(r.id) as rentals
FROM vehicles v
LEFT JOIN rental r ON v.id = r.vehicle_id
GROUP BY v.id
ORDER BY revenue DESC;

-- Maintenance due (based on mileage)
SELECT * FROM vehicles 
WHERE mileage > 50000 AND status != 'maintenance'
ORDER BY mileage DESC;

-- Active rentals
SELECT v.*, r.driver_name, r.start_date, r.end_date
FROM vehicles v
JOIN rental r ON v.id = r.vehicle_id
WHERE r.status = 'active';
```

---

## 🚢 Deploy for FREE

### Option 1: Railway.app (Recommended - Super Easy)

1. Push to GitHub (create repo)
2. Go to https://railway.app
3. Click "Deploy from GitHub"
4. Select your repo
5. Add environment variables
6. ✅ Done! Your app is live

**Cost**: Free tier includes $5/month (enough for small business)

### Option 2: Render.com

1. Push to GitHub
2. Go to https://render.com
3. Create Web Service from GitHub
4. Connect repo
5. ✅ Auto-deploys on push

**Cost**: Free tier available (with limitations)

### Option 3: Fly.io

```bash
npm install -g flyctl
fly launch
fly deploy
```

**Cost**: Free tier + pay-as-you-go

---

## 💡 Frontend Integration (Keep It Simple)

Instead of fancy frameworks, just fetch from your backend API:

**public/js/api.js**:
```javascript
const API = {
    vehicles: {
        list: () => fetch('/api/vehicles').then(r => r.json()),
        create: (data) => fetch('/api/vehicles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(r => r.json()),
        update: (id, data) => fetch(`/api/vehicles/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(r => r.json()),
        delete: (id) => fetch(`/api/vehicles/${id}`, {
            method: 'DELETE'
        }).then(r => r.json())
    },

    maintenance: {
        list: (vehicleId) => fetch(`/api/maintenance/${vehicleId}`).then(r => r.json()),
        create: (data) => fetch('/api/maintenance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(r => r.json())
    },

    reports: {
        revenue: () => fetch('/api/reports/revenue').then(r => r.json())
    }
};

// Usage in your existing code:
// const vehicles = await API.vehicles.list();
// const created = await API.vehicles.create({make: 'Toyota', model: 'Corolla', ...});
```

---

## 🛠️ Add Features Incrementally

### Week 1: MVP
- ✅ Vehicle CRUD
- ✅ Dashboard (summary stats)
- ✅ List vehicles

### Week 2: Core Features
- ✅ Maintenance tracking
- ✅ Update vehicle status/mileage
- ✅ Basic reports

### Week 3: Polish
- ✅ Search vehicles
- ✅ Export CSV
- ✅ Better UI

### Week 4: Nice-to-Have
- ✅ GPS tracking (static data)
- ✅ Driver management
- ✅ Fuel logs

---

## 🔐 Quick Security Tips

```javascript
// Add basic auth (optional, for small business)
const basicAuth = require('express-basic-auth');

app.use(basicAuth({
    users: { 'admin': 'your-password' }
}));

// Validate input
const validateVehicle = (req, res, next) => {
    const { make, model, license_plate } = req.body;
    if (!make || !model || !license_plate) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    next();
};

app.post('/api/vehicles', validateVehicle, (req, res) => {
    // ... your code
});
```

---

## 📦 What You Get

- ✅ Working web app in 2-4 weeks
- ✅ $0 setup cost
- ✅ Can run on any device
- ✅ Easy to modify
- ✅ No vendor lock-in
- ✅ Small business friendly

---

## 🐛 Troubleshooting

**"Cannot find module sqlite3"**
```bash
npm install sqlite3 --save
```

**Port already in use**
```bash
PORT=8080 node server.js
```

**Database locked error**
```javascript
// Use this instead in db.js
const db = new sqlite3.Database('./database.sqlite', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
```

**CORS errors**
```javascript
// Make sure this is at top of server.js
const cors = require('cors');
app.use(cors());
```

---

## 📚 Next Steps

1. Copy the `server.js` code above
2. Run `npm install`
3. Run `node server.js`
4. Test endpoints with Postman or curl
5. Update your HTML to call `/api/*` endpoints
6. Deploy to Railway/Render

**That's it! You're done.**

---

**Vibes Only ✨**

No complex architecture. No microservices. No Kubernetes. Just a simple Node.js backend + your existing HTML frontend = working fleet management app for your small business.

Questions? Check out:
- [Express.js Docs](https://expressjs.com)
- [SQLite Docs](https://www.sqlite.org)
- [Railway Docs](https://docs.railway.app)
