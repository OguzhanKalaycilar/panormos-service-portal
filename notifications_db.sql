
-- Create Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  link text,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_read boolean DEFAULT false
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Users can update (mark read) their own notifications
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Allow inserts (Admins sending to Users, or System triggers)
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.notifications;
CREATE POLICY "Enable insert for authenticated users"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (true);

-- CRITICAL: Enable Realtime for this table
-- This allows the React app to receive live updates when rows are inserted
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
    and schemaname = 'public' 
    and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end
$$;
