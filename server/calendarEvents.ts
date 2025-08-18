/**
 * Idempotent Google Calendar event management for tasks
 * Implements deterministic event IDs and upsert operations
 */
import { googleCalendarService } from './googleCalendar';
import { SYNC_ENABLED } from './debugRoutes';
import { storage } from './storage';
import { pool } from './db';
import { generateCalendarEventId, computeCalendarEventTimes } from './utils/timeHandling';
import { DateTime } from 'luxon';

export interface CalendarEventData {
  taskId: string;
  userId: string;
  title: string;
  description?: string;
  dueAt: string;
  timezone: string;
  taskUrl?: string;
}

/**
 * Upsert a Google Calendar event for a task assignment (idempotent)
 * Uses deterministic event ID: task-{taskId}-{userId}
 * @param eventData - Calendar event data
 * @returns Google Calendar event ID or null if failed/disabled
 */
export async function upsertCalendarEventForTask(eventData: CalendarEventData): Promise<string | null> {
  if (!SYNC_ENABLED()) {
    console.log('Calendar sync disabled - skipping event upsert');
    return null;
  }

  try {
    const { taskId, userId, title, description, dueAt, timezone, taskUrl } = eventData;
    
    // Generate deterministic event ID
    const eventId = generateCalendarEventId(taskId, userId);
    
    // Compute event times with 60-minute duration
    const { start, end } = computeCalendarEventTimes(dueAt, timezone, 60);
    
    // Check if we already have a Google event ID stored
    const existingAssignment = await pool.query(
      'SELECT calendar_event_id FROM task_assignments WHERE task_id = $1 AND team_member_id = $2',
      [taskId, userId]
    );
    
    const googleEventId = existingAssignment.rows[0]?.calendar_event_id;
    
    // Prepare event data
    const eventPayload = {
      summary: title,
      description: description ? `${description}\n\n${taskUrl || ''}` : taskUrl,
      start: {
        dateTime: start,
        timeZone: timezone
      },
      end: {
        dateTime: end,
        timeZone: timezone
      },
      extendedProperties: {
        private: {
          taskId: taskId,
          userId: userId
        }
      }
    };

    let finalEventId: string;
    
    if (googleEventId) {
      // Update existing event
      console.log(`Updating calendar event ${googleEventId} for task ${taskId}, user ${userId}`);
      finalEventId = await googleCalendarService.updateTaskEvent(userId, googleEventId, eventPayload);
    } else {
      // Create new event  
      console.log(`Creating calendar event for task ${taskId}, user ${userId}`);
      finalEventId = await googleCalendarService.createTaskEvent(userId, {
        title,
        description,
        dueDate: dueAt,
        status: 'in_progress',
        priority: 'medium'
      });
      
      // Store the event ID in task_assignments
      if (finalEventId) {
        await pool.query(
          'UPDATE task_assignments SET calendar_event_id = $1, updated_at = NOW() WHERE task_id = $2 AND team_member_id = $3',
          [finalEventId, taskId, userId]
        );
      }
    }
    
    return finalEventId;
    
  } catch (error) {
    console.error(`Error upserting calendar event for task ${eventData.taskId}, user ${eventData.userId}:`, error);
    return null;
  }
}

/**
 * Delete Google Calendar event for a task assignment
 * @param taskId - Task ID
 * @param userId - User/Team member ID
 * @returns true if successful
 */
export async function deleteCalendarEventForTask(taskId: string, userId: string): Promise<boolean> {
  if (!SYNC_ENABLED()) {
    console.log('Calendar sync disabled - skipping event deletion');
    return true;
  }

  try {
    // Get the stored Google event ID
    const assignment = await pool.query(
      'SELECT calendar_event_id FROM task_assignments WHERE task_id = $1 AND team_member_id = $2',
      [taskId, userId]
    );
    
    const googleEventId = assignment.rows[0]?.calendar_event_id;
    
    if (googleEventId) {
      console.log(`Deleting calendar event ${googleEventId} for task ${taskId}, user ${userId}`);
      
      try {
        await googleCalendarService.deleteTaskEvent(userId, googleEventId);
      } catch (error) {
        console.warn(`Failed to delete calendar event ${googleEventId}:`, error);
        // Continue to clear the stored ID even if deletion failed
      }
      
      // Clear the event ID from task_assignments
      await pool.query(
        'UPDATE task_assignments SET calendar_event_id = NULL, updated_at = NOW() WHERE task_id = $1 AND team_member_id = $2',
        [taskId, userId]
      );
    }
    
    return true;
  } catch (error) {
    console.error(`Error deleting calendar event for task ${taskId}, user ${userId}:`, error);
    return false;
  }
}

/**
 * Sync all calendar events for a task (called after task create/update)
 * @param taskId - Task ID
 * @returns number of events synced
 */
export async function syncAllCalendarEventsForTask(taskId: string): Promise<number> {
  if (!SYNC_ENABLED()) {
    return 0;
  }

  try {
    // Get task details and all assignments
    const taskResult = await pool.query(`
      SELECT t.*, 
             array_agg(ta.team_member_id) FILTER (WHERE ta.team_member_id IS NOT NULL) as assigned_team_members
      FROM tasks t
      LEFT JOIN task_assignments ta ON t.id = ta.task_id 
      WHERE t.id = $1 AND t.deleted_at IS NULL
      GROUP BY t.id
    `, [taskId]);
    
    if (taskResult.rows.length === 0) {
      console.warn(`Task ${taskId} not found for calendar sync`);
      return 0;
    }
    
    const task = taskResult.rows[0];
    const assignedMembers = task.assigned_team_members || [];
    
    if (!task.due_at || assignedMembers.length === 0) {
      console.log(`Task ${taskId} has no due_at or assignees - skipping calendar sync`);
      return 0;
    }
    
    let synced = 0;
    
    // Create/update calendar event for each assigned team member
    for (const memberId of assignedMembers) {
      try {
        const eventData: CalendarEventData = {
          taskId: task.id,
          userId: memberId,
          title: task.title,
          description: task.description,
          dueAt: task.due_at,
          timezone: 'America/Vancouver', // Default timezone - could be made configurable
          taskUrl: `${process.env.BASE_URL || ''}/tasks/${task.id}`
        };
        
        const eventId = await upsertCalendarEventForTask(eventData);
        if (eventId) {
          synced++;
        }
      } catch (error) {
        console.error(`Failed to sync calendar event for task ${taskId}, member ${memberId}:`, error);
      }
    }
    
    console.log(`Synced ${synced} calendar events for task ${taskId}`);
    return synced;
    
  } catch (error) {
    console.error(`Error syncing calendar events for task ${taskId}:`, error);
    return 0;
  }
}

/**
 * Get calendar event debug info for a task
 * @param taskId - Task ID
 * @param userEmail - Optional user email for filtering
 * @returns debug information
 */
export async function getTaskCalendarDebugInfo(taskId: string, userEmail?: string) {
  try {
    const query = `
      SELECT t.id, t.title, t.due_at, t.due_date, t.due_time,
             ta.team_member_id, ta.google_event_id, ta.updated_at as assignment_updated_at,
             tm.name as team_member_name, tm.email as team_member_email
      FROM tasks t
      LEFT JOIN task_assignments ta ON t.id = ta.task_id
      LEFT JOIN team_members tm ON ta.team_member_id = tm.id
      WHERE t.id = $1 AND t.deleted_at IS NULL
      ${userEmail ? 'AND tm.email = $2' : ''}
      ORDER BY ta.created_at
    `;
    
    const params = userEmail ? [taskId, userEmail] : [taskId];
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return { task: null, assignments: [] };
    }
    
    const task = {
      id: result.rows[0].id,
      title: result.rows[0].title,
      due_at: result.rows[0].due_at,
      due_date: result.rows[0].due_date,
      due_time: result.rows[0].due_time
    };
    
    const assignments = result.rows
      .filter(row => row.team_member_id)
      .map(row => {
        const eventId = generateCalendarEventId(taskId, row.team_member_id);
        const timezone = 'America/Vancouver';
        const { start, end } = task.due_at 
          ? computeCalendarEventTimes(task.due_at, timezone, 60)
          : { start: null, end: null };
        
        return {
          team_member_id: row.team_member_id,
          team_member_name: row.team_member_name,
          team_member_email: row.team_member_email,
          google_event_id: row.google_event_id,
          deterministic_event_id: eventId,
          assignment_updated_at: row.assignment_updated_at,
          calculated_start: start,
          calculated_end: end,
          timezone
        };
      });
    
    return { task, assignments };
    
  } catch (error) {
    console.error(`Error getting calendar debug info for task ${taskId}:`, error);
    return { error: error.message };
  }
}