/**
 * Client-side time formatting utilities that work with the unified time handling system
 */

/**
 * Format due_at timestamp for display in user's local timezone
 * @param dueAt - UTC ISO string from due_at field
 * @returns formatted string like "8/17/2025 at 8:35 PM" or just "8/17/2025" for all-day
 */
export function formatDueAt(dueAt: string): string {
  try {
    const date = new Date(dueAt);
    
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric'
    });
    
    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    const dateStr = dateFormatter.format(date);
    const timeStr = timeFormatter.format(date);
    
    // Check if it's midnight (all-day task)
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    
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
 * Get the user's current timezone
 * @returns IANA timezone string
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch (error) {
    return "America/Los_Angeles"; // Default fallback
  }
}

/**
 * Check if a date is overdue
 * @param dueAt - UTC ISO string or null
 * @returns true if overdue
 */
export function isOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  
  try {
    const dueDate = new Date(dueAt);
    const now = new Date();
    return dueDate < now;
  } catch (error) {
    return false;
  }
}

/**
 * Get relative time string (e.g., "in 2 hours", "3 days ago")
 * @param dueAt - UTC ISO string
 * @returns relative time string
 */
export function getRelativeTime(dueAt: string): string {
  try {
    const date = new Date(dueAt);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMs < 0) {
      // Overdue
      const absDays = Math.abs(diffDays);
      const absHours = Math.abs(diffHours);
      const absMinutes = Math.abs(diffMinutes);
      
      if (absDays > 0) {
        return `${absDays} day${absDays !== 1 ? 's' : ''} ago`;
      } else if (absHours > 0) {
        return `${absHours} hour${absHours !== 1 ? 's' : ''} ago`;
      } else if (absMinutes > 0) {
        return `${absMinutes} minute${absMinutes !== 1 ? 's' : ''} ago`;
      } else {
        return 'Just now';
      }
    } else {
      // Future
      if (diffDays > 0) {
        return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
      } else if (diffHours > 0) {
        return `in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
      } else if (diffMinutes > 0) {
        return `in ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
      } else {
        return 'Now';
      }
    }
  } catch (error) {
    return '';
  }
}