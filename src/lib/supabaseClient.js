import { createClient } from "@supabase/supabase-js";

// Frontend-first mode:
// The UI can run before a real Supabase project is connected.
// When backend work starts later, create .env.local with:
// VITE_SUPABASE_URL=...
// VITE_SUPABASE_ANON_KEY=...
const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
const configuredKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(configuredUrl && configuredKey);

// Valid local placeholders prevent imports from crashing the React app.
// Database requests will simply fail gracefully until real credentials are added.
const supabaseUrl = configuredUrl || "http://127.0.0.1:54321";
const supabaseAnonKey = configuredKey || "frontend-preview-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
