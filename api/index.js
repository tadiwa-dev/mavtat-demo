const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ CRITICAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from environment variables.');
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder');

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Middleware to check authentication
async function requireAuth(req, res, next) {
    const sessionId = req.headers.authorization?.replace('Bearer ', '');
    if (!sessionId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { data: session, error } = await supabase
        .from('sessions')
        .select('user_id, users(username, role)')
        .eq('id', sessionId)
        .single();

    if (error || !session) {
        return res.status(401).json({ error: 'Invalid session' });
    }

    // Update last activity
    await supabase.from('sessions').update({ last_activity: new Date().toISOString() }).eq('id', sessionId);

    req.user = { id: session.user_id, username: session.users.username, role: session.users.role };
    next();
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Serve root files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.get('/logo.png', (req, res) => {
    res.sendFile(path.join(__dirname, '../logo.png'));
});

// ============= AUTHENTICATION ENDPOINTS =============

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

    const { data: user, error } = await supabase
        .from('users')
        .select('id, username, role, password_hash')
        .eq('username', username)
        .eq('password_hash', passwordHash)
        .single();

    if (error || !user) {
        if (error) console.error('❌ Login Supabase Error:', error);
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', user.id);

    const sessionId = crypto.randomBytes(32).toString('hex');
    
    // Save session to database
    await supabase.from('sessions').insert([{ id: sessionId, user_id: user.id }]);

    res.json({
        sessionId: sessionId,
        user: { id: user.id, username: user.username, role: user.role }
    });
});

app.post('/api/auth/logout', async (req, res) => {
    const sessionId = req.headers.authorization?.replace('Bearer ', '');
    if (sessionId) {
        await supabase.from('sessions').delete().eq('id', sessionId);
    }
    res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
    // Update last_login in users table to reflect most recent activity
    await supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', req.user.id);
    res.json({ user: req.user });
});

app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
    const { data: users, error } = await supabase
        .from('users')
        .select('id, username, role, created_at, last_login')
        .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(users || []);
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const { data, error } = await supabase
        .from('users')
        .insert([{ username, password_hash: passwordHash, role: role || 'user' }])
        .select()
        .single();

    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ id: data.id, username, role: data.role, message: 'User created successfully' });
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
    const userId = req.params.id;
    if (userId == req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (error) {
        console.error('❌ Supabase Error:', error);
        return res.status(400).json({ error: error.message });
    }
    res.json({ success: true, message: 'User deleted successfully' });
});

// ============= VEHICLES ENDPOINTS =============

app.get('/api/vehicles', requireAuth, async (req, res) => {
    const { status, type } = req.query;
    let query = supabase.from('vehicles').select('*');

    if (status) query = query.eq('status', status);
    if (type) query = query.eq('type', type);

    const { data: vehicles, error } = await query.order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(vehicles || []);
});

app.get('/api/vehicles/:id', requireAuth, async (req, res) => {
    const { data: vehicle, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('id', req.params.id)
        .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
    res.json(vehicle);
});

app.post('/api/vehicles', requireAuth, async (req, res) => {
    const { make, model, license_plate, type, mileage } = req.body;

    if (!make || !model || !license_plate || !type) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabase
        .from('vehicles')
        .insert([{ make, model, license_plate, type, mileage: mileage || 0 }])
        .select()
        .single();

    if (error) {
        console.error('❌ Supabase Error:', error);
        return res.status(400).json({ error: error.message });
    }
    res.status(201).json({ id: data.id, message: 'Vehicle created successfully' });
});

app.patch('/api/vehicles/:id', requireAuth, async (req, res) => {
    const vehicleId = req.params.id;
    const { mileage, ...otherData } = req.body;

    // If mileage is being updated, get the previous mileage first for the log
    if (mileage !== undefined) {
        const { data: vehicle } = await supabase
            .from('vehicles')
            .select('mileage')
            .eq('id', vehicleId)
            .single();

        // Log the mileage change
        await supabase.from('mileage_logs').insert([{
            vehicle_id: vehicleId,
            mileage: mileage,
            previous_mileage: vehicle ? vehicle.mileage : null,
            recorded_by: req.user.id
        }]);
    }

    const updateData = { ...req.body, updated_at: new Date().toISOString() };
    const { error } = await supabase
        .from('vehicles')
        .update(updateData)
        .eq('id', vehicleId);

    if (error) {
        console.error('❌ Supabase Error:', error);
        return res.status(400).json({ error: error.message });
    }
    res.json({ success: true, message: 'Vehicle updated successfully' });
});

app.delete('/api/vehicles/:id', requireAuth, requireAdmin, async (req, res) => {
    const { error } = await supabase.from('vehicles').delete().eq('id', req.params.id);
    if (error) {
        console.error('❌ Supabase Error:', error);
        return res.status(400).json({ error: error.message });
    }
    res.json({ success: true, message: 'Vehicle deleted successfully' });
});

// ============= MAINTENANCE ENDPOINTS =============

app.get('/api/maintenance/vehicle/:vehicle_id', requireAuth, async (req, res) => {
    const { data, error } = await supabase
        .from('maintenance')
        .select('*')
        .eq('vehicle_id', req.params.vehicle_id)
        .order('date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.get('/api/maintenance', requireAuth, async (req, res) => {
    const { data, error } = await supabase
        .from('maintenance')
        .select('*')
        .order('date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/maintenance', requireAuth, async (req, res) => {
    const { vehicle_id, service_type, cost, notes } = req.body;
    const { data, error } = await supabase
        .from('maintenance')
        .insert([{ vehicle_id, service_type, cost: cost || 0, notes: notes || '' }])
        .select()
        .single();

    if (error) {
        console.error('❌ Supabase Error:', error);
        return res.status(400).json({ error: error.message });
    }
    res.status(201).json({ id: data.id, message: 'Maintenance record created' });
});

// ============= PAYMENT ENDPOINTS =============

app.post('/api/payments', requireAuth, async (req, res) => {
    const { vehicle_id, amount } = req.body;
    
    if (!vehicle_id || !amount) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabase
        .from('payments')
        .insert([{ 
            vehicle_id, 
            amount, 
            recorded_by: req.user.id 
        }])
        .select()
        .single();

    if (error) {
        console.error('❌ Supabase Error:', error);
        return res.status(400).json({ error: error.message });
    }
    res.status(201).json({ id: data.id, message: 'Payment recorded successfully' });
});

// ============= RENTAL ENDPOINTS =============

app.get('/api/rental', requireAuth, async (req, res) => {
    const { data, error } = await supabase
        .from('rental')
        .select('*')
        .order('start_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.get('/api/rental/active', requireAuth, async (req, res) => {
    const { data, error } = await supabase
        .from('rental')
        .select('*')
        .eq('status', 'active')
        .order('start_date', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.post('/api/rental', requireAuth, async (req, res) => {
    const { vehicle_id, driver_name, price, notes } = req.body;

    const { data, error } = await supabase
        .from('rental')
        .insert([{ vehicle_id, driver_name, price: price || 0, notes: notes || '' }])
        .select()
        .single();

    if (error) {
        console.error('❌ Supabase Error:', error);
        return res.status(400).json({ error: error.message });
    }

    await supabase.from('vehicles').update({ status: 'rented' }).eq('id', vehicle_id);
    res.status(201).json({ id: data.id, message: 'Rental created successfully' });
});

app.patch('/api/rental/:id/end', requireAuth, async (req, res) => {
    const { data: rental, error: fetchErr } = await supabase
        .from('rental')
        .select('vehicle_id')
        .eq('id', req.params.id)
        .single();

    if (fetchErr) return res.status(500).json({ error: fetchErr.message });

    const { error: updateErr } = await supabase
        .from('rental')
        .update({ status: 'completed', end_date: new Date().toISOString() })
        .eq('id', req.params.id);

    if (updateErr) return res.status(400).json({ error: updateErr.message });

    if (rental) {
        await supabase.from('vehicles').update({ status: 'available' }).eq('id', rental.vehicle_id);
    }
    res.json({ success: true, message: 'Rental completed' });
});

// ============= REPORTS ENDPOINTS =============

app.get('/api/reports/revenue', requireAuth, async (req, res) => {
    // Note: Complex joins are better done via RPC or View in Supabase, 
    // but for now we can do a simplified version or multiple queries.
    // Let's use a simpler approach for the demo.
    const { data: vehicles, error: vErr } = await supabase.from('vehicles').select('id, make, model, license_plate, type');
    if (vErr) return res.status(500).json({ error: vErr.message });

    const reports = await Promise.all(vehicles.map(async (v) => {
        const { data: rentals } = await supabase.from('rental').select('price').eq('vehicle_id', v.id);
        const { data: payments } = await supabase.from('payments').select('amount').eq('vehicle_id', v.id);
        const { data: maintenance } = await supabase.from('maintenance').select('cost').eq('vehicle_id', v.id);
        const { data: mileageLogs } = await supabase.from('mileage_logs').select('mileage').eq('vehicle_id', v.id).order('recorded_at', { ascending: true });
        
        // Calculate distance driven (last recorded mileage minus first recorded mileage)
        let distanceDriven = 0;
        if (mileageLogs && mileageLogs.length > 1) {
            distanceDriven = mileageLogs[mileageLogs.length - 1].mileage - mileageLogs[0].mileage;
        }

        const rentalIncome = rentals?.reduce((sum, r) => sum + (r.price || 0), 0) || 0;
        const paymentIncome = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
        const totalRevenue = rentalIncome + paymentIncome;

        return {
            id: v.id,
            vehicle: `${v.make} ${v.model}`,
            license_plate: v.license_plate,
            type: v.type,
            total_rentals: (rentals?.length || 0) + (payments?.length || 0),
            total_revenue: totalRevenue,
            total_maintenance_cost: maintenance?.reduce((sum, m) => sum + (m.cost || 0), 0) || 0,
            distance_driven: distanceDriven
        };
    }));

    res.json(reports);
});

app.get('/api/reports/fuel', requireAuth, async (req, res) => {
    const { data: vehicles, error: vErr } = await supabase.from('vehicles').select('id, make, model, license_plate');
    if (vErr) return res.status(500).json({ error: vErr.message });

    const reports = await Promise.all(vehicles.map(async (v) => {
        const { data: logs } = await supabase.from('fuel_logs').select('cost, fuel_level').eq('vehicle_id', v.id);
        
        return {
            id: v.id,
            vehicle: `${v.make} ${v.model}`,
            license_plate: v.license_plate,
            fuel_ups: logs?.length || 0,
            total_fuel_cost: logs?.reduce((sum, l) => sum + (l.cost || 0), 0) || 0,
            avg_fuel_level: logs?.length ? logs.reduce((sum, l) => sum + l.fuel_level, 0) / logs.length : 0
        };
    }));

    res.json(reports);
});

app.get('/api/reports/summary', requireAuth, async (req, res) => {
    const { data: vehicles, error } = await supabase.from('vehicles').select('status, id');
    if (error) return res.status(500).json({ error: error.message });

    const { data: rentals } = await supabase.from('rental').select('price');
    const { data: payments } = await supabase.from('payments').select('amount');

    const rentalTotal = rentals?.reduce((sum, r) => sum + (r.price || 0), 0) || 0;
    const paymentTotal = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

    const summary = {
        total_vehicles: vehicles.length,
        available: vehicles.filter(v => v.status === 'available').length,
        active: vehicles.filter(v => v.status === 'active').length,
        rented: vehicles.filter(v => v.status === 'rented').length,
        in_maintenance: vehicles.filter(v => v.status === 'maintenance').length,
        low_fuel: vehicles.filter(v => v.status === 'low_fuel').length,
        gross_revenue: rentalTotal + paymentTotal
    };

    res.json(summary);
});

// ============= ACTIVITY ENDPOINTS =============

app.get('/api/activities', requireAuth, async (req, res) => {
    const { data, error } = await supabase
        .from('fleet_activities')
        .select('*')
        .limit(10);

    if (error) {
        console.error('❌ Supabase Error:', error);
        return res.status(500).json({ error: error.message });
    }
    res.json(data || []);
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString(), cloud: true });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 MAVTAT Motors Cloud API Server`);
    console.log(`📍 Running on http://localhost:${PORT}`);
    console.log(`☁️ Connected to Supabase\n`);
});

// For Vercel Deployment
module.exports = app;
