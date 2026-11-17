export const SUPABASE_URL = "";
export const SUPABASE_PUBLISHABLE_KEY = "";

export function isBackendConfigured() {
  return SUPABASE_URL.startsWith("https://") && SUPABASE_PUBLISHABLE_KEY.length > 20;
}
