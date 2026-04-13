export const normalizePreferredLanguage = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'english') return 'English';
  if (normalized === 'taglish' || normalized === 'filipino' || normalized === 'tagalog') return 'Taglish';

  return 'English';
};

export const getPreferredLanguage = () => {
  if (typeof window === 'undefined') return null;

  const storedPreference = window.localStorage.getItem('preferredLanguage');
  if (!storedPreference) return null;

  return normalizePreferredLanguage(storedPreference);
};

export const withPreferredLanguage = (path) => {
  const preferredLanguage = getPreferredLanguage();
  if (!preferredLanguage) return path;

  const separator = path.includes('?') ? '&' : '?';
  const language = encodeURIComponent(preferredLanguage);
  return `${path}${separator}language=${language}`;
};
