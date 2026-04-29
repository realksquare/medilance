// Central API base URL.
// In production (Vercel), set VITE_API_URL to your Render backend URL.
// In development, falls back to localhost:3005.
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005';

export default API_BASE;
