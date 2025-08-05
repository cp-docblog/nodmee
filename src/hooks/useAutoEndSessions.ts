import { useEffect } from 'react';

export const useAutoEndSessions = () => {
  useEffect(() => {
    // Call the auto-end function every minute
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-end-cron`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        
        const result = await response.json();
        console.log('Auto-end check:', result);
      } catch (error) {
        console.error('Auto-end check failed:', error);
      }
    }, 60000); // Every minute

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []);
};