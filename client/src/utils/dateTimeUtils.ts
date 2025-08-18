/**
 * Client-side date/time utilities for task handling
 * Focuses on minimal client processing, preserving raw strings
 */

/**
 * Format UTC timestamp to local date string (YYYY-MM-DD)
 */
export function formatLocalDate(utcTimestamp: string | Date): string {
  if (!utcTimestamp) return "";
  
  const date = new Date(utcTimestamp);
  return date.toISOString().split('T')[0];
}

/**
 * Format UTC timestamp to local time string (HH:mm 24-hour format)
 */
export function formatLocalTime(utcTimestamp: string | Date): string {
  if (!utcTimestamp) return "";
  
  const date = new Date(utcTimestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Validate time input format (accept various formats, return boolean)
 */
export function isValidTimeFormat(timeStr: string): boolean {
  if (!timeStr || typeof timeStr !== 'string') return false;
  
  const trimmed = timeStr.trim();
  
  // Patterns we accept:
  // - 24-hour: "21:30", "9:30", "09:30"
  // - 12-hour: "9:30 PM", "9:30PM", "9 PM", "9PM"
  // - Hour only: "21", "9"
  
  const patterns = [
    /^\d{1,2}:\d{2}\s*(AM|PM)?$/i,  // "9:30 PM", "21:30"
    /^\d{1,2}\s*(AM|PM)$/i,         // "9 PM", "9PM"
    /^\d{1,2}$/                     // "21", "9"
  ];
  
  return patterns.some(pattern => pattern.test(trimmed));
}

/**
 * Extract date and time from task data for form prefill
 */
export function extractTaskDateTime(task: any): { dueDate: string; dueTime: string } {
  // Priority: use due_at if available, fallback to due_date/due_time
  if (task.due_at) {
    return {
      dueDate: formatLocalDate(task.due_at),
      dueTime: formatLocalTime(task.due_at)
    };
  }
  
  // Fallback to direct fields
  const dueDate = task.due_date || task.dueDate;
  const dueTime = task.due_time || task.dueTime;
  
  return {
    dueDate: dueDate ? (typeof dueDate === 'string' ? dueDate.split('T')[0] : formatLocalDate(dueDate)) : "",
    dueTime: dueTime || ""
  };
}

/**
 * API payload adapter - converts camelCase to API shape
 */
export function adaptFormDataToAPI(formData: any): any {
  return {
    title: formData.title,
    description: formData.description,
    status: formData.status,
    priority: formData.priority,
    dueDate: formData.dueDate,
    dueTime: formData.dueTime,
    googleDriveLink: formData.googleDriveLink,
    // Add any snake_case conversions here if needed
  };
}