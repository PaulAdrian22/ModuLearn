const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';

const LOCAL_HOST_PATTERN = /^(?:localhost|127(?:\.\d{1,3}){3}|::1|0\.0\.0\.0|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/;
const LOCAL_API_URL_PATTERN = /^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i;
const isLocalhost = LOCAL_HOST_PATTERN.test(String(hostname || '').toLowerCase());
const isNetlify = hostname.endsWith('.netlify.app');

const localApiHost = hostname && hostname !== '0.0.0.0' ? hostname : 'localhost';
const envApiBaseUrl = String(process.env.REACT_APP_API_URL || '').trim();
const hasEnvApiBaseUrl = envApiBaseUrl.length > 0;
const isEnvApiLocal = LOCAL_API_URL_PATTERN.test(envApiBaseUrl);
const hostedEnvApiBaseUrl = hasEnvApiBaseUrl && !isEnvApiLocal ? envApiBaseUrl : '';

// Keep fallback host-agnostic so production target is controlled by REACT_APP_API_URL.
const FALLBACK_API_BASE_URL = '/api';
const NETLIFY_API_BASE_URL = 'https://modulearn-api-260412162638.azurewebsites.net/api';

export const DEFAULT_API_BASE_URL = isLocalhost
  ? `${protocol}//${localApiHost}:5000/api`
  : isNetlify
    ? hostedEnvApiBaseUrl || NETLIFY_API_BASE_URL
    : hostedEnvApiBaseUrl || FALLBACK_API_BASE_URL;

// Only allow raw env override while developing on localhost.
export const API_BASE_URL = isLocalhost && hasEnvApiBaseUrl
  ? envApiBaseUrl
  : DEFAULT_API_BASE_URL;

export const API_SERVER_URL = API_BASE_URL.replace(/\/api\/?$/, '');
