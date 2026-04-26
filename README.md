# MAVTAT Motors Fleet Management - Full Stack

A modern fleet management dashboard built with Node.js backend and Tailwind CSS frontend. This app is now **production-ready with real database storage**.

## 🎯 What's New (Backend Edition)

✅ **Real Database** - SQLite stores all data persistently  
✅ **Backend API** - Express.js server with 20+ endpoints  
✅ **API Client** - Frontend integrated with backend  
✅ **Production Ready** - Easy to scale and deploy  

## 🚀 Quick Start

### Run the Backend

```bash
cd backend
npm install
npm start
```

**App will be live at**: `http://localhost:3000`

That's it! Open in your browser. 🎉

### Features

- **Dashboard**: Real-time fleet statistics
- **Vehicle Registry**: Manage vehicles with persistent database
- **Maintenance Tracking**: Log and track maintenance per vehicle
- **Financial Reports**: Revenue, expenses, and profit analysis
- **Responsive Design**: Works on mobile, tablet, desktop
- **PDF & CSV Export**: Generate reports in multiple formats

## 📁 Project Structure

```
mavtat/
├── backend/                 ← NEW! Node.js + Express server
│   ├── server.js           ← Main backend (150 lines)
│   ├── package.json        ← Dependencies
│   ├── .env                ← Configuration
│   └── database.sqlite     ← Data storage
│
├── public/                 ← Frontend (static files)
│   ├── index.html         ← Main app
│   ├── css/               ← Styles
│   └── js/
│       ├── api-client.js  ← NEW! API wrapper
│       └── integration.js ← NEW! Backend integration
│
└── README.md              ← This file
```

## 🔌 API Endpoints

### Vehicles
```
GET    /api/vehicles              # List all vehicles
POST   /api/vehicles              # Create vehicle
PATCH  /api/vehicles/:id          # Update vehicle
DELETE /api/vehicles/:id          # Delete vehicle
```

### Maintenance
```
GET    /api/maintenance           # All records
POST   /api/maintenance           # Log maintenance
GET    /api/maintenance/vehicle/:id  # Vehicle history
```

### Reports
```
GET    /api/reports/summary       # Fleet summary
GET    /api/reports/revenue       # Revenue per vehicle
GET    /api/reports/fuel          # Fuel consumption
```

## 🛠️ Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite (file-based, no setup needed)
- **Frontend**: Vanilla JavaScript + Tailwind CSS
- **API**: RESTful JSON API
- **Export**: PDF & CSV support

## 📊 Database Tables

- `vehicles` - Fleet inventory
- `maintenance` - Service records
- `rental` - Rental contracts
- `fuel_logs` - Fuel tracking

## 🚢 Deploy (Free!)

### Render.com (Easiest)
1. Push to GitHub
2. Go to render.com
3. Create Web Service from repo
4. ✅ Done! Auto-deploys on push

### Railway.app
1. `npm install -g railway`
2. `railway link` (connect GitHub repo)
3. `railway deploy`

### Fly.io
```bash
npm install -g flyctl
fly launch
fly deploy
```

## 💾 Data Persistence

All data saved in `database.sqlite` (survives server restarts). To reset:
```bash
rm database.sqlite
npm start
```

## 🔒 Security

For production, add:
- Authentication (JWT tokens)
- Input validation
- Rate limiting
- HTTPS/SSL

## 📝 Development

### Add New Vehicle
```javascript
const result = await API.vehicles.create({
    make: "Toyota",
    model: "Corolla", 
    license_plate: "ABC 123",
    type: "taxi",
    mileage: 45000
});
```

### Update Vehicle Status
```javascript
await API.vehicles.updateStatus(vehicleId, 'maintenance');
```

### Get Revenue Report
```javascript
const revenue = await API.reports.revenue();
```

## 🐛 Troubleshooting

**Port 3000 already in use?**
```bash
PORT=8080 npm start
```

**Database locked?**
```bash
rm database.sqlite
npm start
```

**Module not found?**
```bash
npm install
```

## 📚 Next Steps

- ✅ Backend running with real database
- ⏭️ Add authentication/login
- ⏭️ Add GPS tracking
- ⏭️ Mobile app (React Native)
- ⏭️ Advanced analytics

## 🎓 Learning Resources

- [Express.js Docs](https://expressjs.com)
- [SQLite Docs](https://www.sqlite.org)
- [Render Deployment](https://render.com/docs)
- [API Design Best Practices](https://restfulapi.net)

## 📞 Support

For issues:
1. Check `backend/README.md` for setup guide
2. Review API endpoints above
3. Check browser console (F12) for errors
4. Ensure backend is running on port 3000

## 📄 License

© 2026 MAVTAT Motors. All rights reserved.

---

**Built with ❤️ for small business fleet management**

