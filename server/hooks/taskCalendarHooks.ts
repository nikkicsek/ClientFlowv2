import { GoogleCalendarService } from '../calendar/GoogleCalendarService';
import { Pool } from 'pg';
import { pool } from '../db';
import { storage } from '../storage';

// Initialize calendar hooks with the database pool
const svc = new GoogleCalendarService(pool);

export const onTaskCreatedOrUpdated = async (taskId: string) => {
  try {
    await svc.reconcileTask(taskId);
  } catch (error) {
    console.error('Error in onTaskCreatedOrUpdated:', error);
  }
};

export const onTaskDeleted = async (taskId: string) => {
  try {
    // delete all assignment events
    const assignments = await storage.getTaskAssignments(taskId);
    for (const a of assignments) {
      try { await svc.deleteForAssignment(a.id); } catch (e) {
        console.error('Error deleting assignment calendar event:', e);
      }
    }
  } catch (error) {
    console.error('Error in onTaskDeleted:', error);
  }
};

export const onAssignmentCreated = async (assignmentId: string) => {
  try {
    await svc.upsertForAssignment(assignmentId);
  } catch (error) {
    console.error('Error in onAssignmentCreated:', error);
  }
};

export const onAssignmentDeleted = async (assignmentId: string) => {
  try {
    await svc.deleteForAssignment(assignmentId);
  } catch (error) {
    console.error('Error in onAssignmentDeleted:', error);
  }
};
