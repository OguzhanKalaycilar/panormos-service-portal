import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dfyoxkifsgdrkdmvrueo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_03Fjr7d4OCIL7iok9Ai4og_yYJVyDGM';

// Enhanced client configuration for network resilience
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: localStorage // Explicitly use localStorage
  },
  db: {
    schema: 'public'
  },
  // Global fetch options can be added here if needed for timeouts
});