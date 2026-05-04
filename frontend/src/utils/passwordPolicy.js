// Password policy — client-side mirror of what's enforced in
// Supabase Dashboard → Authentication → Policies → Password requirements.
// Keep these two in sync; either one alone is insufficient (server is
// authoritative, client gives instant feedback so users aren't surprised).
//
// Policy:
//   - At least 8 characters
//   - At least one uppercase letter
//   - At least one lowercase letter
//   - At least one number
//   - At least one special character (anything not alphanumeric)

export const PASSWORD_RULES = [
  { id: 'len',     label: 'At least 8 characters',          test: (v) => v.length >= 8 },
  { id: 'upper',   label: 'One uppercase letter (A–Z)',     test: (v) => /[A-Z]/.test(v) },
  { id: 'lower',   label: 'One lowercase letter (a–z)',     test: (v) => /[a-z]/.test(v) },
  { id: 'digit',   label: 'One number (0–9)',               test: (v) => /\d/.test(v) },
  { id: 'special', label: 'One symbol (e.g. ! @ # ?)',      test: (v) => /[^A-Za-z0-9]/.test(v) },
];

// Returns { valid: boolean, failed: [{id, label}] }.
export function validatePassword(password) {
  const value = String(password ?? '');
  const failed = PASSWORD_RULES.filter((r) => !r.test(value)).map(({ id, label }) => ({ id, label }));
  return { valid: failed.length === 0, failed };
}

// Convenience for form-level error rendering.
export function passwordErrorMessage(password) {
  const { valid, failed } = validatePassword(password);
  if (valid) return '';
  return `Password must include: ${failed.map((f) => f.label.toLowerCase()).join(', ')}.`;
}
