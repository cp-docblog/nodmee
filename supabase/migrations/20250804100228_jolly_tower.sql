/*
  # Add duration discounts system

  1. New Tables
    - `duration_discounts`
      - `id` (uuid, primary key)
      - `workspace_type_id` (uuid, foreign key to workspace_types)
      - `duration` (text, duration like "1 hour", "2 hours", etc.)
      - `discount_percentage` (numeric, percentage discount 0-100)
      - `fixed_price` (numeric, optional fixed price override)
      - `is_active` (boolean, default true)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `duration_discounts` table
    - Add policies for admins to manage discounts
    - Add policy for public to view active discounts

  3. Triggers
    - Add updated_at trigger for duration_discounts table
*/

-- Create duration_discounts table
CREATE TABLE IF NOT EXISTS duration_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_type_id uuid NOT NULL REFERENCES workspace_types(id) ON DELETE CASCADE,
  duration text NOT NULL,
  discount_percentage numeric DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  fixed_price numeric DEFAULT NULL CHECK (fixed_price >= 0),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_type_id, duration)
);

-- Enable RLS
ALTER TABLE duration_discounts ENABLE ROW LEVEL SECURITY;

-- Policies for duration_discounts
CREATE POLICY "Admins can manage duration discounts"
  ON duration_discounts
  FOR ALL
  TO authenticated
  USING (is_admin_safe())
  WITH CHECK (is_admin_safe());

CREATE POLICY "Anyone can view active duration discounts"
  ON duration_discounts
  FOR SELECT
  TO public
  USING (is_active = true);

-- Add updated_at trigger
CREATE TRIGGER update_duration_discounts_updated_at
  BEFORE UPDATE ON duration_discounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert some sample duration discounts for existing workspace types
DO $$
DECLARE
  workspace_record RECORD;
BEGIN
  FOR workspace_record IN 
    SELECT id, name FROM workspace_types WHERE is_active = true
  LOOP
    -- Insert sample discounts for each workspace type
    INSERT INTO duration_discounts (workspace_type_id, duration, discount_percentage, is_active) VALUES
    (workspace_record.id, '3 hours', 10, true),  -- 10% discount for 3 hours
    (workspace_record.id, '4 hours', 15, true),  -- 15% discount for 4 hours
    (workspace_record.id, '5 hours', 20, true),  -- 20% discount for 5 hours
    (workspace_record.id, '6 hours', 25, true)   -- 25% discount for 6 hours
    ON CONFLICT (workspace_type_id, duration) DO NOTHING;
  END LOOP;
END $$;