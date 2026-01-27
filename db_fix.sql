
-- !!! IMPORTANT: RUN THIS SCRIPT IN SUPABASE SQL EDITOR TO FIX ERROR 42P17 !!! --

-- 1. Create a Helper Function to bypass RLS for Admin checks
-- This function runs as SECURITY DEFINER (superuser privileges) to avoid recursion loops.
-- It allows us to check the user's role without triggering RLS policies on the profiles table.
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

-- 2. Fix PROFILES Policies (The source of the current 42P17 error)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Read access for all" ON profiles;
DROP POLICY IF EXISTS "Profiles are viewable by users who own them or admins" ON profiles;
DROP POLICY IF EXISTS "Read Profiles" ON profiles;
DROP POLICY IF EXISTS "Update Own Profile" ON profiles;
DROP POLICY IF EXISTS "Insert Own Profile" ON profiles;

-- Users can read their own profile OR Admins can read all (using safe function)
CREATE POLICY "Read Profiles"
ON profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id OR is_admin()
);

-- Users can update their own profile
CREATE POLICY "Update Own Profile"
ON profiles
FOR UPDATE
TO authenticated
USING ( auth.uid() = id );

-- Users can insert their own profile (on signup)
CREATE POLICY "Insert Own Profile"
ON profiles
FOR INSERT
TO authenticated
WITH CHECK ( auth.uid() = id );


-- 3. Fix SERVICE_REQUESTS Policies (Update to use is_admin())
DROP POLICY IF EXISTS "Enable read access for all users" ON service_requests;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON service_requests;
DROP POLICY IF EXISTS "Enable update for users based on email" ON service_requests;
DROP POLICY IF EXISTS "Admins can do everything" ON service_requests;
DROP POLICY IF EXISTS "Users can view own requests" ON service_requests;
DROP POLICY IF EXISTS "Select own requests" ON service_requests;
DROP POLICY IF EXISTS "Admins can view all requests" ON service_requests;
DROP POLICY IF EXISTS "Admins can update all requests" ON service_requests;
DROP POLICY IF EXISTS "Customers can view own requests" ON service_requests;
DROP POLICY IF EXISTS "Customers can create requests" ON service_requests;
DROP POLICY IF EXISTS "View Requests" ON service_requests;
DROP POLICY IF EXISTS "Create Requests" ON service_requests;
DROP POLICY IF EXISTS "Update Requests (Admin)" ON service_requests;

-- Re-apply using is_admin() for safety
CREATE POLICY "View Requests"
ON service_requests
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id OR is_admin()
);

CREATE POLICY "Create Requests"
ON service_requests
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
);

CREATE POLICY "Update Requests (Admin)"
ON service_requests
FOR UPDATE
TO authenticated
USING ( is_admin() );


-- 4. Fix SERVICE_NOTES Policies
DROP POLICY IF EXISTS "Note View Policy" ON service_notes;
DROP POLICY IF EXISTS "Note Insert Policy" ON service_notes;
DROP POLICY IF EXISTS "View Notes" ON service_notes;
DROP POLICY IF EXISTS "Insert Notes" ON service_notes;

CREATE POLICY "View Notes"
ON service_notes
FOR SELECT
TO authenticated
USING (
  -- User owns the request OR User is admin
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
  -- User owns the request OR User is admin
  EXISTS (
    SELECT 1 FROM service_requests 
    WHERE id = request_id 
    AND (user_id = auth.uid() OR is_admin())
  )
);
