/*
  # Add booking durations setting

  1. New Settings
    - Add booking_durations setting to allow dynamic booking duration configuration
    
  2. Changes
    - Insert default booking durations setting if it doesn't exist
*/

-- Add booking durations setting
INSERT INTO site_settings (key, value, description, setting_type, is_public)
VALUES (
  'booking_durations',
  '1 hour,2 hours,3 hours,4 hours,5 hours,6 hours',
  'Available booking durations for workspace reservations',
  'text',
  true
)
ON CONFLICT (key) DO NOTHING;