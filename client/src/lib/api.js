import axios from 'axios';

// Detect Capacitor (Android/iOS native shell) — relative '/api' won't work there
// because the app is served from capacitor://localhost / https://localhost.
const isCapacitor = typeof window !== 'undefined'
  && (window.Capacitor?.isNativePlatform?.()
    || /(?:^capacitor:|^https?:\/\/localhost($|[/:?#]))/i.test(window.location.origin || ''));

const REMOTE_API_URL = 'https://mediassist-api.onrender.com';

// Priority:
//   1. VITE_API_URL (explicit override at build time)
//   2. Capacitor native shell -> always hit Render directly
//   3. Web dashboard -> '/api' (Vercel rewrite proxies to Render)
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : isCapacitor
    ? `${REMOTE_API_URL}/api`
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
