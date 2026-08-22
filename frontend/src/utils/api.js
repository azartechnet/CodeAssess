const API_BASE =
  import.meta.env.VITE_API_BASE ||
  'http://localhost:5000';

export const apiFetch = async (endpoint, options = {}) => {
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
};

export default API_BASE;