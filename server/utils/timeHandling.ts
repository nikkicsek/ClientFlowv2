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
 * Enhanced time parsing with multiple format support per specification
 * @param dueDate - Date string in YYYY-MM-DD format  
 * @param dueTime - Time string like "9:55 PM", "21:55", "9 AM", etc.
 * @param userTz - IANA timezone string
 * @returns Object with UTC timestamp, normalized database time, and database date
 */
export function parseTaskDateTime(dueDate: string, dueTime: string, userTz: string): {
  due_at: string | null;
  due_time_db: string | null;
  due_date_db: string | null;
} {
  if (!dueDate || !dueTime) {
    return { due_at: null, due_time_db: null, due_date_db: null };
  }
  
  try {
    const dateTimeStr = `${dueDate} ${dueTime.trim()}`;
    const formats = [
      "YYYY-MM-DD h:mm A",  // "2025-08-18 9:55 PM"
      "YYYY-MM-DD H:mm",    // "2025-08-18 21:55"
      "YYYY-MM-DD h A",     // "2025-08-18 9 PM"
      "YYYY-MM-DD H"        // "2025-08-18 21"
    ];
    
    let local = null;
    
    // Try each format until one works
    for (const format of formats) {
      local = dayjs.tz(dateTimeStr, format, userTz);
      if (local.isValid()) break;
    }
    
    if (!local || !local.isValid()) {
      console.error('parseTaskDateTime failed - invalid formats:', dueDate, dueTime, userTz);
      return { due_at: null, due_time_db: null, due_date_db: null };
    }
    
    const result = {
      due_at: local.utc().toISOString(),           // UTC for scheduling
      due_time_db: local.format("HH:mm"),         // 24-hour format for DB
      due_date_db: dayjs(dueDate).format("YYYY-MM-DD") // Normalized date
    };
    
    console.log('parseTaskDateTime success:', { dueDate, dueTime, userTz, result });
    return result;
  } catch (error) {
    console.error('Error parsing task date/time:', error);
    return { due_at: null, due_time_db: null, due_date_db: null };
  }
}

/**
 * Legacy function - maintained for backward compatibility
 */
export function buildDueAtUTC(dueDate: string, dueTime: string, userTz: string): string | null {
  const result = parseTaskDateTime(dueDate, dueTime, userTz);
  return result.due_at;
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
    
    // Use format specified in requirements: "M/D/YYYY [at] h:mm A"
    return localDateTime.format('M/D/YYYY [at] h:mm A');
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