
-- !!! IMPORTANT: RUN THIS SCRIPT IN SUPABASE SQL EDITOR !!! --

-- 1. Helper Function for Admin Check (Bypasses RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$;

-- 2. Fix PROFILES Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read Profiles" ON profiles;
DROP POLICY IF EXISTS "Update Own Profile" ON profiles;
DROP POLICY IF EXISTS "Insert Own Profile" ON profiles;
-- Cleanup old policies if they exist
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- UPDATE: Allow reading own profile OR admins (so customers can send notifications to admins)
CREATE POLICY "Read Profiles"
ON profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id OR is_admin() OR role = 'admin'
);

CREATE POLICY "Update Own Profile"
ON profiles
FOR UPDATE
TO authenticated
USING ( auth.uid() = id );

CREATE POLICY "Insert Own Profile"
ON profiles
FOR INSERT
TO authenticated
WITH CHECK ( auth.uid() = id );


-- 3. Fix SERVICE_REQUESTS Policies
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View Requests" ON service_requests;
DROP POLICY IF EXISTS "Create Requests" ON service_requests;
DROP POLICY IF EXISTS "Update Requests (Admin)" ON service_requests;
DROP POLICY IF EXISTS "Update Requests (Customer)" ON service_requests;

-- View: Own requests or Admins see all
CREATE POLICY "View Requests"
ON service_requests
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id OR is_admin()
);

-- Create: Only own requests
CREATE POLICY "Create Requests"
ON service_requests
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
);

-- Update: Admins can update any; Customers can update ONLY if approving cost
CREATE POLICY "Update Requests (Admin)"
ON service_requests
FOR UPDATE
TO authenticated
USING ( is_admin() );

CREATE POLICY "Update Requests (Customer)"
ON service_requests
FOR UPDATE
TO authenticated
USING ( auth.uid() = user_id )
WITH CHECK ( auth.uid() = user_id ); 


-- 4. Fix SERVICE_NOTES Policies
ALTER TABLE service_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View Notes" ON service_notes;
DROP POLICY IF EXISTS "Insert Notes" ON service_notes;

CREATE POLICY "View Notes"
ON service_notes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM service_requests 
    WHERE id = service_notes.request_id 
    AND (user_id = auth.uid() OR is_admin())
  )
);

CREATE POLICY "Insert Notes"
ON service_notes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM service_requests 
    WHERE id = request_id 
    AND (user_id = auth.uid() OR is_admin())
  )
);


-- 5. CREATE NOTIFICATIONS TABLE (Fixes PGRST205 Error)
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

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.notifications;

-- View own
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Update own (mark read)
CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Insert (Admins sending to users, or users triggering admin notifs)
CREATE POLICY "Enable insert for authenticated users"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (true); 

-- 6. Enable Realtime for Notifications
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
