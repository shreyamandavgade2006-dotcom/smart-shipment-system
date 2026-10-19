import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 30000 });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('smartship_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    if (err.response?.status === 401 && !url.includes('/auth/')) {
      localStorage.removeItem('smartship_token');
      localStorage.removeItem('smartship_user');
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Consistent, human-readable error message from any API failure.
export const errMsg = (err, fallback = 'Something went wrong. Please try again.') =>
  err?.response?.data?.message || err?.message || fallback;

export default api;
