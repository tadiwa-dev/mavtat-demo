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
        // Load vehicles from API
        const vehiclesData = await API.vehicles.list();
        const reportsData = await API.reports.revenue();
        const summaryData = await API.reports.summary();

        // Transform API data to match app's expected format
        app.state.vehicles = vehiclesData.map(v => ({
            id: v.id,
            name: `${v.make} ${v.model}`, // Combine make and model
            plate: v.license_plate,
            type: v.type.charAt(0).toUpperCase() + v.type.slice(1), // Capitalize
            mileage: v.mileage || 0,
            fuel: v.fuel_level || 100,
            status: v.status.charAt(0).toUpperCase() + v.status.replace(/_/g, ' ').slice(1), // Capitalize and replace underscores
            rev: 0, // Will be calculated from reports
            expenses: 0, // Will be calculated from maintenance
            // Add cash-in tracking for taxis and rentals
            weeklyCashIn: v.weekly_cash_in || 0,
            balance: v.balance || 0
        }));

        // Merge revenue and mileage data
        reportsData.forEach(report => {
            const vehicle = app.state.vehicles.find(v => v.id == report.id);
            if (vehicle) {
                vehicle.rev = report.total_revenue || 0;
                vehicle.expenses = report.total_maintenance_cost || 0;
                vehicle.distanceDriven = report.distance_driven || 0;
            }
        });
        
        // Load activities from cloud
        const activitiesData = await API.activities.list();
        app.state.activities = activitiesData.map(a => ({
            time: this.formatTime(a.recorded_at),
            car: a.car,
            type: a.description,
            status: 'Completed'
        }));

        console.log('✅ Data loaded successfully:', app.state.vehicles.length, 'vehicles');

    } catch (error) {
        console.error('❌ Failed to load data:', error);
        // Fall back to existing data if API fails
        console.log('📦 Using fallback demo data...');
    }

    // Call the original init
    this.applySidebarState();
    this.navigate('dashboard');
    this.renderAll();
};

// Helper for relative time formatting
app.formatTime = function(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just Now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
};

// Override addVehicle to save to backend
const originalAddVehicle = app.addVehicle;
app.addVehicle = async function(e) {
    e.preventDefault();
    const make = document.getElementById('v-name').value.split(' ')[0];
    const model = document.getElementById('v-name').value.split(' ').slice(1).join(' ') || 'Unknown';
    const license_plate = document.getElementById('v-plate').value.toUpperCase();
    const type = document.getElementById('v-type').value.toLowerCase();
    const mileage = parseInt(document.getElementById('v-mileage').value);

    try {
        // Save to backend
        const result = await API.vehicles.create({
            make,
            model: model || 'Unknown',
            license_plate,
            type,
            mileage
        });

        // Reload vehicles
        const vehiclesData = await API.vehicles.list();
        app.state.vehicles = vehiclesData.map(v => ({
            id: v.id,
            name: `${v.make} ${v.model}`,
            plate: v.license_plate,
            type: v.type.charAt(0).toUpperCase() + v.type.slice(1),
            mileage: v.mileage || 0,
            fuel: v.fuel_level || 100,
            status: v.status.charAt(0).toUpperCase() + v.status.replace(/_/g, ' ').slice(1),
            rev: 0,
            expenses: 0,
            ...(v.type === 'taxi' || v.type === 'rental' ? { weeklyCashIn: 0, balance: 0 } : {})
        }));

        this.closeModal('modal-add-vehicle');
        this.renderAll();
        this.showToast(`${make} ${model} added to registry.`);
    } catch (error) {
        console.error('Error adding vehicle:', error);
        this.showToast('Failed to add vehicle: ' + error.message);
    }
};

// Override saveMileage to save to backend
const originalSaveMileage = app.saveMileage;
app.saveMileage = async function(e) {
    e.preventDefault();
    const id = document.getElementById('um-id').value;
    const vehicle = this.state.vehicles.find(v => v.id == id);
    const newMileage = parseInt(document.getElementById('um-new').value);

    if (newMileage <= vehicle.mileage) {
        document.getElementById('um-error').classList.remove('hidden');
        return;
    }

    try {
        // Update backend
        await API.vehicles.updateMileage(id, newMileage);
        
        // Update local state
        vehicle.mileage = newMileage;
        
        this.state.activities.unshift({
            time: 'Just Now', car: vehicle.plate, type: 'Mileage Updated', status: 'Completed'
        });

        this.closeModal('modal-update-mileage');
        this.renderRegistry();
        this.showToast(`Mileage updated for ${vehicle.plate}.`);
    } catch (error) {
        console.error('Error updating mileage:', error);
        this.showToast('Failed to update mileage: ' + error.message);
    }
};

// Override saveStatus to save to backend
const originalSaveStatus = app.saveStatus;
app.saveStatus = async function(e) {
    e.preventDefault();
    const id = document.getElementById('us-id').value;
    const vehicle = this.state.vehicles.find(v => v.id == id);
    const newStatus = document.getElementById('us-new').value;

    try {
        // Map display status to API status
        const statusMap = {
            'Available': 'available',
            'Active': 'active',
            'Rented': 'rented',
            'Maintenance': 'maintenance',
            'Low Fuel': 'low_fuel',
            'Inactive': 'inactive'
        };

        // Update backend
        await API.vehicles.updateStatus(id, statusMap[newStatus] || newStatus.toLowerCase());
        
        // Update local state
        const oldStatus = vehicle.status;
        vehicle.status = newStatus;
        
        this.state.activities.unshift({
            time: 'Just Now', car: vehicle.plate, type: `Status Changed: ${oldStatus} → ${newStatus}`, status: 'Completed'
        });

        this.closeModal('modal-update-status');
        this.renderRegistry();
        this.renderDashboard();
        this.showToast(`Status updated to "${newStatus}" for ${vehicle.plate}.`);
    } catch (error) {
        console.error('Error updating status:', error);
        this.showToast('Failed to update status: ' + error.message);
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
