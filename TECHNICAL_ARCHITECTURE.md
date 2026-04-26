# MAVTAT Motors - Technical Architecture Document

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER LAYER                             │
├──────────────────────┬──────────────────┬───────────────────────┤
│  Web Browser (React) │ Mobile App (RN)  │ Admin Dashboard       │
└──────────┬───────────┴────────┬─────────┴───────────┬───────────┘
           │                    │                     │
           └────────────────────┼─────────────────────┘
                                │ HTTPS/WSS
           ┌────────────────────▼─────────────────────┐
           │     API GATEWAY / LOAD BALANCER          │
           │  (Nginx / AWS ALB)                       │
           └────────────────────┬─────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
   ┌────▼────────┐      ┌──────▼────────┐      ┌──────▼────────┐
   │ REST API    │      │ WebSocket     │      │ GraphQL       │
   │ Server 1    │      │ Server (RT)   │      │ Server        │
   └────┬────────┘      └──────┬────────┘      └──────┬────────┘
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               │
                 ┌─────────────▼─────────────┐
                 │  Service Layer            │
                 │ ┌─────────────────────┐   │
                 │ │ Auth Service        │   │
                 │ │ Vehicle Service     │   │
                 │ │ Maintenance Service │   │
                 │ │ Financial Service   │   │
                 │ │ Tracking Service    │   │
                 │ │ Report Service      │   │
                 │ └─────────────────────┘   │
                 └────────────┬──────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼──────┐      ┌──────▼────────┐      ┌────▼──────┐
   │ PostgreSQL│      │ Redis Cache   │      │ S3 Storage│
   │ (Primary) │      │ (Session/     │      │ (Docs,    │
   │           │      │  Real-time)   │      │  Images)  │
   └───────────┘      └───────────────┘      └───────────┘
```

---

## Backend Architecture

### Core Services

#### 1. Authentication Service
```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh-token
POST /api/v1/auth/logout
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
```

**Tech Stack**:
- Library: Passport.js or Custom JWT
- Encryption: bcrypt (password hashing)
- Storage: PostgreSQL
- Tokens: JWT (access + refresh tokens)
- 2FA: TOTP (Time-based One-Time Password)

**Implementation**:
```javascript
// Example structure
src/services/auth/
├── authService.js        // Core logic
├── tokenManager.js       // JWT handling
├── passwordManager.js    // Hashing & validation
├── 2faService.js         // Two-factor auth
└── sessionManager.js     // Session tracking
```

---

#### 2. Vehicle Service
```
GET    /api/v1/vehicles              # List with filters
POST   /api/v1/vehicles              # Create
GET    /api/v1/vehicles/:id          # Details
PATCH  /api/v1/vehicles/:id          # Update
DELETE /api/v1/vehicles/:id          # Delete
GET    /api/v1/vehicles/:id/status   # Current status
PATCH  /api/v1/vehicles/:id/status   # Update status
```

**Database Schema** (PostgreSQL):
```sql
CREATE TABLE vehicles (
    id UUID PRIMARY KEY,
    company_id UUID REFERENCES companies(id),
    make VARCHAR(255) NOT NULL,
    model VARCHAR(255) NOT NULL,
    license_plate VARCHAR(50) UNIQUE NOT NULL,
    type ENUM('taxi', 'rental', 'logistics'),
    vin VARCHAR(50) UNIQUE,
    registration_number VARCHAR(100),
    acquisition_date DATE,
    purchase_price DECIMAL(12, 2),
    current_mileage INT DEFAULT 0,
    fuel_level INT DEFAULT 100,
    status ENUM('available', 'active', 'rented', 'maintenance', 'low_fuel', 'inactive') DEFAULT 'available',
    location_lat DECIMAL(10, 8),
    location_lon DECIMAL(11, 8),
    gps_last_updated TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vehicle_specifications (
    id UUID PRIMARY KEY,
    vehicle_id UUID REFERENCES vehicles(id) ON DELETE CASCADE,
    engine_type VARCHAR(100),
    engine_capacity VARCHAR(50),
    transmission VARCHAR(50),
    fuel_type ENUM('petrol', 'diesel', 'electric', 'hybrid'),
    seating_capacity INT,
    cargo_capacity_kg INT,
    color VARCHAR(50),
    year_manufactured INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Caching Strategy**:
- Cache vehicle list in Redis (5 min TTL)
- Cache individual vehicle details (10 min TTL)
- Invalidate cache on updates

---

#### 3. GPS Tracking Service
```
POST   /api/v1/vehicles/:id/location           # Update location
GET    /api/v1/vehicles/:id/location/current   # Current location
GET    /api/v1/vehicles/:id/location/history   # Trip history
GET    /api/v1/vehicles/map                    # Fleet on map
WS     /ws/tracking                             # WebSocket stream
```

**Real-time Architecture**:
```
Mobile Device (GPS)
    ↓ (every 30 seconds)
    ↓
REST API /vehicles/:id/location
    ↓
Vehicle Service (validates)
    ↓
PostgreSQL (storage) + Redis (pub/sub)
    ↓
WebSocket Server (Socket.io)
    ↓
Web Dashboard (real-time map update)
```

**Database Schema**:
```sql
CREATE TABLE vehicle_locations (
    id UUID PRIMARY KEY,
    vehicle_id UUID REFERENCES vehicles(id),
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy INT, -- in meters
    speed INT,    -- km/h
    heading INT,  -- degrees 0-360
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast queries
CREATE INDEX idx_vehicle_locations_vehicle_timestamp 
ON vehicle_locations(vehicle_id, timestamp DESC);
```

---

#### 4. Maintenance Service
```
POST   /api/v1/maintenance/schedules           # Create schedule
GET    /api/v1/maintenance/schedules/:id       # Get schedule
PATCH  /api/v1/maintenance/schedules/:id       # Update
GET    /api/v1/vehicles/:id/maintenance        # Vehicle history
POST   /api/v1/maintenance/work-orders         # Create work order
GET    /api/v1/maintenance/alerts              # Due maintenance alerts
```

**Maintenance Rules Engine**:
```javascript
// Example maintenance calculation
const calculateMaintenanceSchedule = (vehicleType) => {
    return {
        oilChange: { mileage: 5000, months: 3 },
        brakePads: { mileage: 50000, months: 24 },
        tireRotation: { mileage: 10000, months: 6 },
        inspection: { mileage: 20000, months: 12 }
    };
};

const getMaintenanceAlerts = (vehicle) => {
    const alerts = [];
    const schedule = calculateMaintenanceSchedule(vehicle.type);
    
    for (const [service, requirements] of Object.entries(schedule)) {
        if (vehicle.mileage >= requirements.mileage) {
            alerts.push({ service, daysOverdue: calculateDays() });
        }
    }
    return alerts;
};
```

---

#### 5. Financial Service
```
POST   /api/v1/financial/invoices              # Create invoice
GET    /api/v1/financial/invoices              # List invoices
POST   /api/v1/financial/payments              # Record payment
GET    /api/v1/financial/reports/vehicle/:id   # Vehicle financials
GET    /api/v1/financial/reports/summary       # Fleet summary
POST   /api/v1/financial/export/csv            # Export to CSV
POST   /api/v1/financial/export/pdf            # Export to PDF
```

**Payment Processing**:
```javascript
// Stripe integration example
const processPayment = async (invoiceId, paymentToken) => {
    try {
        const invoice = await Invoice.findById(invoiceId);
        
        const paymentIntent = await stripe.paymentIntents.create({
            amount: invoice.amount * 100, // cents
            currency: invoice.currency || 'usd',
            payment_method: paymentToken,
            confirm: true
        });
        
        if (paymentIntent.status === 'succeeded') {
            await Invoice.updateStatus(invoiceId, 'paid');
            await Transaction.create({
                invoiceId,
                paymentIntentId: paymentIntent.id,
                amount: invoice.amount,
                status: 'completed'
            });
        }
    } catch (error) {
        logger.error('Payment failed', error);
        throw error;
    }
};
```

---

#### 6. Reporting Service
```
GET    /api/v1/reports/dashboard               # Dashboard data
GET    /api/v1/reports/financial               # Financial report
GET    /api/v1/reports/vehicles                # Vehicle performance
GET    /api/v1/reports/drivers                 # Driver performance
POST   /api/v1/reports/generate                # Generate custom
POST   /api/v1/reports/schedule                # Scheduled reports
```

**Report Generation**:
```javascript
class ReportGenerator {
    async generateFinancialReport(filters) {
        const {startDate, endDate, vehicleIds} = filters;
        
        // Query aggregated data
        const transactions = await Transaction.aggregate([
            {$match: {
                createdAt: {$gte: startDate, $lte: endDate},
                vehicleId: {$in: vehicleIds}
            }},
            {$group: {
                _id: '$vehicleId',
                revenue: {$sum: '$amount'},
                count: {$sum: 1}
            }}
        ]);
        
        // Generate visualizations
        return {
            summary: calculateSummary(transactions),
            charts: generateCharts(transactions),
            details: transactions
        };
    }
    
    async exportPDF(data) {
        const pdf = new jsPDF();
        // Add content
        return pdf.output('arraybuffer');
    }
    
    async exportCSV(data) {
        return Papa.unparse(data);
    }
}
```

---

### Database Design

#### Core Tables
```
companies
├── users
├── vehicles
│   ├── vehicle_specifications
│   ├── vehicle_locations
│   ├── vehicle_maintenance
│   ├── vehicle_fuel_logs
│   └── vehicle_incidents
├── drivers
│   ├── driver_documents
│   └── driver_performance
├── rentals
│   └── rental_contracts
├── maintenance
│   ├── maintenance_schedules
│   ├── maintenance_work_orders
│   └── maintenance_vendors
├── financial
│   ├── invoices
│   ├── transactions
│   ├── expenses
│   └── revenue
└── audit
    └── audit_logs
```

---

### API Security

**Authentication Strategy**:
```
1. User provides credentials
2. Server validates & issues JWT (access token + refresh)
3. Client includes JWT in Authorization header
4. Server validates JWT middleware
5. Token expires in 1 hour
6. Client uses refresh token to get new access token
7. Refresh token expires in 30 days
```

**Request/Response Security**:
```javascript
// Middleware stack
app.use(helmet()); // Security headers
app.use(cors({ origin: process.env.ALLOWED_ORIGINS }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(express.json({ limit: '10kb' }));
app.use(validateJWT); // Custom JWT middleware
app.use(authorizeRole); // Role-based access
```

---

## Frontend Architecture

### React Component Structure

```
src/
├── components/
│   ├── auth/
│   │   ├── LoginForm.jsx
│   │   ├── RegisterForm.jsx
│   │   └── AuthGuard.jsx
│   ├── layout/
│   │   ├── Sidebar.jsx
│   │   ├── TopBar.jsx
│   │   └── MainLayout.jsx
│   ├── vehicles/
│   │   ├── VehicleList.jsx
│   │   ├── VehicleCard.jsx
│   │   ├── VehicleForm.jsx
│   │   └── VehicleStatusBadge.jsx
│   ├── tracking/
│   │   ├── Map.jsx
│   │   ├── VehicleMarker.jsx
│   │   └── TrackingPanel.jsx
│   ├── reports/
│   │   ├── ReportDashboard.jsx
│   │   ├── FinancialReport.jsx
│   │   └── ExportButton.jsx
│   └── common/
│       ├── Modal.jsx
│       ├── Table.jsx
│       ├── Button.jsx
│       └── Toast.jsx
│
├── pages/
│   ├── Dashboard.jsx
│   ├── VehicleRegistry.jsx
│   ├── Reports.jsx
│   ├── Tracking.jsx
│   ├── Maintenance.jsx
│   ├── AdminPanel.jsx
│   └── Settings.jsx
│
├── store/
│   ├── index.js
│   ├── slices/
│   │   ├── authSlice.js
│   │   ├── vehiclesSlice.js
│   │   ├── uiSlice.js
│   │   └── reportsSlice.js
│   └── hooks/
│       ├── useAuth.js
│       ├── useVehicles.js
│       └── useReports.js
│
├── services/
│   ├── api.js (Axios client)
│   ├── auth.js
│   ├── vehicles.js
│   ├── tracking.js
│   ├── reports.js
│   └── websocket.js
│
├── hooks/
│   ├── useAsync.js
│   ├── useForm.js
│   ├── usePagination.js
│   └── useDebounce.js
│
├── utils/
│   ├── validators.js
│   ├── formatters.js
│   ├── constants.js
│   └── storage.js (LocalStorage wrapper)
│
├── styles/
│   ├── globals.css
│   ├── variables.css
│   └── animations.css
│
└── App.jsx
```

### State Management (Redux)

```javascript
// Example: vehiclesSlice.js
const vehiclesSlice = createSlice({
    name: 'vehicles',
    initialState: {
        items: [],
        selectedId: null,
        filters: { status: null, type: null },
        pagination: { page: 1, total: 0 },
        loading: false,
        error: null
    },
    reducers: {
        setVehicles: (state, action) => {
            state.items = action.payload;
        },
        setSelectedVehicle: (state, action) => {
            state.selectedId = action.payload;
        },
        updateVehicle: (state, action) => {
            const idx = state.items.findIndex(v => v.id === action.payload.id);
            if (idx !== -1) state.items[idx] = action.payload;
        },
        setFilters: (state, action) => {
            state.filters = action.payload;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchVehicles.pending, (state) => { state.loading = true; })
            .addCase(fetchVehicles.fulfilled, (state, action) => {
                state.loading = false;
                state.items = action.payload.items;
                state.pagination.total = action.payload.total;
            })
            .addCase(fetchVehicles.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            });
    }
});

export const fetchVehicles = createAsyncThunk(
    'vehicles/fetchVehicles',
    async (filters, { rejectWithValue }) => {
        try {
            const response = await vehicleService.list(filters);
            return response.data;
        } catch (error) {
            return rejectWithValue(error.message);
        }
    }
);
```

---

## Real-Time Features

### WebSocket Architecture

```
Client (Browser)
    │
    ├─ Connection established
    │  (io.connect('ws://backend:3001'))
    │
    ├─ Join room: 'vehicle:123'
    │  (socket.emit('join_vehicle_tracking', {vehicleId: 123}))
    │
    ├─ Receive location update
    │  (socket.on('location_updated', data => {...}))
    │
    └─ Disconnect
       (socket.disconnect())

Backend (Node.js + Socket.io)
    │
    ├─ Vehicle location received via REST API
    │  (POST /vehicles/123/location)
    │
    ├─ Store in database
    │  (PostgreSQL)
    │
    ├─ Publish to Redis channel
    │  (redis.publish('vehicle:123', JSON.stringify(location)))
    │
    ├─ Emit to connected clients
    │  (io.to('vehicle:123').emit('location_updated', location))
    │
    └─ Update map in real-time
```

### Socket Events

```javascript
// Server-side (io.js)
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Join vehicle tracking
    socket.on('join_vehicle_tracking', (data) => {
        socket.join(`vehicle:${data.vehicleId}`);
    });
    
    // Real-time location broadcast
    redis.subscribe(`vehicle:${vehicleId}`, (err, count) => {
        if (!err) {
            redis.on('message', (channel, message) => {
                io.to(channel).emit('location_updated', JSON.parse(message));
            });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Client-side (React)
useEffect(() => {
    const socket = io(process.env.REACT_APP_WS_URL);
    
    socket.emit('join_vehicle_tracking', { vehicleId });
    
    socket.on('location_updated', (location) => {
        setVehicleLocation(location);
        updateMapMarker(location);
    });
    
    return () => socket.disconnect();
}, [vehicleId]);
```

---

## Mobile App Architecture

### React Native Structure

```
mobile/
├── src/
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.js
│   │   │   └── RegisterScreen.js
│   │   ├── driver/
│   │   │   ├── HomeScreen.js
│   │   │   ├── TrackingScreen.js
│   │   │   ├── MaintenanceScreen.js
│   │   │   └── ProfileScreen.js
│   │   └── manager/
│   │       ├── DashboardScreen.js
│   │       ├── VehiclesScreen.js
│   │       └── ReportsScreen.js
│   ├── navigation/
│   │   ├── RootNavigator.js
│   │   ├── AuthNavigator.js
│   │   └── AppNavigator.js
│   ├── services/
│   │   ├── api.js (axios)
│   │   ├── auth.js
│   │   ├── tracking.js
│   │   └── storage.js (AsyncStorage)
│   ├── components/
│   │   ├── VehicleCard.js
│   │   ├── Button.js
│   │   └── Map.js
│   ├── store/
│   │   ├── index.js
│   │   ├── authSlice.js
│   │   └── vehiclesSlice.js
│   └── App.js
├── ios/
├── android/
└── package.json
```

### Background Location Tracking (React Native)

```javascript
import BackgroundGeolocation from '@react-native-camera-roll/react-native-background-geolocation';

useEffect(() => {
    BackgroundGeolocation.configure({
        desiredAccuracy: 10,
        stationaryRadius: 50,
        distanceFilter: 50,
        notificationTitle: 'MAVTAT Motors',
        notificationText: 'Tracking active',
        interval: 30000, // 30 seconds
        fastestInterval: 5000,
        activitiesInterval: 10000,
        stopOnStillActivity: false
    });
    
    BackgroundGeolocation.on('location', (location) => {
        // Send to server
        apiService.updateVehicleLocation({
            lat: location.latitude,
            lng: location.longitude,
            accuracy: location.accuracy,
            speed: location.speed
        });
    });
    
    BackgroundGeolocation.start();
    
    return () => BackgroundGeolocation.stop();
}, []);
```

---

## Deployment Architecture

### Docker Compose (Development)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: mavtat
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: mavtat_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    depends_on:
      - postgres
      - redis
    environment:
      NODE_ENV: development
      DB_HOST: postgres
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - "3000:3000"
    volumes:
      - ./backend/src:/app/src

  frontend:
    build: ./frontend
    ports:
      - "3001:3001"
    volumes:
      - ./frontend/src:/app/src

volumes:
  postgres_data:
```

### Kubernetes Deployment (Production)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mavtat-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mavtat-backend
  template:
    metadata:
      labels:
        app: mavtat-backend
    spec:
      containers:
      - name: backend
        image: mavtat/backend:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: mvat-config
              key: db_host
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
```

---

## Monitoring & Logging

### Datadog Integration

```javascript
const dd_trace = require('dd-trace');
dd_trace.init({
    enabled: process.env.NODE_ENV === 'production',
    debug: false
});

const StatsD = require('node-dogstatsd').StatsD;
const dogstatsd = new StatsD();

// Track API endpoints
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        dogstatsd.histogram('api.request.duration', duration, {
            tags: [`endpoint:${req.path}`, `method:${req.method}`, `status:${res.statusCode}`]
        });
    });
    next();
});

// Track business metrics
dogstatsd.gauge('fleet.active_vehicles', vehicleCount);
dogstatsd.increment('fleet.revenue', revenue);
dogstatsd.gauge('system.database.connections', dbConnections);
```

### ELK Stack (Elasticsearch, Logstash, Kibana)

```javascript
const elasticsearch = require('elasticsearch');
const client = new elasticsearch.Client({
    host: process.env.ELASTIC_HOST,
    port: 9200
});

const logger = require('winston');
logger.add(new logger.transports.elasticsearch({
    client: client,
    index: 'mavtat-logs'
}));

logger.info('Vehicle updated', {
    vehicleId: '123',
    status: 'active',
    timestamp: new Date()
});
```

---

## Performance Optimization

### Database Indexing

```sql
-- Frequently queried columns
CREATE INDEX idx_vehicles_company_status 
ON vehicles(company_id, status);

CREATE INDEX idx_vehicles_license_plate 
ON vehicles(license_plate);

CREATE INDEX idx_locations_vehicle_timestamp 
ON vehicle_locations(vehicle_id, timestamp DESC);

CREATE INDEX idx_transactions_date 
ON transactions(created_at DESC);

-- Full-text search
CREATE INDEX idx_vehicles_search 
ON vehicles USING gin(to_tsvector('english', make || ' ' || model));
```

### Caching Strategy

```javascript
// Redis caching layers
const CACHE_KEYS = {
    VEHICLE_DETAILS: 'vehicle:{id}',
    VEHICLE_LIST: 'vehicles:list:{company_id}:{page}',
    VEHICLE_LOCATION: 'vehicle:location:{id}',
    DASHBOARD_SUMMARY: 'dashboard:summary:{company_id}',
    FINANCIAL_REPORT: 'report:financial:{id}:{start}:{end}'
};

const CACHE_TTL = {
    SHORT: 300,      // 5 minutes
    MEDIUM: 900,     // 15 minutes
    LONG: 3600,      // 1 hour
    REALTIME: 30     // 30 seconds
};

async function getVehicleDetails(vehicleId) {
    const cacheKey = CACHE_KEYS.VEHICLE_DETAILS.replace('{id}', vehicleId);
    
    // Try cache first
    let vehicle = await redis.get(cacheKey);
    if (vehicle) return JSON.parse(vehicle);
    
    // Cache miss - fetch from DB
    vehicle = await Vehicle.findById(vehicleId);
    
    // Store in cache
    await redis.setex(cacheKey, CACHE_TTL.MEDIUM, JSON.stringify(vehicle));
    
    return vehicle;
}
```

---

## Scalability Considerations

### Horizontal Scaling

- **Stateless API servers**: Deploy multiple backend instances behind load balancer
- **Session management**: Use Redis for distributed sessions
- **Database read replicas**: PostgreSQL replication for read-heavy operations
- **Microservices**: Extract services (payment, tracking, reporting) to separate services

### Vertical Scaling

- Increase server resources (CPU, RAM)
- Database query optimization
- Connection pooling (PgBouncer)

### Data Sharding

```javascript
// Future: Shard by company_id
const getShardId = (companyId) => {
    return hashFunction(companyId) % NUM_SHARDS;
};

// Route requests to correct shard
const getDatabase = (companyId) => {
    const shardId = getShardId(companyId);
    return databases[shardId];
};
```

---

**Document Version**: 1.0  
**Last Updated**: April 26, 2026
