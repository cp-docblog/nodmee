import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create a cron job that runs every minute to check for expired booking sessions
    const cronJobName = 'auto-end-booking-sessions';
    const cronSchedule = '* * * * *'; // Every minute
    const functionUrl = `${supabaseUrl}/functions/v1/auto-end-cron`;

    // Note: In a real production environment, you would set up the cron job
    // through Supabase's cron functionality or an external service like GitHub Actions
    // For now, we'll simulate this by calling the function periodically

    // Set up a recurring interval to call the auto-end function
    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
          },
        });
        
        const result = await response.json();
        console.log('Auto-end cron result:', result);
      } catch (error) {
        console.error('Auto-end cron error:', error);
      }
    }, 60000); // Run every minute

    // Store the interval ID for cleanup (in a real app, this would be managed differently)
    EdgeRuntime.waitUntil(
      new Promise((resolve) => {
        // Keep the interval running
        setTimeout(() => {
          clearInterval(intervalId);
          resolve(undefined);
        }, 24 * 60 * 60 * 1000); // Run for 24 hours, then restart
      })
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cron job setup initiated',
        cronJobName,
        schedule: cronSchedule,
        functionUrl,
        timestamp: new Date().toISOString()
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      },
    );
  } catch (error) {
    console.error('Error setting up cron job:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      },
    );
  }
});