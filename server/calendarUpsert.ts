/**
 * Calendar upsert functionality for idempotent Google Calendar integration
 * Implements the exact requirements from the specification
 */
import { DateTime } from 'luxon';
import { GoogleCalendarService } from './googleCalendarService';

interface Task {
  id: string;
  title: string;
  description?: string | null;
  dueAt: Date | string | null;
  googleCalendarEventId?: string | null;
}

interface CalendarUpsertResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

/**
 * Calendar upsert function as specified in requirements
 * @param task - Task with due_at and optional calendar_event_id
 * @param userId - User ID for token lookup
 * @param userTz - User timezone (default: America/Vancouver for nikki@csekcreative.com)
 * @returns CalendarUpsertResult
 */
export async function calendarUpsert(
  task: Task, 
  userId: string, 
  userTz: string = "America/Vancouver"
): Promise<CalendarUpsertResult> {
  try {
    if (!task.dueAt) {
      return { success: false, error: 'No due_at timestamp provided' };
    }

    // Get Google Calendar service for user
    const calendarService = new GoogleCalendarService();
    const client = await calendarService.getClientForUser(userId);
    
    if (!client) {
      return { success: false, error: 'No Google Calendar access for user' };
    }

    // Convert UTC due_at to local timezone for calendar event
    const utcDateTime = DateTime.fromISO(task.dueAt.toString(), { zone: 'utc' });
    const localDateTime = utcDateTime.setZone(userTz);
    
    // Build Google Calendar event as specified
    const event = {
      summary: task.title,
      description: task.description || "Task from AgencyPro",
      start: {
        dateTime: localDateTime.toISO(),
        timeZone: userTz
      },
      end: {
        dateTime: localDateTime.plus({ minutes: 60 }).toISO(), // 60 minutes duration
        timeZone: userTz
      }
    };

    let eventId: string;

    if (task.googleCalendarEventId) {
      // Update existing event (idempotent)
      const response = await client.events.patch({
        calendarId: 'primary',
        eventId: task.googleCalendarEventId,
        requestBody: event
      });
      eventId = response.data.id!;
      console.log('Calendar event updated:', { taskId: task.id, eventId });
    } else {
      // Create new event
      const response = await client.events.insert({
        calendarId: 'primary',
        requestBody: event
      });
      eventId = response.data.id!;
      console.log('Calendar event created:', { taskId: task.id, eventId });
    }

    return { success: true, eventId };
  } catch (error: any) {
    console.error('Calendar upsert error:', error);
    return { success: false, error: error.message };
  }
}