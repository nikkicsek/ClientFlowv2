import { googleCalendarService } from '../googleCalendar';
import { storage } from '../storage';

export const onTaskCreatedOrUpdated = async (taskId: string) => {
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
  try {
    console.log('Calendar hook', { assignmentId, action: 'assignment_deleted' });
    await deleteAssignmentCalendarEvent(assignmentId);
  } catch (error) {
    console.error('Error in onAssignmentDeleted:', error);
  }
};

// Idempotent calendar event sync for task assignments
async function syncAssignmentCalendarEvent(assignmentId: string) {
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

    // Find user by email
    const user = await storage.getUserByEmail(assignment.teamMember.email);
    if (!user) {
      console.error('User not found for email:', assignment.teamMember.email);
      return;
    }

    // Check if we already have a calendar event ID
    const existingEventId = assignment.calendarEventId;
    
    let eventId;
    if (existingEventId) {
      // Update existing event
      console.log('Calendar upsert', { taskId: task.id, userId: user.id, hadEventId: true, action: 'update' });
      const success = await googleCalendarService.updateTaskEvent(user.id, existingEventId, {
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        status: task.status,
        priority: task.priority
      });
      if (success) {
        eventId = existingEventId;
      }
    } else {
      // Create new event
      console.log('Calendar upsert', { taskId: task.id, userId: user.id, hadEventId: false, action: 'insert' });
      eventId = await googleCalendarService.createTaskEvent(user.id, {
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        status: task.status,
        priority: task.priority
      });
      
      // Store the event ID in the assignment
      if (eventId) {
        await storage.updateTaskAssignment(assignmentId, { calendarEventId: eventId });
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
