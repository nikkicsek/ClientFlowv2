/**
 * Server-side time handling utilities for unified timezone management
 * Uses DayJS for robust timezone conversion from client input to UTC timestamps
 */
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import tz from "dayjs/plugin/timezone";
import customParse from "dayjs/plugin/customParseFormat";

dayjs.extend(utc);
dayjs.extend(tz);
dayjs.extend(customParse);

/**
 * Build UTC timestamp from local date/time components with flexible parsing
 * @param dueDate - Date string in YYYY-MM-DD format  
 * @param dueTime - Time string like "9:55 PM", "21:55", "9 AM", etc.
 * @param userTz - IANA timezone string
 * @returns UTC ISO timestamp string or null if invalid
 */
export function buildDueAtUTC(dueDate: string, dueTime: string, userTz: string): string | null {
  if (!dueDate || !dueTime) return null;
  
  try {
    // Normalize time input - handle various formats
    const normalized = dueTime.trim().toUpperCase();
    
    // First try simple ISO format parsing which should work for "HH:mm" format
    const isoDateTime = `${dueDate}T${dueTime}:00`;
    let local = dayjs.tz(isoDateTime, userTz);
    
    // If that fails, try various parsing formats  
    if (!local.isValid()) {
      const formats = ["YYYY-MM-DD h:mm A", "YYYY-MM-DD H:mm", "YYYY-MM-DD h A", "YYYY-MM-DD H"];
      const dateTimeStr = `${dueDate} ${normalized}`;
      
      for (const format of formats) {
        local = dayjs.tz(dateTimeStr, format, userTz);
        if (local.isValid()) break;
      }
    }
    
    if (!local || !local.isValid()) {
      console.error('Invalid DateTime with all formats:', dueDate, dueTime, userTz);
      return null;
    }
    
    console.log('buildDueAtUTC success:', { dueDate, dueTime, userTz, result: local.utc().toISOString() });
    return local.utc().toISOString();
  } catch (error) {
    console.error('Error computing due_at with DayJS:', error);
    return null;
  }
}

/**
 * Legacy function for backward compatibility - use buildDueAtUTC instead
 */
export function computeDueAt(dueDate: string, dueTime?: string | null, timezone?: string): string | null {
  if (!dueDate || !timezone) return null;
  const timeStr = dueTime || "00:00";
  return buildDueAtUTC(dueDate, timeStr, timezone);
}

/**
 * Convert UTC timestamp to local timezone display using DayJS
 * @param utcTimestamp - UTC ISO string
 * @param timezone - IANA timezone string (optional, uses system default)
 * @returns formatted local time string
 */
export function formatUtcInTimezone(utcTimestamp: string, timezone?: string): string {
  try {
    const utcDateTime = dayjs.utc(utcTimestamp);
    
    if (!utcDateTime.isValid()) {
      console.error('Invalid UTC DateTime:', utcTimestamp);
      return utcTimestamp.slice(0, 10);
    }
    
    const localDateTime = timezone ? utcDateTime.tz(timezone) : utcDateTime.local();
    
    return localDateTime.format('MMM D, YYYY h:mm A');
  } catch (error) {
    console.error('Error formatting UTC time with DayJS:', error);
    return utcTimestamp.slice(0, 10);
  }
}

/**
 * Get server timezone and current time info for debugging
 * @param userTimezone - User's IANA timezone string
 * @returns debug time info
 */
export function getDebugTimeInfo(userTimezone?: string) {
  const now = dayjs();
  
  return {
    tzServer: Intl.DateTimeFormat().resolvedOptions().timeZone,
    nowUtc: now.utc().toISOString(),
    nowLocalForUser: userTimezone ? now.tz(userTimezone).toISOString() : now.toISOString()
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
    const startTime = dayjs.utc(dueAt).tz(timezone);
    const endTime = startTime.add(durationMinutes, 'minute');
    
    // Google Calendar expects timezone-aware datetime format
    return {
      start: startTime.toISOString(),
      end: endTime.toISOString()
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
    const utcDateTime = dayjs.utc(dueAt);
    const localDateTime = utcDateTime.tz(timezone);
    
    return {
      dueDate: localDateTime.format('YYYY-MM-DD'),
      dueTime: localDateTime.format('HH:mm')
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
    const utcDateTime = dayjs.utc(dueAt);
    // Check if it's exactly midnight UTC (likely an all-day task)
    const hours = utcDateTime.hour();
    const minutes = utcDateTime.minute();
    const seconds = utcDateTime.second();
    
    return !(hours === 0 && minutes === 0 && seconds === 0);
  } catch (error) {
    return false;
  }
}