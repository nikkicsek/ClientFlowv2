/**
 * Unified time handling utilities for task due dates
 * 
 * Canonical field: tasks.due_at (UTC timestamp)
 * Display fields: due_date/due_time (optional, for display only)
 */

/**
 * Compute due_at from dueDate, dueTime, and timezone
 * @param dueDate - "YYYY-MM-DD" format
 * @param dueTime - "HH:mm" format (optional)
 * @param timezone - IANA timezone string (e.g., "America/Los_Angeles")
 * @returns UTC ISO string for due_at, or null if invalid
 */
export function computeDueAt(dueDate: string | null, dueTime: string | null, timezone: string): string | null {
  if (!dueDate) return null;
  
  // Default to 00:00 if no time provided
  const timeStr = dueTime || "00:00";
  
  try {
    // Create a date string in the user's timezone
    const dateTimeStr = `${dueDate}T${timeStr}:00`;
    
    // Parse as a date in the given timezone and convert to UTC
    const date = new Date(`${dateTimeStr}${getTimezoneOffset(timezone)}`);
    
    if (isNaN(date.getTime())) {
      return null;
    }
    
    return date.toISOString();
  } catch (error) {
    console.error('Error computing due_at:', error);
    return null;
  }
}

/**
 * Backfill dueDate and dueTime from due_at for display
 * @param dueAt - UTC ISO string
 * @param timezone - IANA timezone string for display
 * @returns { dueDate, dueTime } in the specified timezone
 */
export function backfillDisplayFields(dueAt: string, timezone: string): { dueDate: string; dueTime: string } {
  try {
    const date = new Date(dueAt);
    
    // Convert to the specified timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(date);
    const dateParts = parts.filter(p => ['year', 'month', 'day'].includes(p.type));
    const timeParts = parts.filter(p => ['hour', 'minute'].includes(p.type));
    
    const dueDate = `${dateParts.find(p => p.type === 'year')?.value}-${dateParts.find(p => p.type === 'month')?.value}-${dateParts.find(p => p.type === 'day')?.value}`;
    const dueTime = `${timeParts.find(p => p.type === 'hour')?.value}:${timeParts.find(p => p.type === 'minute')?.value}`;
    
    return { dueDate, dueTime };
  } catch (error) {
    console.error('Error backfilling display fields:', error);
    return { dueDate: dueAt.slice(0, 10), dueTime: "00:00" };
  }
}

/**
 * Format due_at for display in local timezone
 * @param dueAt - UTC ISO string
 * @param timezone - IANA timezone string for display
 * @returns formatted string like "8/17/2025 at 8:35 PM"
 */
export function formatDueAt(dueAt: string, timezone: string): string {
  try {
    const date = new Date(dueAt);
    
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'numeric',
      day: 'numeric',
      year: 'numeric'
    });
    
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    const dateStr = dateFormatter.format(date);
    const timeStr = timeFormatter.format(date);
    
    // Check if it's midnight (all-day task)
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    
    if (hours === 0 && minutes === 0 && seconds === 0) {
      return dateStr; // Just date for all-day tasks
    }
    
    return `${dateStr} at ${timeStr}`;
  } catch (error) {
    console.error('Error formatting due_at:', error);
    return dueAt.slice(0, 10);
  }
}

/**
 * Get timezone offset string for a given timezone
 * @param timezone - IANA timezone string
 * @returns offset string like "-08:00" or "+05:30"
 */
function getTimezoneOffset(timezone: string): string {
  try {
    const now = new Date();
    const utc = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
    const targetTime = new Date(utc.toLocaleString('en-US', { timeZone: timezone }));
    const diff = targetTime.getTime() - utc.getTime();
    
    const hours = Math.floor(Math.abs(diff) / (1000 * 60 * 60));
    const minutes = Math.floor((Math.abs(diff) % (1000 * 60 * 60)) / (1000 * 60));
    
    const sign = diff >= 0 ? '+' : '-';
    return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  } catch (error) {
    console.error('Error getting timezone offset:', error);
    return '+00:00'; // Default to UTC
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
    const date = new Date(dueAt);
    // Check if it's exactly midnight UTC (likely an all-day task)
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const seconds = date.getUTCSeconds();
    
    return !(hours === 0 && minutes === 0 && seconds === 0);
  } catch (error) {
    return false;
  }
}