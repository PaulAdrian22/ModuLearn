const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const DEFAULT_API_BASE_URL = isLocalhost
  ? 'http://localhost:5000/api'
  : 'https://modulearn-api-production.up.railway.app/api';

export const API_BASE_URL = process.env.REACT_APP_API_URL || DEFAULT_API_BASE_URL;

export const API_SERVER_URL = API_BASE_URL.replace(/\/api\/?$/, '');
