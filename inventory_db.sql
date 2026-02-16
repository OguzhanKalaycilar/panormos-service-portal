
-- 1. Ensure Inventory Table Exists with New Columns
CREATE TABLE IF NOT EXISTS public.inventory (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'Genel',
    sku text, 
    quantity int DEFAULT 0,
    critical_level int DEFAULT 5,
    buy_price numeric DEFAULT 0,
    sell_price numeric DEFAULT 0,
    shelf_location text,
    status text DEFAULT 'new',
    notes text
);

-- 2. Reset RLS Policies for Inventory
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Admins can do everything on inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow Admins Full Access" ON public.inventory;

-- Create separated policies for better control and debugging

-- SELECT: Admins can see everything
CREATE POLICY "Admins can select inventory"
ON public.inventory
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- INSERT: Admins can insert
CREATE POLICY "Admins can insert inventory"
ON public.inventory
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- UPDATE: Admins can update
CREATE POLICY "Admins can update inventory"
ON public.inventory
FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- DELETE: Admins can delete
CREATE POLICY "Admins can delete inventory"
ON public.inventory
FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 3. Add to Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' 
    and schemaname = 'public' 
    and tablename = 'inventory'
  ) then
    alter publication supabase_realtime add table inventory;
  end if;
end
$$;
