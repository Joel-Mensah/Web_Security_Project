import { createClient } from '@supabase/supabase-js';

// Point this to your Supabase project URL.
// In production, this should be set via environment variable or a config file.
const SUPABASE_URL = 'https://perlthvvdjbmcdrcblkx.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here'; // Replace with your actual anon key

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storageKey: 'ea_mobile_session',
  },
});

export async function syncIncidents() {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Supabase sync error:', error);
    return null;
  }
  return data;
}

export async function saveIncident(incident: { title: string; category: string; severity: string; description: string; user_id?: string }) {
  const { data, error } = await supabase.from('incidents').insert([incident]).select().single();
  if (error) {
    console.error('Supabase insert error:', error);
    return null;
  }
  return data;
}
