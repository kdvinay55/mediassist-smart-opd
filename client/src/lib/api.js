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
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000 // 60s — Render free tier cold starts take 30-50s
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 and network errors
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    // Provide clear message for network/timeout errors
    if (!error.response) {
      error.message = error.code === 'ECONNABORTED'
        ? 'Server is starting up, please try again in a moment'
        : 'Cannot reach server. Check your internet connection.';
    }
    return Promise.reject(error);
  }
);

export default api;
