import { GoogleCalendarService } from '../calendar/GoogleCalendarService';
import { Pool } from 'pg';
import { pool } from '../db';
import { storage } from '../storage';

// Initialize calendar hooks with the database pool
const svc = new GoogleCalendarService(pool);

export const onTaskCreatedOrUpdated = async (taskId: string) => {
  try {
    console.log('Calendar hook', { taskId, action: 'task_created_or_updated' });
    await svc.reconcileTask(taskId);
  } catch (error) {
    console.error('Error in onTaskCreatedOrUpdated:', error);
  }
};

export const onTaskDeleted = async (taskId: string) => {
  try {
    console.log('Calendar hook', { taskId, action: 'task_deleted' });
    // delete all assignment events
    const assignments = await storage.getTaskAssignments(taskId);
    for (const a of assignments) {
      try { 
        console.log('Calendar hook', { taskId, assignmentId: a.id, action: 'delete_assignment_event' });
        await svc.deleteForAssignment(a.id); 
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
    await svc.upsertForAssignment(assignmentId);
  } catch (error) {
    console.error('Error in onAssignmentCreated:', error);
  }
};

export const onAssignmentDeleted = async (assignmentId: string) => {
  try {
    console.log('Calendar hook', { assignmentId, action: 'assignment_deleted' });
    await svc.deleteForAssignment(assignmentId);
  } catch (error) {
    console.error('Error in onAssignmentDeleted:', error);
  }
};
