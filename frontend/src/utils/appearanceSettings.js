export const FONT_SIZE_CLASSES = ['font-size-small', 'font-size-default', 'font-size-large'];
export const UI_SIZE_CLASSES = ['ui-size-small', 'ui-size-default', 'ui-size-large'];
export const THEME_CLASSES = ['theme-light', 'theme-dark'];

const normalizeTheme = (theme) => {
  if (theme === 'Dark Mode' || theme === 'Auto') {
    return theme;
  }
  return 'Light Mode';
};

const normalizeFontSize = (fontSize) => {
  if (fontSize === 'Small' || fontSize === 'Large') {
    return fontSize;
  }
  return 'Default';
};

const normalizeUiSize = (uiSize) => {
  if (uiSize === 'Small' || uiSize === 'Large') {
    return uiSize;
  }
  return 'Default';
};

const getActiveThemeClass = (theme) => {
  if (theme === 'Auto') {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'theme-dark' : 'theme-light';
  }

  return theme === 'Dark Mode' ? 'theme-dark' : 'theme-light';
};

export const getAppearanceStorageKeys = (isAdmin = false) => {
  if (isAdmin) {
    return {
      theme: 'adminTheme',
      fontSize: 'adminFontSize',
      uiSize: 'adminUiSize'
    };
  }

  return {
    theme: 'theme',
    fontSize: 'fontSize',
    uiSize: 'uiSize'
  };
};

export const getStoredAppearanceSettings = (isAdmin = false) => {
  const keys = getAppearanceStorageKeys(isAdmin);

  return {
    theme: normalizeTheme(localStorage.getItem(keys.theme) || 'Light Mode'),
    fontSize: normalizeFontSize(localStorage.getItem(keys.fontSize) || 'Default'),
    uiSize: normalizeUiSize(localStorage.getItem(keys.uiSize) || 'Default')
  };
};

export const saveAppearanceSettings = ({ isAdmin = false, theme, fontSize, uiSize }) => {
  const keys = getAppearanceStorageKeys(isAdmin);

  if (theme) {
    localStorage.setItem(keys.theme, normalizeTheme(theme));
  }

  if (fontSize) {
    localStorage.setItem(keys.fontSize, normalizeFontSize(fontSize));
  }

  if (uiSize) {
    localStorage.setItem(keys.uiSize, normalizeUiSize(uiSize));
  }
};

export const applyAppearanceSettings = ({ theme = 'Light Mode', fontSize = 'Default', uiSize = 'Default' }) => {
  const root = document.documentElement;
  const normalizedTheme = normalizeTheme(theme);
  const normalizedFontSize = normalizeFontSize(fontSize);
  const normalizedUiSize = normalizeUiSize(uiSize);

  root.classList.remove(...FONT_SIZE_CLASSES);
  root.classList.add(`font-size-${normalizedFontSize.toLowerCase()}`);

  root.classList.remove(...UI_SIZE_CLASSES);
  root.classList.add(`ui-size-${normalizedUiSize.toLowerCase()}`);

  root.classList.remove(...THEME_CLASSES);
  root.classList.add(getActiveThemeClass(normalizedTheme));

  root.dataset.appearanceTheme = normalizedTheme;
  root.dataset.appearanceFontSize = normalizedFontSize;
  root.dataset.appearanceUiSize = normalizedUiSize;
};
