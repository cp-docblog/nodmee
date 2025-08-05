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

    // Helper function to convert duration to minutes
    const convertDurationToMinutes = (duration: string): number => {
      const hourMatch = duration.match(/(\d+)\s*hours?/i);
      if (hourMatch) {
        return parseInt(hourMatch[1]) * 60;
      }
      
      const minuteMatch = duration.match(/(\d+)\s*minutes?/i);
      if (minuteMatch) {
        return parseInt(minuteMatch[1]);
      }
      
      // Default to 60 minutes if parsing fails
      return 60;
    };

    // Fetch active booking sessions with booking details
    const { data: activeSessions, error: sessionsError } = await supabase
      .from('user_sessions')
      .select(`
        id,
        user_id,
        start_time,
        booking_id,
        booking:booking_id (
          duration,
          customer_name,
          customer_email,
          customer_phone,
          customer_whatsapp,
          workspace_type,
          date,
          time_slot
        )
      `)
      .eq('session_type', 'booking')
      .eq('status', 'active');

    if (sessionsError) {
      throw new Error(`Failed to fetch active booking sessions: ${sessionsError.message}`);
    }

    const now = new Date();
    const sessionsToEnd = [];

    // Check which sessions should be ended
    for (const session of activeSessions || []) {
      if (!session.booking) continue;
      
      const startTime = new Date(session.start_time);
      const durationMinutes = convertDurationToMinutes(session.booking.duration);
      const endTime = new Date(startTime.getTime() + (durationMinutes * 60 * 1000));
      
      if (now >= endTime) {
        sessionsToEnd.push({
          ...session,
          calculatedEndTime: endTime,
          durationMinutes
        });
      }
    }

    let endedCount = 0;

    // End expired sessions
    for (const session of sessionsToEnd) {
      const actualDurationMinutes = Math.ceil((session.calculatedEndTime.getTime() - new Date(session.start_time).getTime()) / (1000 * 60));
      
      // Update session to completed status
      const { error: updateError } = await supabase
        .from('user_sessions')
        .update({
          end_time: session.calculatedEndTime.toISOString(),
          duration_minutes: actualDurationMinutes,
          status: 'completed',
          confirmation_required: true
        })
        .eq('id', session.id);

      if (updateError) {
        console.error(`Failed to update session ${session.id}:`, updateError);
        continue;
      }

      endedCount++;

      // Send webhook notification
      try {
        await fetch('https://aibackend.cp-devcode.com/webhook/1ef572d1-3263-4784-bc19-c38b3fbc09d0', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'booking_session_auto_ended',
            sessionId: session.id,
            userId: session.user_id,
            customerData: {
              name: session.booking.customer_name,
              email: session.booking.customer_email,
              phone: session.booking.customer_phone,
              whatsapp: session.booking.customer_whatsapp
            },
            bookingDetails: {
              workspace_type: session.booking.workspace_type,
              date: session.booking.date,
              time_slot: session.booking.time_slot,
              duration: session.booking.duration
            },
            sessionDetails: {
              start_time: session.start_time,
              end_time: session.calculatedEndTime.toISOString(),
              duration_minutes: actualDurationMinutes,
              booked_duration: session.booking.duration
            },
            timestamp: new Date().toISOString()
          })
        });
      } catch (webhookError) {
        console.error('Webhook failed:', webhookError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${(activeSessions || []).length} active sessions, ended ${endedCount} expired sessions`,
        totalActiveSessions: (activeSessions || []).length,
        endedSessions: endedCount,
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
    console.error('Error in auto-end-booking-sessions:', error);
    
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