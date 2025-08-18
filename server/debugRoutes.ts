/**
 * Debug routes for timezone and calendar troubleshooting
 * Enhanced version with unified time handling and idempotent calendar operations
 */
import type { Express } from "express";
import { pool } from "./db";
import { storage } from "./storage";
import { googleCalendarService } from "./googleCalendar";
import { computeDueAt, getDebugTimeInfo } from "./utils/timeHandling";
import { syncAllCalendarEventsForTask, getTaskCalendarDebugInfo } from "./calendarEvents";
import { DateTime } from 'luxon';

// Environment variable for sync control
export let CALENDAR_SYNC_ENABLED = process.env.CALENDAR_SYNC_ENABLED !== 'false';

export function SYNC_ENABLED(): boolean {
  return CALENDAR_SYNC_ENABLED;
}

// Helper function to get user by email or ID
async function getEffectiveUser(identifier?: string) {
  if (!identifier) return null;
  
  // Try email first, then user ID  
  try {
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1 OR id = $1', [identifier]);
    if (userResult.rows.length > 0) {
      return userResult.rows[0];
    }
    
    // Try team members table
    const memberResult = await pool.query('SELECT * FROM team_members WHERE email = $1 OR id = $1', [identifier]);
    if (memberResult.rows.length > 0) {
      return memberResult.rows[0];
    }
    
    throw new Error(`User not found for email: ${identifier}`);
  } catch (error) {
    throw error;
  }
}

// Get user from session or impersonation parameter
async function getSessionOrImpersonatedUser(req: any) {
  const impersonatedEmail = req.query.as;
  
  if (impersonatedEmail) {
    return await getEffectiveUser(impersonatedEmail);
  }
  
  // Try session auth
  if (req.session?.userId) {
    return await getEffectiveUser(req.session.userId);
  }
  
  return null;
}

// Resolve user and their tokens
async function resolveUserAndTokens(req: any) {
  const user = await getSessionOrImpersonatedUser(req);
  if (!user) {
    throw new Error('User not found');
  }
  
  // Get OAuth tokens
  const tokenResult = await pool.query('SELECT * FROM oauth_tokens WHERE user_id = $1', [user.id]);
  const tokens = tokenResult.rows[0] || null;
  
  return { user, tokens };
}

export function registerDebugRoutes(app: Express) {
  console.log('Mounted debug routes at /debug');
  
  // Debug time endpoint
  app.get('/debug/time', async (req: any, res) => {
    try {
      const user = await getSessionOrImpersonatedUser(req);
      const userTimezone = user?.timezone || 'America/Vancouver';
      
      const timeInfo = getDebugTimeInfo(userTimezone);
      
      res.json({
        ...timeInfo,
        userEmail: user?.email || null,
        userTimezone
      });
    } catch (error) {
      console.error('Error in debug/time:', error);
      res.status(500).json({ message: 'Failed to get time info', error: error.message });
    }
  });
  
  // Debug calendar status
  app.get('/debug/calendar-status', async (req: any, res) => {
    try {
      const { user, tokens } = await resolveUserAndTokens(req);
      const keyType = req.query.as ? 'impersonated' : 'session';
      
      res.json({
        hasTokens: !!tokens,
        keyType,
        user: {
          id: user.id,
          email: user.email,
          name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim()
        },
        tokenInfo: tokens ? {
          access_token: `${tokens.access_token?.substring(0, 10)}...`,
          refresh_token: `${tokens.refresh_token?.substring(0, 10)}...`,
          expires_at: tokens.expires_at,
          created_at: tokens.created_at
        } : null
      });
    } catch (error) {
      console.error('Error in debug/calendar-status:', error);
      res.status(500).json({ message: 'Failed to get calendar status', error: error.message });
    }
  });
  
  // Debug task calendar info
  app.get('/debug/task/:taskId/calendar', async (req: any, res) => {
    try {
      const { taskId } = req.params;
      const userEmail = req.query.as;
      
      const debugInfo = await getTaskCalendarDebugInfo(taskId, userEmail);
      
      res.json(debugInfo);
    } catch (error) {
      console.error('Error in debug/task/calendar:', error);
      res.status(500).json({ message: 'Failed to get task calendar debug info', error: error.message });
    }
  });
  
  // Debug: dump tokens (redacted)
  app.get('/debug/tokens/dump', async (req: any, res) => {
    try {
      const { user } = await resolveUserAndTokens(req);
      
      const tokenResult = await pool.query(`
        SELECT user_id, 
               LEFT(access_token, 10) || '...' as access_token_preview,
               LEFT(refresh_token, 10) || '...' as refresh_token_preview,
               expires_at, created_at, updated_at
        FROM oauth_tokens 
        WHERE user_id = $1
      `, [user.id]);
      
      res.json({
        user: { id: user.id, email: user.email },
        tokens: tokenResult.rows
      });
    } catch (error) {
      console.error('Error in debug/tokens/dump:', error);
      res.status(500).json({ message: 'Failed to dump tokens', error: error.message });
    }
  });
  
  // Debug: my tasks
  app.get('/debug/my-tasks', async (req: any, res) => {
    try {
      const { user } = await resolveUserAndTokens(req);
      const session = req.session?.userId;
      const impersonated = req.query.as;
      
      // Find team member record
      const memberResult = await pool.query('SELECT * FROM team_members WHERE email = $1', [user.email]);
      const teamMember = memberResult.rows[0];
      const teamMemberId = teamMember?.id;
      
      // Guard against missing team member
      if (!teamMemberId) {
        return res.status(400).json({ message: "No team member found for this user" });
      }
      
      // Get tasks assigned to this team member with explicit select and safe aggregation
      const rows = await pool.query(`
        SELECT
          t.id,
          t.title,
          t.status,                 -- status from tasks table
          t.due_date,
          t.due_time,
          t.due_at,
          t.organization_id,
          t.project_id,
          t.created_at,
          COALESCE(
            json_agg(ta.team_member_id) FILTER (WHERE ta.team_member_id IS NOT NULL),
            '[]'
          ) AS assignee_team_member_ids
        FROM tasks t
        LEFT JOIN task_assignments ta ON ta.task_id = t.id
        WHERE ta.team_member_id = $1  -- tasks assigned to this team member
        GROUP BY t.id
        ORDER BY t.due_at NULLS LAST, t.created_at DESC
        LIMIT 200
      `, [teamMemberId]);
      
      res.json({
        tasks: rows.rows.map(r => ({
          id: r.id,
          title: r.title,
          status: r.status,
          due_date: r.due_date,
          due_time: r.due_time,
          due_at: r.due_at,
          organization_id: r.organization_id,
          project_id: r.project_id,
          created_at: r.created_at,
          assigneeTeamMemberIds: r.assignee_team_member_ids
        })),
        teamMemberId,
        userId: user.id,
        email: user.email,
        sessionExists: !!session,
        impersonated: !!impersonated
      });
    } catch (error) {
      console.error('Error in debug/my-tasks:', error);
      res.status(500).json({ message: 'Failed to fetch my tasks', stack: error.stack });
    }
  });
  
  // Debug: create test task with proper timezone handling
  app.post('/debug/create-test-task', async (req: any, res) => {
    try {
      const { user } = await resolveUserAndTokens(req);
      
      const { title = 'Debug Test Task', dueDate, dueTime, timezone = 'America/Vancouver' } = req.body;
      
      // Compute due_at using unified time handling
      const dueAt = computeDueAt(dueDate, dueTime, timezone);
      
      const taskData = {
        title,
        description: 'Created via debug endpoint for testing',
        dueDate: dueDate ? dueDate : null,
        dueTime: dueTime || null,
        dueAt: dueAt ? dueAt : null,
        status: 'in_progress' as const,
        priority: 'medium' as const,
        taskScope: 'project' as const,
        projectId: null,
        organizationId: null,
        serviceId: null
      };
      
      const task = await storage.createTask(taskData);
      
      // Find team member and create assignment
      const memberResult = await pool.query('SELECT * FROM team_members WHERE email = $1', [user.email]);
      const teamMember = memberResult.rows[0];
      
      let assignment = null;
      if (teamMember) {
        assignment = await storage.createTaskAssignment({
          taskId: task.id,
          teamMemberId: teamMember.id,
          assignedBy: user.id,
        });
        
        // Sync calendar events
        try {
          await syncAllCalendarEventsForTask(task.id);
        } catch (calendarError) {
          console.error('Calendar sync error:', calendarError);
        }
      }
      
      res.json({
        message: 'Test task created successfully',
        task,
        assignment,
        computedDueAt: dueAt,
        timezone
      });
    } catch (error) {
      console.error('Error creating test task:', error);
      res.status(500).json({ message: 'Failed to create test task', error: error.message });
    }
  });
  
  // Debug: sync controls
  app.post('/debug/sync/disable', (req: any, res) => {
    CALENDAR_SYNC_ENABLED = false;
    console.log('🛑 Calendar sync DISABLED');
    res.json({ message: 'Calendar sync disabled', enabled: false });
  });
  
  app.post('/debug/sync/enable', (req: any, res) => {
    CALENDAR_SYNC_ENABLED = true;
    console.log('✅ Calendar sync ENABLED');
    res.json({ message: 'Calendar sync enabled', enabled: true });
  });
  
  app.get('/debug/sync/status', (req: any, res) => {
    res.json({ 
      enabled: CALENDAR_SYNC_ENABLED,
      envVar: process.env.CALENDAR_SYNC_ENABLED
    });
  });
  
  // Debug: manual task sync
  app.post('/debug/task/:taskId/sync', async (req: any, res) => {
    try {
      const { taskId } = req.params;
      const syncedCount = await syncAllCalendarEventsForTask(taskId);
      
      res.json({
        message: `Synced ${syncedCount} calendar events for task ${taskId}`,
        taskId,
        syncedCount,
        syncEnabled: CALENDAR_SYNC_ENABLED
      });
    } catch (error) {
      console.error('Error syncing task calendar events:', error);
      res.status(500).json({ message: 'Failed to sync calendar events', error: error.message });
    }
  });
  
  // Debug: emergency kill switch for runaway tasks
  app.post('/debug/emergency/kill-sync', async (req: any, res) => {
    try {
      CALENDAR_SYNC_ENABLED = false;
      console.log('🚨 EMERGENCY: Calendar sync KILLED');
      
      res.json({ 
        message: 'EMERGENCY: Calendar sync killed', 
        enabled: false,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error in emergency kill:', error);
      res.status(500).json({ message: 'Failed to kill sync', error: error.message });
    }
  });
  
  // Debug: backfill due_at for existing tasks
  app.post('/debug/backfill-due-at', async (req: any, res) => {
    try {
      const { timezone = 'America/Vancouver', dryRun = true } = req.body;
      
      // Get tasks that have due_date but no due_at
      const tasksResult = await pool.query(`
        SELECT id, title, due_date, due_time, due_at
        FROM tasks 
        WHERE due_date IS NOT NULL AND due_at IS NULL AND deleted_at IS NULL
        ORDER BY due_date
      `);
      
      const tasks = tasksResult.rows;
      const updates = [];
      
      for (const task of tasks) {
        const dueDate = task.due_date.toISOString().split('T')[0]; // YYYY-MM-DD
        const dueTime = task.due_time || '00:00';
        
        const dueAt = computeDueAt(dueDate, dueTime, timezone);
        
        updates.push({
          id: task.id,
          title: task.title,
          due_date: dueDate,
          due_time: dueTime,
          computed_due_at: dueAt
        });
        
        if (!dryRun && dueAt) {
          await pool.query('UPDATE tasks SET due_at = $1 WHERE id = $2', [dueAt, task.id]);
        }
      }
      
      res.json({
        message: dryRun ? 'Dry run completed' : `Updated ${updates.length} tasks`,
        timezone,
        dryRun,
        updates
      });
    } catch (error) {
      console.error('Error in backfill due_at:', error);
      res.status(500).json({ message: 'Failed to backfill due_at', error: error.message });
    }
  });
}