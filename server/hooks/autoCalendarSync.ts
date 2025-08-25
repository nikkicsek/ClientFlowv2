import { CalendarService } from '../services/CalendarService';
import { pool } from '../db';

// Auto-sync hooks for task lifecycle events
export class AutoCalendarSync {
  // Called on task CREATE and UPDATE
  static async onTaskChanged(taskId: string): Promise<void> {
    console.log(`[AUTO-SYNC] Task changed: ${taskId}`);
    
    try {
      // Get task assignments
      const assignmentResult = await pool.query(`
        SELECT ta.*, tm.email, u.id as user_id_direct
        FROM task_assignments ta
        LEFT JOIN team_members tm ON ta.team_member_id = tm.id
        LEFT JOIN users u ON tm.email = u.email
        WHERE ta.task_id = $1
      `, [taskId]);
      
      if (assignmentResult.rows.length === 0) {
        console.log(`[AUTO-SYNC] No assignments found for task: ${taskId}`);
        return;
      }
      
      // Process each assignment
      for (const assignment of assignmentResult.rows) {
        const userId = assignment.user_id_direct;
        const teamMemberId = assignment.team_member_id;
        
        if (!userId) {
          console.warn(`[AUTO-SYNC] No userId found for assignment: ${assignment.id}, team_member: ${assignment.email}`);
          continue;
        }
        
        try {
          const result = await CalendarService.upsertTaskEvent(taskId, userId, teamMemberId);
          console.log(`[AUTO-SYNC] Calendar event ${result.isUpdate ? 'updated' : 'created'} for userId: ${userId}, eventId: ${result.eventId}`);
        } catch (error: any) {
          console.error(`[AUTO-SYNC] Failed to sync calendar for userId: ${userId}, taskId: ${taskId}:`, error.message);
        }
      }
    } catch (error: any) {
      console.error(`[AUTO-SYNC] Failed to process task change: ${taskId}:`, error.message);
    }
  }

  // Called on task DELETE
  static async onTaskDeleted(taskId: string): Promise<void> {
    console.log(`[AUTO-SYNC] Task deleted: ${taskId}`);
    
    try {
      // Get all calendar mappings for this task
      const mappings = await CalendarService.getTaskMappings(taskId);
      
      for (const mapping of mappings) {
        try {
          await CalendarService.deleteTaskEvent(taskId, mapping.user_id);
          console.log(`[AUTO-SYNC] Calendar event deleted for userId: ${mapping.user_id}, taskId: ${taskId}`);
        } catch (error: any) {
          console.error(`[AUTO-SYNC] Failed to delete calendar event for userId: ${mapping.user_id}, taskId: ${taskId}:`, error.message);
        }
      }
    } catch (error: any) {
      console.error(`[AUTO-SYNC] Failed to process task deletion: ${taskId}:`, error.message);
    }
  }

  // Called on assignment CREATE
  static async onAssignmentCreated(taskId: string, userId: string, teamMemberId: string): Promise<void> {
    console.log(`[AUTO-SYNC] Assignment created: taskId: ${taskId}, userId: ${userId}, teamMemberId: ${teamMemberId}`);
    
    try {
      const result = await CalendarService.upsertTaskEvent(taskId, userId, teamMemberId);
      console.log(`[AUTO-SYNC] Calendar event created for new assignment: ${result.eventId}`);
    } catch (error: any) {
      console.error(`[AUTO-SYNC] Failed to create calendar event for assignment:`, error.message);
    }
  }

  // Called on assignment DELETE
  static async onAssignmentDeleted(taskId: string, userId: string): Promise<void> {
    console.log(`[AUTO-SYNC] Assignment deleted: taskId: ${taskId}, userId: ${userId}`);
    
    try {
      await CalendarService.deleteTaskEvent(taskId, userId);
      console.log(`[AUTO-SYNC] Calendar event deleted for removed assignment`);
    } catch (error: any) {
      console.error(`[AUTO-SYNC] Failed to delete calendar event for assignment:`, error.message);
    }
  }
}