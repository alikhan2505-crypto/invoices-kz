// Loads the supabase client on first use, keeping supabase-js out of the
// first-load bundle of pages where most visitors are signed out.
export const loadSupabase = () => import('./supabase').then((m) => m.supabase)
