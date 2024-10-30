import { Hono } from 'hono'
import { startOfWeek, endOfWeek, addDays, format } from 'date-fns';
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
    return c.json({ error: 'An unexpected error occured.'}, 500);
  }
})

export default app