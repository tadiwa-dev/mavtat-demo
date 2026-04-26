/**
 * MAVTAT Motors - API Client
 * Wrapper for all backend API calls from the frontend
 */

const API_BASE_URL = '/api';

// Authentication state helpers
const getAuthHeaders = () => {
    const sessionId = localStorage.getItem('sessionId');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionId}`
    };
};

const API = {
    auth: {
        login: async (username, password) => {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            if (!response.ok) throw new Error('Invalid credentials');
            const data = await response.json();
            localStorage.setItem('sessionId', data.sessionId);
            return data;
        },
        logout: async () => {
            await fetch(`${API_BASE_URL}/auth/logout`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            localStorage.removeItem('sessionId');
        },
        me: async () => {
            const response = await fetch(`${API_BASE_URL}/auth/me`, {
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Not authenticated');
            return response.json();
        }
    },

    users: {
        list: async () => {
            const response = await fetch(`${API_BASE_URL}/users`, {
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch users');
            return response.json();
        },
        create: async (userData) => {
            const response = await fetch(`${API_BASE_URL}/users`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(userData)
            });
            if (!response.ok) throw new Error('Failed to create user');
            return response.json();
        },
        delete: async (id) => {
            const response = await fetch(`${API_BASE_URL}/users/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to delete user');
            return response.json();
        }
    },

    vehicles: {
        list: async (filters = {}) => {
            const query = new URLSearchParams(filters).toString();
            const response = await fetch(`${API_BASE_URL}/vehicles${query ? '?' + query : ''}`, {
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch vehicles');
            return response.json();
        },
        get: async (id) => {
            const response = await fetch(`${API_BASE_URL}/vehicles/${id}`, {
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch vehicle');
            return response.json();
        },
        create: async (vehicleData) => {
            const response = await fetch(`${API_BASE_URL}/vehicles`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(vehicleData)
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to create vehicle');
            }
            return response.json();
        },
        update: async (id, vehicleData) => {
            const response = await fetch(`${API_BASE_URL}/vehicles/${id}`, {
                method: 'PATCH',
                headers: getAuthHeaders(),
                body: JSON.stringify(vehicleData)
            });
            if (!response.ok) throw new Error('Failed to update vehicle');
            return response.json();
        },
        delete: async (id) => {
            const response = await fetch(`${API_BASE_URL}/vehicles/${id}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to delete vehicle');
            return response.json();
        },
        updateStatus: async (id, status) => {
            return API.vehicles.update(id, { status });
        },
        updateMileage: async (id, mileage) => {
            return API.vehicles.update(id, { mileage });
        },
        updateFuel: async (id, fuel_level) => {
            return API.vehicles.update(id, { fuel_level });
        }
    },

    payments: {
        create: async (data) => {
            const response = await fetch(`${API_BASE_URL}/payments`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to record payment');
            }
            return await response.json();
        }
    },

    activities: {
        list: async () => {
            const response = await fetch(`${API_BASE_URL}/activities`, {
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch activities');
            return response.json();
        }
    },

    maintenance: {
        list: async (vehicleId = null) => {
            const url = vehicleId ? `${API_BASE_URL}/maintenance/vehicle/${vehicleId}` : `${API_BASE_URL}/maintenance`;
            const response = await fetch(url, {
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch maintenance records');
            return response.json();
        },
        create: async (maintenanceData) => {
            const response = await fetch(`${API_BASE_URL}/maintenance`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(maintenanceData)
            });
            if (!response.ok) throw new Error('Failed to create maintenance record');
            return response.json();
        }
    },

    rental: {
        list: async (activeOnly = false) => {
            const url = activeOnly ? `${API_BASE_URL}/rental/active` : `${API_BASE_URL}/rental`;
            const response = await fetch(url, {
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch rental records');
            return response.json();
        },
        create: async (rentalData) => {
            const response = await fetch(`${API_BASE_URL}/rental`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(rentalData)
            });
            if (!response.ok) throw new Error('Failed to create rental');
            return response.json();
        },
        end: async (id) => {
            const response = await fetch(`${API_BASE_URL}/rental/${id}/end`, {
                method: 'PATCH',
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to end rental');
            return response.json();
        }
    },

    reports: {
        revenue: async () => {
            const response = await fetch(`${API_BASE_URL}/reports/revenue`, {
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch revenue report');
            return response.json();
        },
        fuel: async () => {
            const response = await fetch(`${API_BASE_URL}/reports/fuel`, {
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch fuel report');
            return response.json();
        },
        summary: async () => {
            const response = await fetch(`${API_BASE_URL}/reports/summary`, {
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch fleet summary');
            return response.json();
        }
    }
};
