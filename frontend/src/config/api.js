const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
const isNetlify = hostname.endsWith('.netlify.app');
const isGitHubPages = hostname.endsWith('.github.io');

// Keep fallback host-agnostic so production target is controlled by REACT_APP_API_URL.
const FALLBACK_API_BASE_URL = '/api';

export const DEFAULT_API_BASE_URL = isLocalhost
  ? 'http://localhost:5000/api'
  : isNetlify
    ? process.env.REACT_APP_API_URL || FALLBACK_API_BASE_URL
    : isGitHubPages
      ? process.env.REACT_APP_API_URL || FALLBACK_API_BASE_URL
      : FALLBACK_API_BASE_URL;

export const API_BASE_URL = process.env.REACT_APP_API_URL || DEFAULT_API_BASE_URL;

export const API_SERVER_URL = API_BASE_URL.replace(/\/api\/?$/, '');
