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

// In-memory fallback stores (used if database tables are not present)
const inMemoryTrips = [];
const inMemoryClosedBooks = [];
const inMemoryClosedBalanceNotes = {};

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

function requireWriteAccess(req, res, next) {
    if (req.user.role === 'viewer') {
        return res.status(403).json({ error: 'View-only access. You do not have permission to make changes.' });
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

app.post('/api/users', requireAuth, requireAdmin, requireWriteAccess, async (req, res) => {
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
    const { status, type, actual_owner } = req.query;
    let query = supabase.from('vehicles').select('*');

    if (status) query = query.eq('status', status);
    if (type) query = query.eq('type', type);
    if (actual_owner) query = query.eq('actual_owner', actual_owner);

    const { data: vehicles, error } = await query.order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const formattedVehicles = (vehicles || []).map(v => {
        let notes = inMemoryClosedBalanceNotes[v.id];
        if (!notes && v.closed_balance_notes) {
            try {
                notes = typeof v.closed_balance_notes === 'string' ? JSON.parse(v.closed_balance_notes) : v.closed_balance_notes;
            } catch (err) {
                notes = [];
            }
        }
        const lastNote = (notes && notes.length > 0) ? notes[0] : null;
        return {
            ...v,
            closed_balance_notes: notes || [],
            last_closed_balance: lastNote ? lastNote.amount : (v.last_closed_balance ?? null),
            last_closed_period: lastNote ? lastNote.period : (v.last_closed_period ?? null)
        };
    });

    res.json(formattedVehicles);
});

app.get('/api/vehicles/:id', requireAuth, async (req, res) => {
    const { data: vehicle, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('id', req.params.id)
        .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    let notes = inMemoryClosedBalanceNotes[vehicle.id];
    if (!notes && vehicle.closed_balance_notes) {
        try {
            notes = typeof vehicle.closed_balance_notes === 'string' ? JSON.parse(vehicle.closed_balance_notes) : vehicle.closed_balance_notes;
        } catch (err) {
            notes = [];
        }
    }
    const lastNote = (notes && notes.length > 0) ? notes[0] : null;

    res.json({
        ...vehicle,
        closed_balance_notes: notes || [],
        last_closed_balance: lastNote ? lastNote.amount : (vehicle.last_closed_balance ?? null),
        last_closed_period: lastNote ? lastNote.period : (vehicle.last_closed_period ?? null)
    });
});

app.post('/api/vehicles', requireAuth, requireWriteAccess, async (req, res) => {
    const { make, model, license_plate, type, actual_owner } = req.body;

    if (!make || !model || !license_plate || !type) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabase
        .from('vehicles')
        .insert([{ make, model, license_plate, type, mileage: 0, actual_owner: actual_owner || null }])
        .select()
        .single();

    if (error) {
        console.error('❌ Supabase Error:', error);
        return res.status(400).json({ error: error.message });
    }
    res.status(201).json({ id: data.id, message: 'Vehicle created successfully' });
});

app.patch('/api/vehicles/:id', requireAuth, requireWriteAccess, async (req, res) => {
    const vehicleId = req.params.id;
    const { actual_owner, fuel_level, status, make, model, license_plate, type, weekly_cash_in, balance } = req.body;

    // Build update object with only allowed fields
    const updateData = { updated_at: new Date().toISOString() };
    
    if (fuel_level !== undefined) updateData.fuel_level = fuel_level;
    if (status !== undefined) updateData.status = status;
    if (make !== undefined) updateData.make = make;
    if (model !== undefined) updateData.model = model;
    if (license_plate !== undefined) updateData.license_plate = license_plate;
    if (type !== undefined) updateData.type = type;
    if (actual_owner !== undefined) updateData.actual_owner = actual_owner;
    if (weekly_cash_in !== undefined) updateData.weekly_cash_in = weekly_cash_in;
    if (balance !== undefined) updateData.balance = balance;
    
    const { error } = await supabase
        .from('vehicles')
        .update(updateData)
        .eq('id', vehicleId);

    if (error) {
        console.error('❌ Supabase Error:', error.message || error);
        console.error('Update Data:', updateData);
        return res.status(400).json({ error: error.message || 'Update failed' });
    }
    res.json({ success: true, message: 'Vehicle updated successfully' });
});

app.patch('/api/vehicles/:id/financials', requireAuth, requireWriteAccess, async (req, res) => {
    const vehicleId = req.params.id;
    const { weekly_cash_in, balance, expenses, week1, week2, week3, week4 } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (weekly_cash_in !== undefined) updateData.weekly_cash_in = weekly_cash_in;
    if (balance !== undefined) updateData.balance = balance;

    if (Object.keys(updateData).length > 1) {
        const { error: vErr } = await supabase.from('vehicles').update(updateData).eq('id', vehicleId);
        if (vErr) return res.status(400).json({ error: vErr.message });
    }

    // Sync payments if weekly figures are provided
    if (week1 !== undefined || week2 !== undefined || week3 !== undefined || week4 !== undefined) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
        await supabase.from('payments').delete().eq('vehicle_id', vehicleId).gte('date', startOfMonth).lte('date', endOfMonth);
        
        const getPaymentDate = (weekNum) => {
            const d = new Date();
            d.setSeconds(weekNum);
            d.setMilliseconds(0);
            return d.toISOString();
        };

        const paymentsToInsert = [];
        if ((parseFloat(week1) || 0) > 0) paymentsToInsert.push({ vehicle_id: vehicleId, amount: parseFloat(week1), date: getPaymentDate(1), recorded_by: req.user.id });
        if ((parseFloat(week2) || 0) > 0) paymentsToInsert.push({ vehicle_id: vehicleId, amount: parseFloat(week2), date: getPaymentDate(2), recorded_by: req.user.id });
        if ((parseFloat(week3) || 0) > 0) paymentsToInsert.push({ vehicle_id: vehicleId, amount: parseFloat(week3), date: getPaymentDate(3), recorded_by: req.user.id });
        if ((parseFloat(week4) || 0) > 0) paymentsToInsert.push({ vehicle_id: vehicleId, amount: parseFloat(week4), date: getPaymentDate(4), recorded_by: req.user.id });
        if (paymentsToInsert.length > 0) {
            await supabase.from('payments').insert(paymentsToInsert);
        }
    }

    // Sync expenses if provided
    if (expenses !== undefined) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
        await supabase.from('maintenance').delete().eq('vehicle_id', vehicleId).gte('date', startOfMonth).lte('date', endOfMonth);
        const expAmt = parseFloat(expenses) || 0;
        if (expAmt > 0) {
            await supabase.from('maintenance').insert([{ vehicle_id: vehicleId, service_type: 'Total Expenses', cost: expAmt, notes: 'Synced operational expenses', date: new Date().toISOString() }]);
        }
    }

    res.json({ success: true, message: 'Financial figures updated successfully' });
});

app.delete('/api/vehicles/:id', requireAuth, requireAdmin, async (req, res) => {
    const { error } = await supabase.from('vehicles').delete().eq('id', req.params.id);
    if (error) {
        console.error('❌ Supabase Error:', error);
        return res.status(400).json({ error: error.message });
    }
    res.json({ success: true, message: 'Vehicle deleted successfully' });
});

app.get('/api/vehicles/owners/unique', requireAuth, async (req, res) => {
    const { data: vehicles, error } = await supabase
        .from('vehicles')
        .select('actual_owner')
        .not('actual_owner', 'is', null);

    if (error) {
        console.error('❌ Supabase Error:', error);
        return res.status(500).json({ error: error.message });
    }

    // Extract unique owners and sort them
    const uniqueOwners = [...new Set(vehicles.map(v => v.actual_owner).filter(Boolean))].sort();
    res.json(uniqueOwners);
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

app.post('/api/maintenance', requireAuth, requireWriteAccess, async (req, res) => {
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

app.post('/api/payments', requireAuth, requireWriteAccess, async (req, res) => {
    const { vehicle_id, amount, date } = req.body;
    
    if (!vehicle_id || !amount) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const insertPayload = { 
        vehicle_id, 
        amount, 
        recorded_by: req.user.id 
    };
    if (date) insertPayload.date = date;

    const { data, error } = await supabase
        .from('payments')
        .insert([insertPayload])
        .select()
        .single();

    if (error) {
        console.error('❌ Supabase Error:', error);
        return res.status(400).json({ error: error.message });
    }
    res.status(201).json({ id: data.id, message: 'Payment recorded successfully' });
});

// ============= TRIP ENDPOINTS =============

app.get('/api/trips', requireAuth, async (req, res) => {
    const { vehicle_id, month, year } = req.query;
    try {
        let { data, error } = await supabase
            .from('trips')
            .select('*')
            .order('date', { ascending: false });

        if (error) throw error;
        let result = data || [];
        if (vehicle_id) result = result.filter(t => t.vehicle_id == vehicle_id);
        if (month && year) {
            const m = parseInt(month);
            const y = parseInt(year);
            result = result.filter(t => {
                const d = new Date(t.date);
                return d.getMonth() + 1 === m && d.getFullYear() === y;
            });
        }
        return res.json(result);
    } catch (err) {
        let result = [...inMemoryTrips];
        if (vehicle_id) result = result.filter(t => t.vehicle_id == vehicle_id);
        if (month && year) {
            const m = parseInt(month);
            const y = parseInt(year);
            result = result.filter(t => {
                const d = new Date(t.date);
                return d.getMonth() + 1 === m && d.getFullYear() === y;
            });
        }
        return res.json(result);
    }
});

app.post('/api/trips', requireAuth, requireWriteAccess, async (req, res) => {
    const { vehicle_id, amount, date, description } = req.body;

    if (!vehicle_id || amount === undefined || amount === null) {
        return res.status(400).json({ error: 'Missing required fields (vehicle_id, amount)' });
    }

    const tripAmount = parseFloat(amount) || 0;
    const tripDate = date ? new Date(date).toISOString() : new Date().toISOString();
    const tripDesc = description || 'Trip Income';

    const insertPayload = {
        id: 'trip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        vehicle_id,
        amount: tripAmount,
        date: tripDate,
        description: tripDesc,
        recorded_by: req.user.id,
        created_at: new Date().toISOString()
    };

    try {
        const { data, error } = await supabase
            .from('trips')
            .insert([insertPayload])
            .select()
            .single();

        if (error) throw error;
        return res.status(201).json({ success: true, trip: data, message: 'Trip income recorded successfully' });
    } catch (err) {
        inMemoryTrips.unshift(insertPayload);
        return res.status(201).json({ success: true, trip: insertPayload, message: 'Trip income recorded successfully' });
    }
});

app.delete('/api/trips/:id', requireAuth, requireWriteAccess, async (req, res) => {
    const tripId = req.params.id;
    try {
        await supabase.from('trips').delete().eq('id', tripId);
    } catch (err) {}
    const idx = inMemoryTrips.findIndex(t => t.id == tripId);
    if (idx !== -1) inMemoryTrips.splice(idx, 1);

    res.json({ success: true, message: 'Trip record deleted' });
});

// ============= CLOSED BOOKS ENDPOINTS =============

app.get('/api/books/closed', requireAuth, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('closed_books')
            .select('*')
            .order('closed_at', { ascending: false });

        if (error) throw error;
        return res.json(data || inMemoryClosedBooks);
    } catch (err) {
        return res.json(inMemoryClosedBooks);
    }
});

app.get('/api/books/closed/:month/:year', requireAuth, async (req, res) => {
    const targetMonth = parseInt(req.params.month);
    const targetYear = parseInt(req.params.year);

    try {
        const { data, error } = await supabase
            .from('closed_books')
            .select('*')
            .eq('month', targetMonth)
            .eq('year', targetYear)
            .single();

        if (error || !data) throw error || new Error('Not found');
        return res.json(data);
    } catch (err) {
        const found = inMemoryClosedBooks.find(b => b.month === targetMonth && b.year === targetYear);
        if (found) return res.json(found);
        return res.status(404).json({ error: `No closed books record for ${targetMonth}/${targetYear}` });
    }
});

app.post('/api/books/close', requireAuth, requireWriteAccess, async (req, res) => {
    const now = new Date();
    const month = parseInt(req.body.month) || (now.getMonth() + 1);
    const year = parseInt(req.body.year) || now.getFullYear();

    const { data: vehicles } = await supabase.from('vehicles').select('*');
    if (!vehicles || vehicles.length === 0) {
        return res.status(400).json({ error: 'No vehicles found to close books for' });
    }

    const isInTargetPeriod = (dateStr) => {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return false;
        return (d.getMonth() + 1) === month && d.getFullYear() === year;
    };

    let allTrips = [];
    try {
        const { data: dbTrips } = await supabase.from('trips').select('*');
        allTrips = dbTrips || [];
    } catch (e) {}
    allTrips = [...allTrips, ...inMemoryTrips];

    const reportsData = await Promise.all(vehicles.map(async (v) => {
        const { data: rentals } = await supabase.from('rental').select('price, start_date').eq('vehicle_id', v.id);
        const { data: payments } = await supabase.from('payments').select('amount, date').eq('vehicle_id', v.id);
        const { data: maintenance } = await supabase.from('maintenance').select('cost, service_type, notes, date').eq('vehicle_id', v.id).order('date', { ascending: false });

        const filteredRentals = (rentals || []).filter(r => isInTargetPeriod(r.start_date));
        const filteredPayments = (payments || []).filter(p => isInTargetPeriod(p.date));
        const filteredMaintenance = (maintenance || []).filter(m => isInTargetPeriod(m.date));
        const filteredTrips = allTrips.filter(t => t.vehicle_id == v.id && isInTargetPeriod(t.date));

        const rentalIncome = filteredRentals.reduce((sum, r) => sum + (r.price || 0), 0);
        const paymentIncome = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const tripIncome = filteredTrips.reduce((sum, t) => sum + (t.amount || 0), 0);
        const totalRevenue = rentalIncome + paymentIncome + tripIncome;

        let week1 = 0, week2 = 0, week3 = 0, week4 = 0;
        filteredPayments.forEach(p => {
            const amt = p.amount || 0;
            const pDate = p.date ? new Date(p.date) : null;
            let weekNum = pDate ? pDate.getSeconds() : 1;
            if (weekNum < 1 || weekNum > 4) {
                const day = pDate ? pDate.getDate() : 1;
                if (day <= 7) weekNum = 1;
                else if (day <= 14) weekNum = 2;
                else if (day <= 21) weekNum = 3;
                else weekNum = 4;
            }
            if (weekNum === 1) week1 += amt;
            else if (weekNum === 2) week2 += amt;
            else if (weekNum === 3) week3 += amt;
            else week4 += amt;
        });

        const totalExpenses = filteredMaintenance.reduce((sum, m) => sum + (m.cost || 0), 0);

        return {
            id: v.id,
            vehicle: `${v.make} ${v.model}`,
            license_plate: v.license_plate,
            type: v.type,
            actual_owner: v.actual_owner || 'N/A',
            weekly_cash_in: v.weekly_cash_in || 0,
            balance: v.balance || 0,
            total_rentals: filteredRentals.length + filteredPayments.length,
            rental_income: rentalIncome,
            payment_income: paymentIncome,
            trip_income: tripIncome,
            trips: filteredTrips,
            total_revenue: totalRevenue,
            week1, week2, week3, week4,
            total_maintenance_cost: totalExpenses,
            expense_descriptions: filteredMaintenance,
            net_profit: totalRevenue - totalExpenses
        };
    }));

    const totalRev = reportsData.reduce((s, r) => s + r.total_revenue, 0);
    const totalExp = reportsData.reduce((s, r) => s + r.total_maintenance_cost, 0);
    const totalBal = reportsData.reduce((s, r) => s + r.balance, 0);

    const snapshot = {
        id: 'cb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        month,
        year,
        closed_at: new Date().toISOString(),
        closed_by: req.user.username || 'admin',
        summary: {
            total_revenue: totalRev,
            total_expenses: totalExp,
            net_profit: totalRev - totalExp,
            total_balance: totalBal,
            vehicle_count: vehicles.length
        },
        reports: reportsData
    };

    try {
        const { error } = await supabase.from('closed_books').insert([snapshot]);
        if (error) throw error;
    } catch (e) {
        const existingIdx = inMemoryClosedBooks.findIndex(b => b.month === month && b.year === year);
        if (existingIdx !== -1) inMemoryClosedBooks.splice(existingIdx, 1);
        inMemoryClosedBooks.unshift(snapshot);
    }

    // Reset vehicle balances to 0 for the new month & record remaining balance notes for vehicles with outstanding balance
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const periodStr = `${monthNames[month - 1]} ${year}`;
    const updatedVehicleList = [];

    for (const v of vehicles) {
        const activeBal = parseFloat(v.balance) || 0;
        let existingNotes = inMemoryClosedBalanceNotes[v.id] || [];
        if (existingNotes.length === 0 && v.closed_balance_notes) {
            try {
                existingNotes = typeof v.closed_balance_notes === 'string' ? JSON.parse(v.closed_balance_notes) : v.closed_balance_notes;
            } catch (err) {
                existingNotes = [];
            }
        }

        let newLastClosedBal = v.last_closed_balance;
        let newLastClosedPeriod = v.last_closed_period;

        if (activeBal !== 0) {
            const formattedAmt = activeBal > 0 ? `$${activeBal.toFixed(2)}` : `-$${Math.abs(activeBal).toFixed(2)}`;
            const noteObj = {
                id: 'cbn_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                period: periodStr,
                amount: activeBal,
                text: `Closed balance for ${periodStr}: ${formattedAmt}`,
                date: new Date().toISOString()
            };
            existingNotes = [noteObj, ...existingNotes];
            newLastClosedBal = activeBal;
            newLastClosedPeriod = periodStr;
        }

        inMemoryClosedBalanceNotes[v.id] = existingNotes;

        const updateData = {
            balance: 0,
            last_closed_balance: newLastClosedBal,
            last_closed_period: newLastClosedPeriod || periodStr,
            closed_balance_notes: JSON.stringify(existingNotes),
            updated_at: new Date().toISOString()
        };

        try {
            const { error: updateErr } = await supabase.from('vehicles').update(updateData).eq('id', v.id);
            if (updateErr) {
                // Fallback to updating just balance if custom columns do not exist in DB schema
                await supabase.from('vehicles').update({ balance: 0, updated_at: new Date().toISOString() }).eq('id', v.id);
            }
        } catch (e) {
            console.error(`Failed DB balance reset for vehicle ${v.id}:`, e);
        }

        updatedVehicleList.push({
            id: v.id,
            balance: 0,
            last_closed_balance: newLastClosedBal,
            last_closed_period: newLastClosedPeriod,
            closed_balance_notes: existingNotes
        });
    }

    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    res.json({
        success: true,
        message: `Books for ${periodStr} closed and archived successfully! Vehicle balances reset to $0.00 with remaining balances recorded as notes. Starting new month (${nextMonth}/${nextYear}).`,
        snapshot,
        nextMonth,
        nextYear,
        updatedVehicles: updatedVehicleList
    });
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
    const monthParam = req.query.month;
    const yearParam = req.query.year;
    const isAllTime = monthParam === 'all';
    const targetMonth = isAllTime ? null : (parseInt(monthParam) || (new Date().getMonth() + 1));
    const targetYear = isAllTime ? null : (parseInt(yearParam) || new Date().getFullYear());

    // First check if closed books exist for this exact month/year
    if (!isAllTime && targetMonth && targetYear) {
        let closedRecord = null;
        try {
            const { data } = await supabase
                .from('closed_books')
                .select('*')
                .eq('month', targetMonth)
                .eq('year', targetYear)
                .single();
            closedRecord = data;
        } catch (e) {}

        if (!closedRecord) {
            closedRecord = inMemoryClosedBooks.find(b => b.month === targetMonth && b.year === targetYear);
        }

        if (closedRecord && closedRecord.reports) {
            return res.json(closedRecord.reports);
        }
    }

    const { data: vehicles, error: vErr } = await supabase.from('vehicles').select('id, make, model, license_plate, type, balance, actual_owner, weekly_cash_in');
    if (vErr) return res.status(500).json({ error: vErr.message });

    const isInTargetPeriod = (dateStr) => {
        if (isAllTime) return true;
        if (!dateStr) return targetMonth === (new Date().getMonth() + 1) && targetYear === new Date().getFullYear();
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return targetMonth === (new Date().getMonth() + 1) && targetYear === new Date().getFullYear();
        return (d.getMonth() + 1) === targetMonth && d.getFullYear() === targetYear;
    };

    let allTrips = [];
    try {
        const { data: dbTrips } = await supabase.from('trips').select('*');
        allTrips = dbTrips || [];
    } catch (e) {}
    allTrips = [...allTrips, ...inMemoryTrips];

    const reports = await Promise.all(vehicles.map(async (v) => {
        const { data: rentals } = await supabase.from('rental').select('price, start_date').eq('vehicle_id', v.id);
        const { data: payments } = await supabase.from('payments').select('amount, date').eq('vehicle_id', v.id);
        const { data: maintenance } = await supabase.from('maintenance').select('cost, service_type, notes, date').eq('vehicle_id', v.id).order('date', { ascending: false });

        const filteredRentals = (rentals || []).filter(r => isInTargetPeriod(r.start_date));
        const filteredPayments = (payments || []).filter(p => isInTargetPeriod(p.date));
        const filteredMaintenance = (maintenance || []).filter(m => isInTargetPeriod(m.date));
        const filteredTrips = allTrips.filter(t => t.vehicle_id == v.id && isInTargetPeriod(t.date));

        const rentalIncome = filteredRentals.reduce((sum, r) => sum + (r.price || 0), 0);
        const paymentIncome = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const tripIncome = filteredTrips.reduce((sum, t) => sum + (t.amount || 0), 0);
        const totalRevenue = rentalIncome + paymentIncome + tripIncome;

        let week1 = 0, week2 = 0, week3 = 0, week4 = 0;
        filteredPayments.forEach(p => {
            const amt = p.amount || 0;
            const pDate = p.date ? new Date(p.date) : null;
            let weekNum = pDate ? pDate.getSeconds() : 1;
            if (weekNum < 1 || weekNum > 4) {
                const day = pDate ? pDate.getDate() : 1;
                if (day <= 7) weekNum = 1;
                else if (day <= 14) weekNum = 2;
                else if (day <= 21) weekNum = 3;
                else weekNum = 4;
            }
            if (weekNum === 1) week1 += amt;
            else if (weekNum === 2) week2 += amt;
            else if (weekNum === 3) week3 += amt;
            else week4 += amt;
        });

        return {
            id: v.id,
            vehicle: `${v.make} ${v.model}`,
            license_plate: v.license_plate,
            type: v.type,
            actual_owner: v.actual_owner || 'N/A',
            weekly_cash_in: v.weekly_cash_in || 0,
            balance: v.balance || 0,
            total_rentals: filteredRentals.length + filteredPayments.length,
            rental_income: rentalIncome,
            payment_income: paymentIncome,
            trip_income: tripIncome,
            trips: filteredTrips,
            total_revenue: totalRevenue,
            week1,
            week2,
            week3,
            week4,
            total_maintenance_cost: filteredMaintenance.reduce((sum, m) => sum + (m.cost || 0), 0),
            expense_descriptions: filteredMaintenance
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
const server = app.listen(PORT, () => {
    console.log(`\n🚀 MAVTAT Motors Cloud API Server`);
    console.log(`📍 Running on http://localhost:${PORT}`);
    console.log(`☁️ Connected to Supabase\n`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        const nextPort = Number(PORT) + 1;
        console.log(`⚠️ Port ${PORT} is busy, trying ${nextPort}...`);
        app.listen(nextPort, () => {
            console.log(`📍 Running on http://localhost:${nextPort}`);
        });
    } else {
        console.error('Server error:', err);
    }
});

// For Vercel Deployment
module.exports = app;
