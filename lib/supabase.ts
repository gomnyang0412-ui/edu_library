import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(url && publishableKey);

export const supabase = createClient(
  url ?? 'https://missing-config.supabase.co',
  publishableKey ?? 'missing-publishable-key',
  {
    db: { schema: 'teacher_hub' },
    auth: { persistSession: true, autoRefreshToken: true },
  },
);

export const STORAGE_BUCKET = 'teacher-work-hub';

