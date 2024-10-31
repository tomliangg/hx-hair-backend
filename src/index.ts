import { Hono } from 'hono'
import { startOfWeek, endOfWeek, addDays, format, isValid } from 'date-fns';
import { createClient } from '@supabase/supabase-js';

const app = new Hono()
const supabase = createClient('https://tryhliynxreppygdvjqi.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyeWhsaXlueHJlcHB5Z2R2anFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk3MDE0ODcsImV4cCI6MjA0NTI3NzQ4N30.0QpcjJpqbNDZEyMh01qKn2mLwA2IDHaaSAOohYulNwA');

// API to get appointments for a given week
// client -> GET /appointments/week/2024-07-02
app.get('/appointments/week/:date', async (c) => {
  const dateString = c.req.param('date');

  try {
    const targetDate = new Date(dateString);
    const startOfWeekDate = startOfWeek(targetDate, { weekStartsOn: 1 });
    const endOfWeekDate = endOfWeek(targetDate);

    // the barber is available 9AM - 5PM, 6 days a week. He takes Sunday off.
    const weekSchedule = Array(6).fill(1).map(_ => ({ start_time: '09:00:00', end_time: '17:00:00' }));

    // 1. find existing appointments for the week
    const { data: appointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select('*')
      .gte('start_time', startOfWeekDate.toISOString())
      .lte('end_time', endOfWeekDate.toISOString());

    //  2. create data strcture for frontend
    const weekData = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(startOfWeekDate, i);
      const daySchedule = weekSchedule[i];

      const availableSlots = [];
      if (daySchedule) {
        const startTime = new Date(`${format(day, 'yyyy-MM-dd')}T${daySchedule.start_time}`);
        const endTime = new Date(`${format(day, 'yyyy-MM-dd')}T${daySchedule.end_time}`);

        let currentTime = startTime;
        while (currentTime < endTime) {
          const slotEndTime = new Date(currentTime.getTime() + (30 * 60 * 1000)); // 30 minutes later
          const isBooked = appointments?.some(appt => {
            const current = new Date(currentTime);
            const start = new Date(appt.start_time);
            const end = new Date(appt.end_time);
            return start <= current && current < end;
          });

          availableSlots.push({
            time: currentTime.toISOString(),
            available: !isBooked,
          });

          currentTime = slotEndTime;
        }
      }

      weekData.push({
        date: format(day, 'yyyy-MM-dd'),
        slots: availableSlots,
      });
    }

    return c.json(weekData);

  } catch (err) {
    console.error('Error in /appointments/week/:date API', err);
    return c.json({ error: 'An unexpected error occured.' }, 500);
  }
});

app.post('/appointments', async (c) => {
  const { firstName, lastName, email, startTime, endTime} = await c.req.json();

  // 1. validate input
  if (!firstName || !lastName || !email || !startTime || !endTime) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const startTimeDate = new Date(startTime);  // cast string to date 
  const endTimeDate = new Date(endTime);

  if (!isValid(startTimeDate) || !isValid(endTimeDate)) {
    return c.json({ error: 'Invalid date/time format' }, 400);
  }

  try {
    // 2. check if the time slot is available
    const { data: existingAppointments, error: appointmentError } = await supabase
      .from('appointments')
      .select('*')
      .filter('start_time', 'lte', endTime)  // overlap check
      .filter('end_time', 'gte', startTime)  // overlap check
      .maybeSingle();

    if (appointmentError) {
      return c.json({ error: 'Failed to check appointment availablity', appointmentError }, 500);
    }

    if (existingAppointments) {
      return c.json({ error: 'Time slot is already booked' }, 409);
    }

    // 3. insert the new appointment
    const { data: newAppointment, error: insertError } = await supabase
      .from('appointments')
      .insert({
        customer_first_name: firstName,
        customer_last_name: lastName,
        customer_email: email,
        start_time: startTime,
        end_time: endTime,
      })
      .single();

      if (insertError) {
        console.error("Supabase insert error:", insertError);  // Log
        return c.json({ error: 'Failed to create appointment' }, 500);
      }

      return c.json(newAppointment, 201);

  } catch (err) {
    console.error("Error in /appointments API:", err);
    return c.json({ error: 'An unexpected error occurred' }, 500);
  }
});

export default app