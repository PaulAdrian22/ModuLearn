// Legacy shim retained only so a couple of utility files (notably
// SimulationRenderer's simAssetUrl) keep importing without crashing while
// they handle pre-Supabase relative paths.
//
// New code should import from `lib/supabase` and `services/api` instead.
// These exports return empty strings post-rebuild, which causes legacy
// path-prefixing logic to no-op. Fully-qualified Supabase Storage URLs
// pass through unchanged.

export const API_BASE_URL = '';
export const API_SERVER_URL = '';
export const DEFAULT_API_BASE_URL = '';
