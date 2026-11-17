export const SUPABASE_URL = "https://zvzzbggesldqbhemjjjz.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_P6UpyDswKkaRGJSjWzp76w_pT2OKI-q";

export function isBackendConfigured() {
  return SUPABASE_URL.startsWith("https://") && SUPABASE_PUBLISHABLE_KEY.length > 20;
}
