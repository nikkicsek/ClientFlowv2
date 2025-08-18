/**
 * Server-side time handling utilities for unified timezone management
 * Uses Luxon for robust timezone conversion from client input to UTC timestamps
 */
import { DateTime } from 'luxon';

/**
 * Compute UTC timestamp from date, time, and timezone using Luxon
 * @param dueDate - Date string in YYYY-MM-DD format
 * @param dueTime - Time string in HH:mm format (optional, defaults to 00:00)
 * @param timezone - IANA timezone string
 * @returns UTC ISO timestamp string or null if invalid
 */
export function computeDueAt(dueDate: string, dueTime?: string | null, timezone?: string): string | null {
  if (!dueDate || !timezone) return null;
  
  try {
    const timeStr = dueTime || "00:00";
    const dateTimeStr = `${dueDate}T${timeStr}`;
    
    // Use Luxon for precise timezone handling
    const utc = DateTime.fromISO(dateTimeStr, { zone: timezone }).toUTC();
    
    if (!utc.isValid) {
      console.error('Invalid DateTime:', utc.invalidReason, utc.invalidExplanation);
      return null;
    }
    
    return utc.toISO();
  } catch (error) {
    console.error('Error computing due_at with Luxon:', error);
    return null;
  }
}

/**
 * Convert UTC timestamp to local timezone display using Luxon
 * @param utcTimestamp - UTC ISO string
 * @param timezone - IANA timezone string (optional, uses system default)
 * @returns formatted local time string
 */
export function formatUtcInTimezone(utcTimestamp: string, timezone?: string): string {
  try {
    const utcDateTime = DateTime.fromISO(utcTimestamp, { zone: 'utc' });
    
    if (!utcDateTime.isValid) {
      console.error('Invalid UTC DateTime:', utcDateTime.invalidReason);
      return utcTimestamp.slice(0, 10);
    }
    
    const localDateTime = timezone ? utcDateTime.setZone(timezone) : utcDateTime.toLocal();
    
    return localDateTime.toLocaleString({
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    console.error('Error formatting UTC time with Luxon:', error);
    return utcTimestamp.slice(0, 10);
  }
}

/**
 * Get server timezone and current time info for debugging
 * @param userTimezone - User's IANA timezone string
 * @returns debug time info
 */
export function getDebugTimeInfo(userTimezone?: string) {
  const now = DateTime.now();
  
  return {
    tzServer: now.zoneName,
    nowUtc: now.toUTC().toISO(),
    nowLocalForUser: userTimezone ? now.setZone(userTimezone).toISO() : now.toLocal().toISO()
  };
}

/**
 * Compute calendar event times from due_at for a specific timezone
 * @param dueAt - UTC ISO timestamp
 * @param timezone - IANA timezone for the event
 * @param durationMinutes - Event duration in minutes (default 60)
 * @returns { start, end } in Google Calendar format
 */
export function computeCalendarEventTimes(dueAt: string, timezone: string, durationMinutes: number = 60): { start: string; end: string } {
  try {
    const startTime = DateTime.fromISO(dueAt, { zone: 'utc' }).setZone(timezone);
    const endTime = startTime.plus({ minutes: durationMinutes });
    
    // Google Calendar expects timezone-aware datetime format
    return {
      start: startTime.toISO()!,
      end: endTime.toISO()!
    };
  } catch (error) {
    console.error('Error computing calendar event times:', error);
    // Fallback to basic Date handling
    const start = new Date(dueAt);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    return {
      start: start.toISOString(),
      end: end.toISOString()
    };
  }
}

/**
 * Generate deterministic Google Calendar event ID
 * @param taskId - Task UUID
 * @param userId - User/Team member ID
 * @returns deterministic event ID
 */
export function generateCalendarEventId(taskId: string, userId: string): string {
  return `task-${taskId}-${userId}`;
}

/**
 * Backfill dueDate and dueTime from due_at for display
 * @param dueAt - UTC ISO string
 * @param timezone - IANA timezone string for display
 * @returns { dueDate, dueTime } in the specified timezone
 */
export function backfillDisplayFields(dueAt: string, timezone: string): { dueDate: string; dueTime: string } {
  try {
    const utcDateTime = DateTime.fromISO(dueAt, { zone: 'utc' });
    const localDateTime = utcDateTime.setZone(timezone);
    
    return {
      dueDate: localDateTime.toFormat('yyyy-MM-dd'),
      dueTime: localDateTime.toFormat('HH:mm')
    };
  } catch (error) {
    console.error('Error backfilling display fields:', error);
    return { dueDate: dueAt.slice(0, 10), dueTime: "00:00" };
  }
}

/**
 * Check if a task should have a timed calendar event
 * @param dueAt - UTC ISO string
 * @param dueTime - Original dueTime string (optional)
 * @returns true if should create timed event, false for all-day
 */
export function shouldCreateTimedEvent(dueAt: string | null, dueTime: string | null): boolean {
  if (!dueAt) return false;
  if (!dueTime) return false; // No time specified = all-day
  
  try {
    const utcDateTime = DateTime.fromISO(dueAt, { zone: 'utc' });
    // Check if it's exactly midnight UTC (likely an all-day task)
    const hours = utcDateTime.hour;
    const minutes = utcDateTime.minute;
    const seconds = utcDateTime.second;
    
    return !(hours === 0 && minutes === 0 && seconds === 0);
  } catch (error) {
    return false;
  }
}