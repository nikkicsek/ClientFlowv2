/**
 * Server-side time handling utilities for unified timezone management
 * Uses Luxon for robust timezone conversion from client input to UTC timestamps
 * Single source of truth approach - all due_at computed on server
 */
import { DateTime } from 'luxon';

/**
 * Parse local date/time string in user timezone using Luxon (single source of truth)
 */
const parseLocal = (dateStr: string, timeStr: string, tz: string): DateTime => {
  const candidates = [
    "yyyy-LL-dd HH:mm",    // "2025-08-18 21:55"
    "yyyy-LL-dd H:mm",     // "2025-08-18 9:55"  
    "yyyy-LL-dd h:mm a",   // "2025-08-18 9:55 AM"
    "yyyy-LL-dd h a"       // "2025-08-18 9 AM"
  ];
  
  const input = `${dateStr} ${timeStr.trim()}`;
  
  for (const fmt of candidates) {
    const dt = DateTime.fromFormat(input, fmt, { zone: tz });
    if (dt.isValid) return dt;
  }
  
  throw new Error(`Invalid date/time input: ${dateStr} ${timeStr}`);
};

/**
 * Compute due_at on the server (single source of truth approach)
 * @param dueDate - Date string in YYYY-MM-DD format  
 * @param dueTime - Time string like "9:45 AM", "21:55", "9 PM", etc.
 * @param userTz - IANA timezone string (fallback to America/Vancouver for nikki@csekcreative.com)
 * @returns Object with UTC timestamp, normalized database time, and database date
 */
export function computeDueAt(dueDate: string, dueTime: string, timezone: string): {
  due_at: string | null;
  due_time_db: string | null; 
  due_date_db: string | null;
} {
  // Return nulls if date is missing or time is missing (no calendar sync)
  if (!dueDate) {
    return { due_at: null, due_time_db: null, due_date_db: null };
  }
  
  if (!dueTime) {
    // Date only - no calendar sync
    return { 
      due_at: null, 
      due_time_db: null, 
      due_date_db: DateTime.fromISO(dueDate).toISODate() 
    };
  }
  
  try {
    // Determine userTz with fallback for nikki@csekcreative.com
    const userTz = timezone || process.env.APP_TIMEZONE || "America/Vancouver";
    
    // Parse in user's local timezone using Luxon
    const local = parseLocal(dueDate, dueTime, userTz);
    
    const result = {
      due_at: local.toUTC().toISO(),              // UTC for scheduling and calendar
      due_time_db: local.toFormat("HH:mm"),      // 24-hour format for DB (display helper)
      due_date_db: local.toISODate()             // Normalized date (display helper)
    };
    
    console.log('computeDueAt success:', { dueDate, dueTime, userTz, result });
    return result;
  } catch (error) {
    console.error('Error computing due_at:', error);
    return { 
      due_at: null, 
      due_time_db: null, 
      due_date_db: DateTime.fromISO(dueDate).toISODate() 
    };
  }
}

/**
 * Convert UTC timestamp to local timezone display using Luxon
 * @param utcTimestamp - UTC ISO string
 * @param userTz - IANA timezone string
 * @returns Object with local date and time for form prefill
 */
export function utcToLocal(utcTimestamp: string, userTz: string): {
  dueDate: string;    // YYYY-MM-DD
  dueTime: string;    // HH:mm in 24-hour format
} {
  try {
    const utcDateTime = DateTime.fromISO(utcTimestamp, { zone: 'utc' });
    const localDateTime = utcDateTime.setZone(userTz);
    
    return {
      dueDate: localDateTime.toISODate() || '',
      dueTime: localDateTime.toFormat('HH:mm')
    };
  } catch (error) {
    console.error('Error converting UTC to local:', error);
    return { dueDate: '', dueTime: '' };
  }
}

/**
 * Legacy functions - maintained for backward compatibility
 */
export function parseTaskDateTime(dueDate: string, dueTime: string, userTz: string): {
  due_at: string | null;
  due_time_db: string | null;
  due_date_db: string | null;
} {
  return computeDueAt(dueDate, dueTime, userTz);
}

export function buildDueAtUTC(dueDate: string, dueTime: string, userTz: string): string | null {
  const result = parseTaskDateTime(dueDate, dueTime, userTz);
  return result.due_at;
}



/**
 * Format UTC timestamp for display using Luxon
 * @param utcTimestamp - UTC ISO string
 * @param userTz - IANA timezone string
 * @returns formatted local time string
 */
export function formatUtcInTimezone(utcTimestamp: string, userTz?: string): string {
  try {
    const utcDateTime = DateTime.fromISO(utcTimestamp, { zone: 'utc' });
    const localDateTime = userTz ? utcDateTime.setZone(userTz) : utcDateTime;
    
    // Format: "8/18/2025 at 9:45 AM"
    return localDateTime.toFormat('L/d/yyyy [at] h:mm a');
  } catch (error) {
    console.error('Error formatting UTC time with Luxon:', error);
    return utcTimestamp.slice(0, 10);
  }
}

/**
 * Get server timezone and current time info for debugging using Luxon
 * @param userTimezone - User's IANA timezone string
 * @returns debug time info
 */
export function getDebugTimeInfo(userTimezone?: string) {
  const now = DateTime.utc();
  
  return {
    tzServer: Intl.DateTimeFormat().resolvedOptions().timeZone,
    nowUtc: now.toISO(),
    nowLocalForUser: userTimezone ? now.setZone(userTimezone).toISO() : now.toISO()
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
      start: startTime.toISO() || '',
      end: endTime.toISO() || ''
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
      dueDate: localDateTime.toISODate() || '',
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