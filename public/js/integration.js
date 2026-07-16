/**
 * MAVTAT Motors - Frontend Integration
 * This script integrates the backend API with the existing app
 * Load this AFTER api-client.js and BEFORE the app initializes
 */

// Override app.init() to load data from backend
const originalInit = app.init;
app.init = async function() {
    console.log('🔄 Checking authentication...');
    
    // Check authentication first
    await this.checkAuth();
    
    if (!this.state.isLoggedIn) {
        // Don't load data if not authenticated
        return;
    }

    console.log('🔄 Loading data from backend...');
    
    try {
        // Load data in parallel for speed
        const [vehiclesData, reportsData, activitiesData] = await Promise.all([
            API.vehicles.list(),
            API.reports.revenue(),
            API.activities.list()
        ]);

        // Transform API data to match app's expected format
        app.state.vehicles = vehiclesData.map(v => ({
            id: v.id,
            name: `${v.make} ${v.model}`, // Combine make and model
            plate: v.license_plate,
            type: v.type.charAt(0).toUpperCase() + v.type.slice(1), // Capitalize
            mileage: 0,
            fuel: v.fuel_level || 100,
            status: v.status.charAt(0).toUpperCase() + v.status.replace(/_/g, ' ').slice(1), // Capitalize and replace underscores
            actual_owner: v.actual_owner || 'N/A',
            rev: 0, // Will be calculated from reports
            expenses: 0, // Will be calculated from maintenance
            expense_descriptions: [],
            week1: 0,
            week2: 0,
            week3: 0,
            week4: 0,
            // Add cash-in tracking for taxis and rentals
            weeklyCashIn: v.weekly_cash_in || 0,
            balance: v.balance || 0
        }));

        // Merge revenue data
        reportsData.forEach(report => {
            const vehicle = app.state.vehicles.find(v => v.id == report.id);
            if (vehicle) {
                vehicle.rev = report.total_revenue || 0;
                vehicle.expenses = report.total_maintenance_cost || 0;
                vehicle.expense_descriptions = report.expense_descriptions || [];
                if (vehicle.expenses > 0 && (!vehicle.expense_descriptions || vehicle.expense_descriptions.length === 0)) {
                    vehicle.expense_descriptions = [{
                        service_type: 'Operational Expense',
                        cost: vehicle.expenses,
                        notes: 'General operational expenses',
                        date: new Date().toISOString()
                    }];
                }
                vehicle.week1 = report.week1 || 0;
                vehicle.week2 = report.week2 || 0;
                vehicle.week3 = report.week3 || 0;
                vehicle.week4 = report.week4 || 0;
            }
        });
        
        // Load activities from cloud
        app.state.activities = activitiesData.map(a => ({
            time: this.formatTime(a.recorded_at),
            recorded_at: a.recorded_at,
            car: a.car,
            type: a.description,
            status: 'Completed'
        }));

        console.log('✅ Data loaded successfully:', app.state.vehicles.length, 'vehicles');

    } catch (error) {
        console.error('❌ Failed to load data:', error);
        // Fall back to existing data if API fails
        console.log('📦 Using fallback demo data...');
        if (!app.state.vehicles || app.state.vehicles.length === 0) {
            app.state.vehicles = [
                {
                    id: 'demo-1',
                    name: 'Toyota Corolla',
                    plate: 'ABG 4521',
                    type: 'Taxi',
                    mileage: 45200,
                    fuel: 85,
                    status: 'Active',
                    actual_owner: 'John Smith',
                    rev: 450,
                    expenses: 65,
                    expense_descriptions: [
                        { service_type: 'Operational Expense', cost: 65, notes: 'Engine oil change & top-up', date: new Date().toISOString() }
                    ],
                    week1: 120, week2: 110, week3: 110, week4: 110,
                    weeklyCashIn: 150, balance: 30
                },
                {
                    id: 'demo-2',
                    name: 'Nissan NV350',
                    plate: 'ADX 8892',
                    type: 'Rental',
                    mileage: 82100,
                    fuel: 60,
                    status: 'Available',
                    actual_owner: 'MAVTAT Fleet',
                    rev: 620,
                    expenses: 150,
                    expense_descriptions: [
                        { service_type: 'Operational Expense', cost: 120, notes: 'Brake pad replacement & wheel alignment', date: new Date().toISOString() },
                        { service_type: 'Operational Expense', cost: 30, notes: 'Car wash and detailing', date: new Date().toISOString() }
                    ],
                    week1: 150, week2: 160, week3: 150, week4: 160,
                    weeklyCashIn: 200, balance: 80
                },
                {
                    id: 'demo-3',
                    name: 'Honda Fit',
                    plate: 'ACJ 3319',
                    type: 'Taxi',
                    mileage: 61400,
                    fuel: 40,
                    status: 'Maintenance',
                    actual_owner: 'Grace Moyo',
                    rev: 280,
                    expenses: 210,
                    expense_descriptions: [
                        { service_type: 'Operational Expense', cost: 180, notes: 'New battery installation', date: new Date().toISOString() },
                        { service_type: 'Operational Expense', cost: 30, notes: 'Spark plug replacement', date: new Date().toISOString() }
                    ],
                    week1: 90, week2: 95, week3: 95, week4: 0,
                    weeklyCashIn: 120, balance: -40
                }
            ];
        }
    }

    // Call the original init
    this.applySidebarState();
    this.navigate('dashboard');
    this.renderAll();
    if (this.state.isLoggedIn) {
        this.startWalkthroughIfFirstTime();
        this.loadUniqueOwners();
        this.startActivityTimer();
    }
};

// Helper for relative time formatting
app.formatTime = function(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < -1) return date.toLocaleDateString();
    if (diffMins < 1) return 'Just Now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
};

// Override addVehicle to save to backend (Optimistic UI)
const originalAddVehicle = app.addVehicle;
app.addVehicle = async function(e) {
    e.preventDefault();
    const make = document.getElementById('v-name').value.split(' ')[0];
    const model = document.getElementById('v-name').value.split(' ').slice(1).join(' ') || 'Unknown';
    const license_plate = document.getElementById('v-plate').value.toUpperCase();
    const type = document.getElementById('v-type').value.toLowerCase();
    const actual_owner = document.getElementById('v-actual-owner').value.trim() || null;
    const tempId = 'temp_' + Date.now();

    // Optimistic insert
    const newVeh = {
        id: tempId,
        name: `${make} ${model}`,
        plate: license_plate,
        type: type.charAt(0).toUpperCase() + type.slice(1),
        mileage: 0,
        fuel: 100,
        status: 'Available',
        actual_owner: actual_owner || 'N/A',
        rev: 0,
        expenses: 0,
        expense_descriptions: [],
        week1: 0, week2: 0, week3: 0, week4: 0,
        ...(type === 'taxi' || type === 'rental' ? { weeklyCashIn: 0, balance: 0 } : {})
    };
    app.state.vehicles.unshift(newVeh);
    this.closeModal('modal-add-vehicle');
    this.renderAll();
    this.loadUniqueOwners();
    this.showToast(`${make} ${model} added to registry.`);

    try {
        const result = await API.vehicles.create({
            make,
            model: model || 'Unknown',
            license_plate,
            type,
            mileage: 0,
            actual_owner
        });
        newVeh.id = result.id;
    } catch (error) {
        console.error('Error adding vehicle:', error);
        app.state.vehicles = app.state.vehicles.filter(v => v.id !== tempId);
        this.renderAll();
        this.showToast('Failed to sync new vehicle: ' + error.message);
    }
};



// Override saveStatus to save to backend (Optimistic UI)
const originalSaveStatus = app.saveStatus;
app.saveStatus = async function(e) {
    e.preventDefault();
    const id = document.getElementById('us-id').value;
    const vehicle = this.state.vehicles.find(v => v.id == id);
    const newStatus = document.getElementById('us-new').value;

    const oldStatus = vehicle.status;
    vehicle.status = newStatus;
    
    this.state.activities.unshift({
        time: 'Just Now', car: vehicle.plate, type: `Status Changed: ${oldStatus} → ${newStatus}`, status: 'Completed'
    });

    this.closeModal('modal-update-status');
    this.renderRegistry();
    this.renderDashboard();
    this.showToast(`Status updated to "${newStatus}" for ${vehicle.plate}.`);

    try {
        const statusMap = {
            'Available': 'available',
            'Active': 'active',
            'Rented': 'rented',
            'Maintenance': 'maintenance',
            'Low Fuel': 'low_fuel',
            'Inactive': 'inactive'
        };
        await API.vehicles.updateStatus(id, statusMap[newStatus] || newStatus.toLowerCase());
    } catch (error) {
        console.error('Error updating status:', error);
        vehicle.status = oldStatus;
        this.renderRegistry();
        this.showToast('Failed to sync status: ' + error.message);
    }
};

console.log('✅ API Integration loaded. App will use backend on init.');

// Authentication event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            await app.login(username, password);
        });
    }

    // Add user form
    const addUserForm = document.getElementById('add-user-form');
    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(addUserForm);
            const userData = {
                username: formData.get('username'),
                password: formData.get('password'),
                role: formData.get('role')
            };
            await app.createUser(userData);
        });
    }

    // User modal open handler
    document.addEventListener('click', (e) => {
        if (e.target.closest('[onclick*="user-modal"]')) {
            app.loadUsers();
        }
    });

    // Activity tracking for session timeout
    let activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    activityEvents.forEach(event => {
        document.addEventListener(event, () => {
            if (app.state.isLoggedIn) {
                app.startSessionTimer();
            }
        }, true);
    });
});
