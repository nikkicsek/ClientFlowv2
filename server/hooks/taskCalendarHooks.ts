import { googleCalendarService } from '../googleCalendar';
import { SYNC_ENABLED } from '../debugRoutes';
import { storage } from '../storage';
import { shouldCreateTimedEvent, backfillDisplayFields } from '../utils/timeHandling';

export const onTaskCreatedOrUpdated = async (taskId: string) => {
  if (!SYNC_ENABLED) { 
    console.log('Calendar sync disabled - onTaskCreatedOrUpdated skipped'); 
    return; 
  }
  try {
    console.log('Calendar hook', { taskId, action: 'task_created_or_updated' });
    
    // Get all assignments for this task and sync their calendar events
    const assignments = await storage.getTaskAssignments(taskId);
    for (const assignment of assignments) {
      await syncAssignmentCalendarEvent(assignment.id);
    }
  } catch (error) {
    console.error('Error in onTaskCreatedOrUpdated:', error);
  }
};

export const onTaskDeleted = async (taskId: string) => {
  try {
    console.log('Calendar hook', { taskId, action: 'task_deleted' });
    // delete all assignment events
    const assignments = await storage.getTaskAssignments(taskId);
    for (const assignment of assignments) {
      try { 
        console.log('Calendar hook', { taskId, assignmentId: assignment.id, action: 'delete_assignment_event' });
        await deleteAssignmentCalendarEvent(assignment.id);
      } catch (e) {
        console.error('Error deleting assignment calendar event:', e);
      }
    }
  } catch (error) {
    console.error('Error in onTaskDeleted:', error);
  }
};

export const onAssignmentCreated = async (assignmentId: string) => {
  if (!SYNC_ENABLED) { 
    console.log('Calendar sync disabled - onAssignmentCreated skipped'); 
    return; 
  }
  try {
    // Get the assignment to find the userId
    const assignment = await storage.getTaskAssignment(assignmentId);
    if (assignment) {
      const teamMember = assignment.teamMember;
      // Find user by email
      const user = await storage.getUserByEmail(teamMember.email);
      const userId = user?.id;
      console.log('Calendar hook', { taskId: assignment.taskId, userId, assignmentId, action: 'assignment_created' });
    }
    await syncAssignmentCalendarEvent(assignmentId);
  } catch (error) {
    console.error('Error in onAssignmentCreated:', error);
  }
};

export const onAssignmentDeleted = async (assignmentId: string) => {
  if (!SYNC_ENABLED) { 
    console.log('Calendar sync disabled - onAssignmentDeleted skipped'); 
    return; 
  }
  try {
    console.log('Calendar hook', { assignmentId, action: 'assignment_deleted' });
    await deleteAssignmentCalendarEvent(assignmentId);
  } catch (error) {
    console.error('Error in onAssignmentDeleted:', error);
  }
};

export const onTaskUpdated = async (taskId: string) => {
  if (!SYNC_ENABLED) { 
    console.log('Calendar sync disabled - onTaskUpdated skipped'); 
    return; 
  }
  try {
    console.log('Calendar hook', { taskId, action: 'task_updated' });
    
    // Get all assignments for this task and sync their calendar events
    const assignments = await storage.getTaskAssignments(taskId);
    for (const assignment of assignments) {
      await syncAssignmentCalendarEvent(assignment.id);
    }
  } catch (error) {
    console.error('Error in onTaskUpdated:', error);
  }
};

// Idempotent calendar event sync for task assignments
async function syncAssignmentCalendarEvent(assignmentId: string) {
  if (!SYNC_ENABLED) { 
    console.log('Calendar sync disabled - syncAssignmentCalendarEvent skipped'); 
    return; 
  }
  try {
    const assignment = await storage.getTaskAssignment(assignmentId);
    if (!assignment) {
      console.error('Assignment not found:', assignmentId);
      return;
    }

    const task = await storage.getTask(assignment.taskId);
    if (!task) {
      console.error('Task not found for assignment:', assignmentId);
      return;
    }

    // Use due_at as the canonical time field, fallback to dueDate/dueTime for legacy tasks
    let taskDueDate, taskDueTime;
    if (task.dueAt) {
      // Use unified time handling - backfill display fields from due_at
      const timezone = "America/Los_Angeles"; // Default timezone for Nikki
      const display = backfillDisplayFields(task.dueAt.toISOString(), timezone);
      taskDueDate = display.dueDate;
      taskDueTime = display.dueTime;
    } else if (task.dueDate) {
      // Legacy fallback
      taskDueDate = task.dueDate instanceof Date ? task.dueDate.toISOString().slice(0, 10) : task.dueDate;
      taskDueTime = task.dueTime;
    } else {
      console.log('Calendar sync skipped - task lacks due date:', { taskId: task.id });
      return;
    }
    
    // Check if this should be a timed event
    const isTimedEvent = shouldCreateTimedEvent(task.dueAt?.toISOString() || null, taskDueTime);
    if (!isTimedEvent && !taskDueTime) {
      console.log('Calendar sync skipped - all-day task without time:', { taskId: task.id, taskDueDate, taskDueTime });
      return;
    }

    // Find user by email
    const user = await storage.getUserByEmail(assignment.teamMember.email);
    if (!user) {
      console.error('User not found for email:', assignment.teamMember.email);
      return;
    }

    // IDEMPOTENCY: Check if we already have a calendar event ID
    const existingEventId = assignment.calendarEventId;
    
    let eventId;
    if (existingEventId) {
      // Update existing event (idempotent)
      console.log('Calendar upsert', { taskId: task.id, userId: user.id, assignmentId, hadEventId: true, action: 'update' });
      const success = await googleCalendarService.updateTaskEvent(user.id, existingEventId, {
        title: task.title,
        description: task.description,
        dueDate: taskDueDate,
        dueTime: taskDueTime,
        status: task.status,
        priority: task.priority
      });
      if (success) {
        eventId = existingEventId;
      }
    } else {
      // Create new event only if no existing event ID
      console.log('Calendar upsert', { taskId: task.id, userId: user.id, assignmentId, hadEventId: false, action: 'insert' });
      eventId = await googleCalendarService.createTaskEvent(user.id, {
        title: task.title,
        description: task.description,
        dueDate: taskDueDate,
        dueTime: taskDueTime,
        status: task.status,
        priority: task.priority
      });
      
      // Store the event ID in the assignment for future idempotency
      if (eventId) {
        await storage.updateTaskAssignment(assignmentId, { calendarEventId: eventId });
        console.log('Calendar event ID saved:', { assignmentId, eventId });
      }
    }
  } catch (error) {
    console.error('Error syncing assignment calendar event:', error);
  }
}

async function deleteAssignmentCalendarEvent(assignmentId: string) {
  try {
    const assignment = await storage.getTaskAssignment(assignmentId);
    if (!assignment?.calendarEventId) {
      return; // No calendar event to delete
    }

    // Find user by email
    const user = await storage.getUserByEmail(assignment.teamMember.email);
    if (!user) {
      console.error('User not found for email:', assignment.teamMember.email);
      return;
    }

    // Delete the calendar event
    const success = await googleCalendarService.deleteTaskEvent(user.id, assignment.calendarEventId);
    if (success) {
      // Clear the calendar event ID from the assignment
      await storage.updateTaskAssignment(assignmentId, { calendarEventId: null });
    }
  } catch (error) {
    console.error('Error deleting assignment calendar event:', error);
  }
}
