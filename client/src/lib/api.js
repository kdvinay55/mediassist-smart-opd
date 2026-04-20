import axios from 'axios';

// In production: use VITE_API_URL for the mobile app, or '/api' for the web dashboard
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

export function buildApiUrl(path = '') {
  if (!path) {
    return BASE_URL;
  }
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getStoredAuthToken() {
  return localStorage.getItem('token');
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' }
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
