import { SYNC_ENABLED } from '../debugRoutes';
import { storage } from '../storage';

export const onTaskCreatedOrUpdated = async (taskId: string) => {
  if (!SYNC_ENABLED) { 
    console.log('Calendar sync disabled - onTaskCreatedOrUpdated skipped'); 
    return; 
  }
  try {
    console.log('Calendar hook', { taskId, action: 'task_created_or_updated' });
    
    // Use new auto-sync system for all assignments
    const assignments = await storage.getTaskAssignments(taskId);
    for (const assignment of assignments) {
      try {
        const teamMember = assignment.teamMember;
        const user = await storage.getUserByEmail(teamMember.email);
        if (user?.id) {
          const { calendarAutoSync } = await import('../calendarAutoSync');
          await calendarAutoSync.syncTaskIfEligible(taskId, user.id);
        }
      } catch (e) {
        console.error('Error syncing assignment calendar event:', e);
      }
    }
  } catch (error) {
    console.error('Error in onTaskCreatedOrUpdated:', error);
  }
};

export const onTaskDeleted = async (taskId: string) => {
  try {
    console.log('Calendar hook', { taskId, action: 'task_deleted' });
    // delete all assignment events using new auto-sync
    const assignments = await storage.getTaskAssignments(taskId);
    for (const assignment of assignments) {
      try { 
        console.log('Calendar hook', { taskId, assignmentId: assignment.id, action: 'delete_assignment_event' });
        const teamMember = assignment.teamMember;
        const user = await storage.getUserByEmail(teamMember.email);
        if (user?.id) {
          const { calendarAutoSync } = await import('../calendarAutoSync');
          await calendarAutoSync.deleteTaskEvent(taskId, user.id);
        }
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
    const assignment = await storage.getTaskAssignment(assignmentId);
    if (assignment) {
      const teamMember = assignment.teamMember;
      const user = await storage.getUserByEmail(teamMember.email);
      if (user?.id) {
        console.log('Calendar hook', { taskId: assignment.taskId, userId: user.id, assignmentId, action: 'assignment_created' });
        const { calendarAutoSync } = await import('../calendarAutoSync');
        await calendarAutoSync.syncTaskIfEligible(assignment.taskId, user.id);
      }
    }
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
    // Get assignment first to find task and user info
    const assignment = await storage.getTaskAssignment(assignmentId);
    if (assignment) {
      const teamMember = assignment.teamMember;
      const user = await storage.getUserByEmail(teamMember.email);
      if (user?.id) {
        const { calendarAutoSync } = await import('../calendarAutoSync');
        await calendarAutoSync.deleteTaskEvent(assignment.taskId, user.id);
      }
    }
  } catch (error) {
    console.error('Error in onAssignmentDeleted:', error);
  }
};

// Legacy functions removed - now using CalendarAutoSync system
