const isProduction = process.env.NODE_ENV === 'production';

const parseNonNegativeInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
};

const cacheTtlSeconds = parseNonNegativeInt(
  process.env.API_CACHE_TTL_SECONDS,
  isProduction ? 120 : 0
);
const cacheMaxEntries = Math.max(
  10,
  parseNonNegativeInt(process.env.API_CACHE_MAX_ENTRIES, isProduction ? 500 : 100)
);

const cache = new Map();

const cloneValue = (value) => {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const getTtlMs = () => cacheTtlSeconds * 1000;

const isEnabled = () => getTtlMs() > 0;

const toCacheKey = (namespace, key) => `${namespace}::${String(key || '')}`;

const removeExpiredEntries = () => {
  const now = Date.now();

  for (const [key, entry] of cache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
};

const evictLeastRecentlyUsed = () => {
  if (cache.size < cacheMaxEntries) return;

  let oldestKey = null;
  let oldestAccess = Number.POSITIVE_INFINITY;

  for (const [key, entry] of cache.entries()) {
    const accessedAt = Number(entry?.lastAccessedAt || 0);
    if (accessedAt < oldestAccess) {
      oldestAccess = accessedAt;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    cache.delete(oldestKey);
  }
};

const getCached = (namespace, key) => {
  if (!isEnabled()) return null;

  const entryKey = toCacheKey(namespace, key);
  const entry = cache.get(entryKey);
  if (!entry) return null;

  const now = Date.now();
  if (entry.expiresAt <= now) {
    cache.delete(entryKey);
    return null;
  }

  entry.lastAccessedAt = now;
  return cloneValue(entry.value);
};

const setCached = (namespace, key, value) => {
  if (!isEnabled()) return;

  removeExpiredEntries();
  evictLeastRecentlyUsed();

  const now = Date.now();
  const entryKey = toCacheKey(namespace, key);

  cache.set(entryKey, {
    value: cloneValue(value),
    expiresAt: now + getTtlMs(),
    lastAccessedAt: now,
  });
};

const clearNamespace = (namespace) => {
  const prefix = `${namespace}::`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
};

const clearAll = () => {
  cache.clear();
};

module.exports = {
  isEnabled,
  getCached,
  setCached,
  clearNamespace,
  clearAll,
};
