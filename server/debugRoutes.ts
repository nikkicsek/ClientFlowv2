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
  
  // Get OAuth tokens (use user_id column)
  const tokenResult = await pool.query('SELECT * FROM oauth_tokens WHERE user_id = $1', [user.id]);
  const tokens = tokenResult.rows[0] || null;
  
  return { user, tokens };
}

// Resolve user from email with team member info
async function resolveUserFromEmail(email: string | undefined, req: any) {
  if (!email) {
    const user = await getSessionOrImpersonatedUser(req);
    if (!user) throw new Error('No user session or impersonation email provided');
    
    // Get team member ID if exists (matching by email since no user_id FK)
    const teamMemberResult = await pool.query('SELECT id FROM team_members WHERE email = $1', [user.email]);
    const teamMemberId = teamMemberResult.rows[0]?.id || null;
    
    return { user, teamMemberId };
  }
  
  // Try user table first
  let userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  let user = userResult.rows[0];
  
  // If no user, try team_members table (some users may only exist as team members)
  if (!user) {
    const teamMemberResult = await pool.query('SELECT * FROM team_members WHERE email = $1', [email]);
    if (teamMemberResult.rows.length === 0) {
      throw new Error(`User not found for email: ${email}`);
    }
    
    // Use team member as user for the purpose of this operation
    user = teamMemberResult.rows[0];
    return { user, teamMemberId: user.id };
  }
  
  // Get team member ID if exists
  const teamMemberResult = await pool.query('SELECT id FROM team_members WHERE email = $1', [user.email]);
  const teamMemberId = teamMemberResult.rows[0]?.id || null;
  
  return { user, teamMemberId };
}

// Enhanced user and token resolution (single source of truth)
async function resolveUserAndTokensEnhanced(params: { 
  asEmail?: string, 
  sessionUserId?: string, 
  assigneeTeamMemberId?: string 
}) {
  const { asEmail, sessionUserId, assigneeTeamMemberId } = params;
  
  let userId: string;
  let email: string;
  let teamMemberId: string | undefined;
  let tz = 'America/Vancouver'; // Default timezone

  // Step 1: Resolve userId and email
  if (asEmail) {
    // First check if it's a team member email
    const teamMemberResult = await pool.query('SELECT * FROM team_members WHERE email = $1', [asEmail]);
    if (teamMemberResult.rows.length > 0) {
      const teamMember = teamMemberResult.rows[0];
      teamMemberId = teamMember.id;
      
      // Get the app user that corresponds to this team member (by email matching)
      const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [teamMember.email]);
      if (userResult.rows.length === 0) {
        return { ok: false, reason: "no_user_for_team_member", teamMemberId, teamMemberEmail: teamMember.email };
      }
      const user = userResult.rows[0];
      userId = user.id;
      email = user.email;
      tz = teamMember.timezone || tz;
    } else {
      // Direct user lookup by email
      const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [asEmail]);
      if (userResult.rows.length === 0) {
        return { ok: false, reason: "user_not_found", email: asEmail };
      }
      const user = userResult.rows[0];
      userId = user.id;
      email = user.email;
    }
  } else if (assigneeTeamMemberId) {
    // Lookup team member, then resolve to userId by email (no FK relationship)
    const teamMemberResult = await pool.query('SELECT * FROM team_members WHERE id = $1', [assigneeTeamMemberId]);
    if (teamMemberResult.rows.length === 0) {
      return { ok: false, reason: "team_member_not_found", teamMemberId: assigneeTeamMemberId };
    }
    const teamMember = teamMemberResult.rows[0];
    teamMemberId = teamMember.id;
    
    // Find user by matching email (no FK relationship exists)
    console.log(`[ENHANCED] Looking for user with email: ${teamMember.email}`);
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [teamMember.email]);
    console.log(`[ENHANCED] User lookup result: ${userResult.rows.length} rows`);
    if (userResult.rows.length === 0) {
      console.log(`[ENHANCED] FAILED: No user found for team member email ${teamMember.email}`);
      return { ok: false, reason: "no_user_for_team_member", teamMemberId, teamMemberEmail: teamMember.email };
    }
    const user = userResult.rows[0];
    userId = user.id.toString(); // Ensure string type
    email = user.email;
    tz = teamMember.timezone || tz;
  } else if (sessionUserId) {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [sessionUserId]);
    if (userResult.rows.length === 0) {
      return { ok: false, reason: "user_not_found", userId: sessionUserId };
    }
    const user = userResult.rows[0];
    userId = user.id;
    email = user.email;
  } else {
    return { ok: false, reason: "no_user_context" };
  }

  // Step 2: Get OAuth tokens by userId (single source of truth)
  const tokenResult = await pool.query('SELECT * FROM oauth_tokens WHERE user_id = $1', [userId]);
  const tokens = tokenResult.rows[0] || null;
  
  if (!tokens) {
    return { ok: false, reason: "no_tokens_for_user", userId, teamMemberId };
  }

  return { 
    ok: true, 
    userId, 
    email, 
    teamMemberId, 
    tz, 
    tokens 
  };
}

export function registerDebugRoutes(app: Express) {
  console.log('Mounted debug routes at /debug');

  // Debug routes registry endpoint
  app.get('/debug/routes', (req, res) => {
    res.json({
      debugRoutes: [
        'GET /debug/routes - List all debug routes',
        'GET /debug/calendar-status?as=<email> - Check calendar tokens for user',
        'GET /debug/tokens/dump?as=<email> - Show token information',
        'GET /debug/my-tasks?as=<email> - Get tasks assigned to user',
        'POST /debug/create-test-task - Create test task with timezone',
        'POST /debug/sync/disable - Emergency disable calendar sync',
        'POST /debug/sync/enable - Re-enable calendar sync',
        'GET /debug/backfill-due-at?as=<email> - Backfill missing due_at timestamps',
        'POST /debug/sync/run-once?as=<email> - Run calendar sync for user tasks',
        'GET /debug/test-time-parsing?dueDate=2025-08-18&dueTime=9:55 PM&timezone=America/Vancouver - Test time parsing',
        'GET /debug/calendar-create-from-task?id=<taskId>&as=<email> - Force calendar sync for task',
        'GET /debug/sync/flush?taskId=<id> - Single-task calendar flush',
        'GET /debug/sync/upsert-task?taskId=<id>&as=<email> - Push this task now (direct upsert)',
        'GET /debug/sync/run?hours=12&as=<email> - Run once sync sweep for user'
      ]
    });
  });

  // Calendar status for session user or ?as=email
  app.get('/debug/calendar-status', async (req, res) => {
    try {
      const { user, tokens } = await resolveUserAndTokens(req);
      
      res.json({
        hasTokens: !!tokens,
        keyType: req.query.as ? 'impersonated' : 'session',
        user: user.email,
        tokenInfo: tokens ? {
          access_token: tokens.access_token ? 'REDACTED' : null,
          refresh_token: tokens.refresh_token ? 'REDACTED' : null,
          expires_at: tokens.expires_at
        } : null
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create test calendar event
  app.get('/debug/calendar-create-test', async (req, res) => {
    try {
      const { user, tokens } = await resolveUserAndTokens(req);
      
      if (!tokens) {
        return res.status(400).json({ error: 'No Google Calendar tokens found for user' });
      }

      const calendarService = new GoogleCalendarService();
      const client = await calendarService.getClientForUser(user.id);
      
      if (!client) {
        return res.status(400).json({ error: 'Failed to get Google Calendar client' });
      }

      // Create a 30-minute test event
      const now = new Date();
      const endTime = new Date(now.getTime() + 30 * 60 * 1000);
      
      const event = {
        summary: 'Debug Calendar Test',
        description: 'Test event created by debug route',
        start: {
          dateTime: now.toISOString(),
          timeZone: 'America/Vancouver'
        },
        end: {
          dateTime: endTime.toISOString(), 
          timeZone: 'America/Vancouver'
        },
        colorId: '11' // Red color
      };

      const response = await client.events.insert({
        calendarId: 'primary',
        requestBody: event
      });

      res.json({
        success: true,
        eventId: response.data.id,
        eventUrl: response.data.htmlLink,
        user: user.email
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get tasks for user
  app.get('/debug/my-tasks', async (req, res) => {
    try {
      const { user } = await resolveUserAndTokens(req);
      
      // Get team member record
      const teamMemberQuery = await pool.query(
        'SELECT * FROM team_members WHERE email = $1',
        [user.email]
      );
      
      if (teamMemberQuery.rows.length === 0) {
        return res.json({ tasks: [], message: 'No team member record found' });
      }
      
      const teamMember = teamMemberQuery.rows[0];
      
      // Get task assignments
      const assignmentsQuery = await pool.query(`
        SELECT t.*, ta.id as assignment_id, ta.assigned_by
        FROM tasks t
        JOIN task_assignments ta ON t.id = ta.task_id
        WHERE ta.team_member_id = $1
        ORDER BY t.created_at DESC
        LIMIT 20
      `, [teamMember.id]);
      
      res.json({
        user: user.email,
        teamMemberId: teamMember.id,
        tasks: assignmentsQuery.rows
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Sync status
  app.get('/debug/sync/status', (req, res) => {
    res.json({
      calendar_sync_enabled: SYNC_ENABLED(),
      environment_var: process.env.CALENDAR_SYNC_ENABLED
    });
  });

  // Enable sync
  app.post('/debug/sync/enable', (req, res) => {
    CALENDAR_SYNC_ENABLED = true;
    process.env.CALENDAR_SYNC_ENABLED = 'true';
    console.log('Calendar sync ENABLED via debug route');
    res.json({ calendar_sync_enabled: true });
  });

  // Disable sync  
  app.post('/debug/sync/disable', (req, res) => {
    CALENDAR_SYNC_ENABLED = false;
    process.env.CALENDAR_SYNC_ENABLED = 'false';
    console.log('Calendar sync DISABLED via debug route');
    res.json({ calendar_sync_enabled: false });
  });

  // Single task calendar flush
  app.get('/debug/sync/flush', async (req, res) => {
    try {
      const { taskId } = req.query;
      
      if (!taskId) {
        return res.status(400).json({ error: 'Missing taskId parameter' });
      }

      console.log(`Debug calendar flush for task: ${taskId}`);
      
      // Sync calendar events for the specific task
      const result = await syncAllCalendarEventsForTask(taskId as string);
      
      res.json({
        success: true,
        taskId,
        message: `Calendar flush completed for task ${taskId}`,
        sync_enabled: SYNC_ENABLED()
      });
    } catch (error: any) {
      console.error('Debug flush error:', error);
      res.status(500).json({ error: error.message, taskId });
    }
  });

  // Push this task now - Direct calendar upsert for single task (with proper token resolution)
  app.get('/debug/sync/upsert-task', async (req, res) => {
    const taskId = req.query.taskId as string;
    const impersonateAs = req.query.as as string;
    
    if (!taskId) {
      return res.status(400).json({ error: 'taskId parameter required' });
    }

    try {
      // Load the task directly from database
      const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
      if (taskResult.rows.length === 0) {
        return res.status(404).json({ error: `Task ${taskId} not found` });
      }
      const task = taskResult.rows[0];

      if (!task.due_at) {
        return res.status(400).json({ error: 'Task has no due_at timestamp for calendar sync' });
      }

      // Get assignee info - check who this task is assigned to
      let assigneeTeamMemberId: string | undefined;
      
      if (task.assigned_to) {
        // Direct user assignment - we still need to resolve through the enhanced method
        const resolution = await resolveUserAndTokensEnhanced({
          asEmail: impersonateAs,
          sessionUserId: task.assigned_to
        });
        
        if (!resolution.ok) {
          return res.status(400).json({ 
            error: `Token resolution failed: ${resolution.reason}`,
            details: resolution
          });
        }
        
        const { userId, tz, tokens } = resolution;
        
        // Use Luxon for proper timezone handling - avoid double conversion
        const { DateTime } = await import('luxon');
        const legacyCalendarTz = 'America/Vancouver';
        
        let legacyStartLocal: DateTime;
        
        if (task.due_at instanceof Date) {
          legacyStartLocal = DateTime.fromJSDate(task.due_at, { zone: 'utc' }).setZone(legacyCalendarTz);
        } else if (typeof task.due_at === 'string') {
          legacyStartLocal = DateTime.fromISO(task.due_at, { zone: 'utc' }).setZone(legacyCalendarTz);
        } else if (typeof task.due_at === 'number') {
          // Handle epoch seconds/milliseconds conversion
          const ms = task.due_at < 1e12 ? task.due_at * 1000 : task.due_at;
          legacyStartLocal = DateTime.fromMillis(ms, { zone: 'utc' }).setZone(legacyCalendarTz);
        } else {
          legacyStartLocal = DateTime.now().setZone(legacyCalendarTz);
        }
        
        const legacyEndLocal = legacyStartLocal.plus({ minutes: 60 });

        console.info('[CAL LEGACY]', { 
          taskId, 
          originalDueAt: task.due_at,
          startLocal: legacyStartLocal.toISO({ includeOffset: false }),
          endLocal: legacyEndLocal.toISO({ includeOffset: false }),
          tz: legacyCalendarTz
        });

        // Check if this task already has a calendar event for this user (idempotent)
        const existingEventResult = await pool.query(
          'SELECT event_id FROM task_google_events WHERE task_id = $1 AND user_id = $2', 
          [taskId, userId]
        );
        
        // Get Google Calendar service
        const { googleCalendarService } = await import('./googleCalendar');
        
        let eventId: string;
        let htmlLink: string = '';
        
        if (existingEventResult.rows.length > 0) {
          // PATCH existing event
          eventId = existingEventResult.rows[0].event_id;
          console.log(`Updating existing calendar event ${eventId}`);
          
          const updateResult = await googleCalendarService.updateTaskEvent(userId, eventId, {
            title: task.title,
            description: task.description || '',
            dueDate: legacyStartLocal.toJSDate(), // Pass local Date object
            status: task.status || 'pending',
            priority: task.priority || 'medium'
          });
          
          if (!updateResult.success) {
            throw new Error(`Failed to update calendar event ${eventId}`);
          }
          
          htmlLink = updateResult.htmlLink || '';
        } else {
          // CREATE new event and store mapping
          console.log(`Creating new calendar event for task ${taskId}`);
          
          const createResult = await googleCalendarService.createTaskEvent(userId, {
            title: task.title,
            description: task.description || '',
            dueDate: legacyStartLocal.toJSDate(), // Pass local Date object
            status: task.status || 'pending',
            priority: task.priority || 'medium'
          });
          
          if (!createResult) {
            throw new Error('Failed to create calendar event - no result returned');
          }
          
          eventId = createResult.eventId;
          htmlLink = createResult.htmlLink;
          
          // Store event mapping in task_google_events table
          await pool.query(
            'INSERT INTO task_google_events (task_id, user_id, event_id) VALUES ($1, $2, $3) ON CONFLICT (task_id, user_id) DO UPDATE SET event_id = $3, updated_at = now()',
            [taskId, userId, eventId]
          );
        }

        console.log(`[CAL] upsert ok task=${taskId} user=${userId} cal=primary event=${eventId} startLocal=${legacyStartLocal.toISO({ includeOffset: false })} tz=${legacyCalendarTz}`);

        return res.json({ 
          ok: true, 
          taskId, 
          assigneeUserId: userId,
          calendarId: 'primary',
          eventId,
          htmlLink: htmlLink || ''
        });
      } else {
        // Check task_assignments table
        const assignmentResult = await pool.query('SELECT team_member_id FROM task_assignments WHERE task_id = $1 LIMIT 1', [taskId]);
        if (assignmentResult.rows.length === 0) {
          return res.status(400).json({ error: 'Task has no assignee - cannot sync to calendar' });
        }
        assigneeTeamMemberId = assignmentResult.rows[0].team_member_id;
      }

      // Resolve user and tokens using enhanced resolution with team member
      const resolution = await resolveUserAndTokensEnhanced({
        asEmail: impersonateAs,
        assigneeTeamMemberId
      });
      
      if (!resolution.ok) {
        return res.status(400).json({ 
          error: `Token resolution failed: ${resolution.reason}`,
          details: resolution
        });
      }
      
      const { userId, email, tz, tokens } = resolution;
      
      // Use Luxon for proper timezone handling - avoid double conversion
      const { DateTime } = await import('luxon');
      const calendarTz = 'America/Vancouver';
      
      let startLocal: DateTime;
      
      if (task.due_at instanceof Date) {
        startLocal = DateTime.fromJSDate(task.due_at, { zone: 'utc' }).setZone(calendarTz);
      } else if (typeof task.due_at === 'string') {
        startLocal = DateTime.fromISO(task.due_at, { zone: 'utc' }).setZone(calendarTz);
      } else if (typeof task.due_at === 'number') {
        // Handle epoch seconds/milliseconds conversion
        const ms = task.due_at < 1e12 ? task.due_at * 1000 : task.due_at;
        startLocal = DateTime.fromMillis(ms, { zone: 'utc' }).setZone(calendarTz);
      } else {
        startLocal = DateTime.now().setZone(calendarTz);
      }
      
      const endLocal = startLocal.plus({ minutes: 60 });

      console.info('[CAL DEBUG]', { 
        taskId, 
        originalDueAt: task.due_at,
        startLocal: startLocal.toISO({ includeOffset: false }),
        endLocal: endLocal.toISO({ includeOffset: false }),
        tz: calendarTz
      });

      // Check if this task already has a calendar event for this user (idempotent)
      const existingEventResult = await pool.query(
        'SELECT event_id FROM task_google_events WHERE task_id = $1 AND user_id = $2', 
        [taskId, userId]
      );
      
      // Get Google Calendar service
      const { googleCalendarService } = await import('./googleCalendar');
      
      let eventId: string;
      let htmlLink: string = '';
      
      if (existingEventResult.rows.length > 0) {
        // PATCH existing event
        eventId = existingEventResult.rows[0].event_id;
        console.log(`Updating existing calendar event ${eventId}`);
        
        const updateResult = await googleCalendarService.updateTaskEvent(userId, eventId, {
          title: task.title,
          description: task.description || '',
          dueDate: startLocal.toJSDate(), // Pass local Date object
          status: task.status || 'pending',
          priority: task.priority || 'medium'
        });
        
        if (!updateResult.success) {
          throw new Error(`Failed to update calendar event ${eventId}`);
        }
        
        htmlLink = updateResult.htmlLink || '';
      } else {
        // CREATE new event and store mapping
        console.log(`Creating new calendar event for task ${taskId}`);
        
        const createResult = await googleCalendarService.createTaskEvent(userId, {
          title: task.title,
          description: task.description || '',
          dueDate: startLocal.toJSDate(), // Pass local Date object
          status: task.status || 'pending',
          priority: task.priority || 'medium'
        });
        
        if (!createResult) {
          throw new Error('Failed to create calendar event - no result returned');
        }
        
        eventId = createResult.eventId;
        htmlLink = createResult.htmlLink;
        
        // Store event mapping in task_google_events table
        await pool.query(
          'INSERT INTO task_google_events (task_id, user_id, event_id) VALUES ($1, $2, $3) ON CONFLICT (task_id, user_id) DO UPDATE SET event_id = $3, updated_at = now()',
          [taskId, userId, eventId]
        );
      }

      console.log(`[CAL] upsert ok task=${taskId} user=${userId} cal=primary event=${eventId} startLocal=${startLocal.toISO({ includeOffset: false })} tz=${calendarTz}`);

      res.json({ 
        ok: true, 
        taskId, 
        assigneeUserId: userId,
        calendarId: 'primary',
        eventId,
        htmlLink: htmlLink || ''
      });
    } catch (error: any) {
      console.error('Task upsert failed:', error);
      res.status(500).json({ 
        error: 'Task upsert failed', 
        details: error.message, 
        taskId 
      });
    }
  });

  // Run once - Execute sync sweep for impersonated user
  app.get('/debug/sync/run', async (req, res) => {
    const hours = parseInt(req.query.hours as string) || 12;
    const impersonateAs = req.query.as as string;
    
    try {
      // Get user info for impersonation
      const { user, teamMemberId } = await resolveUserFromEmail(impersonateAs, req);
      
      // Calculate time window
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      console.log(`Running sync sweep for user ${user.id} (team member ${teamMemberId}), last ${hours} hours since ${cutoffTime.toISOString()}`);

      // Get tasks for sync - either assigned directly OR via team member assignment
      const tasksQuery = `
        SELECT DISTINCT tasks.*, 
               tm.id as team_member_id
        FROM tasks 
        LEFT JOIN task_assignments ta ON ta.task_id = tasks.id
        LEFT JOIN team_members tm ON tm.id = ta.team_member_id
        WHERE (
          tasks.assigned_to = $1
          OR ta.team_member_id = $2
        )
        AND tasks.due_at IS NOT NULL
        AND tasks.status != 'completed'
        AND tasks.updated_at >= $3
        ORDER BY tasks.due_at ASC
      `;
      
      const tasksResult = await pool.query(tasksQuery, [user.id, teamMemberId, cutoffTime]);
      const tasks = tasksResult.rows as any[];
      
      console.log(`Found ${tasks.length} tasks for sync sweep`);

      let scanned = 0;
      let created = 0;
      let updated = 0;
      let skipped = 0;

      // Get Google Calendar service
      const { googleCalendarService } = await import('./googleCalendar');
      const calendarService = googleCalendarService;

      for (const task of tasks) {
        scanned++;
        
        try {
          if (!task.due_at) {
            skipped++;
            continue;
          }

          const startTime = new Date(task.due_at);
          const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
          
          if (task.google_calendar_event_id) {
            // Update existing
            const updateResult = await calendarService.updateTaskEvent(task.team_member_id || user.id, task.google_calendar_event_id, {
              title: task.title,
              description: task.description || undefined,
              dueDate: startTime,
              status: task.status || 'pending',
              priority: task.priority || 'medium'
            });
            if (updateResult) {
              updated++;
              console.log(`Updated calendar event ${task.google_calendar_event_id} for task ${task.id}`);
            } else {
              skipped++;
              console.log(`Failed to update calendar event ${task.google_calendar_event_id} for task ${task.id}`);
            }
          } else {
            // Create new
            const eventId = await calendarService.createTaskEvent(task.team_member_id || user.id, {
              title: task.title,
              description: task.description || undefined,
              dueDate: startTime,
              status: task.status || 'pending',
              priority: task.priority || 'medium'
            });
            
            if (eventId) {
              // Save event ID back to task
              await pool.query('UPDATE tasks SET google_calendar_event_id = $1 WHERE id = $2', [eventId, task.id]);
              created++;
              console.log(`Created calendar event ${eventId} for task ${task.id}`);
            } else {
              skipped++;
              console.log(`Failed to create calendar event for task ${task.id}`);
            }
          }
        } catch (taskError: any) {
          console.error(`Failed to sync task ${task.id}:`, taskError);
          skipped++;
        }
      }

      res.json({ 
        ok: true, 
        scanned, 
        created, 
        updated, 
        skipped,
        hours,
        userId: user.id,
        teamMemberId
      });
    } catch (error: any) {
      console.error('Sync run failed:', error);
      res.status(500).json({ 
        error: 'Sync run failed', 
        details: error.message
      });
    }
  });
  
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

  // D) Debug route listing
  // Debug endpoint: Test time parsing
  app.get('/debug/test-time-parsing', async (req, res) => {
    const { dueDate, dueTime, timezone } = req.query;
    const userTz = (timezone as string) || process.env.APP_TIMEZONE || "America/Vancouver";
    
    try {
      const { parseTaskDateTime } = await import('./utils/timeHandling');
      const result = parseTaskDateTime(dueDate as string, dueTime as string, userTz);
      res.json({
        input: { dueDate, dueTime, timezone: userTz },
        result,
        success: true
      });
    } catch (error) {
      res.json({
        input: { dueDate, dueTime, timezone: userTz },
        error: error.message,
        success: false
      });
    }
  });

  // Debug endpoint: Force calendar create from task
  app.get('/debug/calendar-create-from-task', async (req, res) => {
    const { id: taskId, as: impersonateEmail } = req.query;
    
    if (!taskId) {
      return res.status(400).json({ error: 'Task ID required' });
    }

    try {
      const { user } = await resolveUserAndTokens(impersonateEmail as string);
      
      // Force sync calendar events for this task
      await syncAllCalendarEventsForTask(taskId as string);
      
      res.json({
        message: `Forced calendar sync for task ${taskId}`,
        taskId,
        userEmail: user.email,
        success: true
      });
    } catch (error) {
      res.status(500).json({
        error: error.message,
        taskId,
        success: false
      });
    }
  });

  app.get('/debug/routes', (req, res) => {
    const routes = [
      'GET /debug/routes - List all debug routes',
      'GET /debug/calendar-status?as=<email> - Check calendar tokens for user',
      'GET /debug/tokens/dump?as=<email> - Show token information',
      'GET /debug/my-tasks?as=<email> - Get tasks assigned to user',
      'POST /debug/create-test-task - Create test task with timezone',
      'POST /debug/sync/disable - Emergency disable calendar sync',
      'POST /debug/sync/enable - Re-enable calendar sync',
      'GET /debug/backfill-due-at?as=<email> - Backfill missing due_at timestamps',
      'POST /debug/sync/run-once?as=<email> - Run calendar sync for user tasks',
      'GET /debug/test-time-parsing?dueDate=2025-08-18&dueTime=9:55 PM&timezone=America/Vancouver - Test time parsing',
      'GET /debug/calendar-create-from-task?id=<taskId>&as=<email> - Force calendar sync for task'
    ];
    res.json({ debugRoutes: routes });
  });

  // C) Enhanced backfill for user-specific tasks
  app.get('/debug/backfill-user-due-at', async (req: any, res) => {
    try {
      const { user } = await resolveUserAndTokens(req);
      
      // Find tasks where due_date and due_time are set BUT due_at IS NULL
      const rows = await pool.query(`
        SELECT t.id, t.title, t.due_date, t.due_time, t.organization_id, t.project_id
        FROM tasks t
        LEFT JOIN task_assignments ta ON ta.task_id = t.id
        LEFT JOIN team_members tm ON tm.id = ta.team_member_id
        WHERE tm.email = $1 
          AND t.due_date IS NOT NULL 
          AND t.due_time IS NOT NULL 
          AND t.due_at IS NULL
        GROUP BY t.id
        ORDER BY t.created_at DESC
        LIMIT 50
      `, [user.email]);
      
      const { buildDueAtUTC } = await import('./utils/timeHandling');
      const userTz = process.env.APP_TIMEZONE || "America/Vancouver";
      let updatedCount = 0;
      
      for (const task of rows.rows) {
        try {
          const dueDate = task.due_date.toISOString().slice(0, 10); // YYYY-MM-DD
          const dueTime = task.due_time;
          
          // Debug logging
          console.log(`Backfill task ${task.id}: dueDate=${dueDate}, dueTime=${dueTime}`);
          
          const dueAt = buildDueAtUTC(dueDate, dueTime, userTz);
          
          if (dueAt) {
            await pool.query(
              'UPDATE tasks SET due_at = $1 WHERE id = $2',
              [dueAt, task.id]
            );
            updatedCount++;
          }
        } catch (err) {
          console.error(`Error backfilling task ${task.id}:`, err);
        }
      }
      
      res.json({
        message: `Backfilled ${updatedCount} tasks with due_at timestamps`,
        totalFound: rows.rows.length,
        updated: updatedCount,
        userEmail: user.email,
        timezone: userTz
      });
    } catch (error) {
      console.error('Error in backfill-user-due-at:', error);
      res.status(500).json({ message: 'Failed to backfill due_at', stack: error.stack });
    }
  });

  // C) Run calendar sync once for user's tasks
  app.post('/debug/sync/run-once', async (req: any, res) => {
    try {
      const { user } = await resolveUserAndTokens(req);
      
      // Get all tasks assigned to this user that have due_at
      const rows = await pool.query(`
        SELECT DISTINCT t.id, t.created_at
        FROM tasks t
        LEFT JOIN task_assignments ta ON ta.task_id = t.id
        LEFT JOIN team_members tm ON tm.id = ta.team_member_id
        WHERE tm.email = $1 
          AND t.due_at IS NOT NULL
        ORDER BY t.created_at DESC
        LIMIT 20
      `, [user.email]);
      
      const { syncAllCalendarEventsForTask } = await import('./calendarEvents');
      let syncedCount = 0;
      const errors: string[] = [];
      
      for (const taskRow of rows.rows) {
        try {
          await syncAllCalendarEventsForTask(taskRow.id);
          syncedCount++;
        } catch (err) {
          errors.push(`Task ${taskRow.id}: ${err.message}`);
          console.error(`Sync error for task ${taskRow.id}:`, err);
        }
      }
      
      res.json({
        message: `Synced ${syncedCount} tasks to calendar`,
        totalTasks: rows.rows.length,
        synced: syncedCount,
        errors: errors.length > 0 ? errors : undefined,
        userEmail: user.email
      });
    } catch (error) {
      console.error('Error in sync/run-once:', error);
      res.status(500).json({ message: 'Failed to run calendar sync', stack: error.stack });
    }
  });

  // Simple test route for debugging calendar upsert
  app.get('/debug/test-upsert', async (req, res) => {
    const taskId = req.query.taskId as string;
    
    try {
      console.log(`[SIMPLE] Testing upsert for task ${taskId}`);
      
      // 1. Load task
      const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
      if (taskResult.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      const task = taskResult.rows[0];
      
      // 2. Load task assignment
      const assignmentResult = await pool.query('SELECT team_member_id FROM task_assignments WHERE task_id = $1', [taskId]);
      if (assignmentResult.rows.length === 0) {
        return res.status(400).json({ error: 'Task has no assignment' });
      }
      const teamMemberId = assignmentResult.rows[0].team_member_id;
      
      // 3. Load team member
      const teamMemberResult = await pool.query('SELECT * FROM team_members WHERE id = $1', [teamMemberId]);
      if (teamMemberResult.rows.length === 0) {
        return res.status(400).json({ error: 'Team member not found' });
      }
      const teamMember = teamMemberResult.rows[0];
      
      // 4. Load user by email match
      const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [teamMember.email]);
      if (userResult.rows.length === 0) {
        return res.status(400).json({ error: 'User not found for team member email', teamMemberEmail: teamMember.email });
      }
      const user = userResult.rows[0];
      
      // 5. Load OAuth tokens
      const tokenResult = await pool.query('SELECT * FROM oauth_tokens WHERE user_id = $1', [user.id]);
      if (tokenResult.rows.length === 0) {
        return res.status(400).json({ error: 'No OAuth tokens for user', userId: user.id });
      }
      
      // 6. Check for existing event mapping
      const eventResult = await pool.query('SELECT event_id FROM task_google_events WHERE task_id = $1 AND user_id = $2', [taskId, user.id]);
      
      // 7. Convert timezone properly - handle various date formats
      let dueAtUtc: DateTime;
      if (typeof task.due_at === 'string') {
        dueAtUtc = DateTime.fromISO(task.due_at, { zone: 'utc' });
      } else {
        dueAtUtc = DateTime.fromJSDate(new Date(task.due_at), { zone: 'utc' });
      }
      const startLocal = dueAtUtc.setZone('America/Vancouver');
      
      console.log(`[SIMPLE] due_at type: ${typeof task.due_at}, value: ${task.due_at}`);
      console.log(`[SIMPLE] dueAtUtc valid: ${dueAtUtc.isValid}, startLocal valid: ${startLocal.isValid}`);
      console.log(`[SIMPLE] Timezone conversion: ${task.due_at} UTC -> ${startLocal.toISO()} Vancouver`);
      
      // 8. Test Google Calendar creation
      const { googleCalendarService } = await import('./googleCalendar');
      
      let eventId: string | null = null;
      if (eventResult.rows.length > 0) {
        eventId = eventResult.rows[0].event_id;
        console.log(`[SIMPLE] Found existing event: ${eventId}`);
      } else {
        console.log(`[SIMPLE] Creating new calendar event...`);
        eventId = await googleCalendarService.createTaskEvent(user.id, {
          title: task.title,
          description: task.description || '',
          dueDate: new Date(startLocal.toISO()),
          status: task.status || 'pending',
          priority: task.priority || 'medium'
        });
        
        if (eventId) {
          // Store the mapping
          await pool.query(
            'INSERT INTO task_google_events (task_id, user_id, event_id) VALUES ($1, $2, $3)',
            [taskId, user.id, eventId]
          );
          console.log(`[SIMPLE] Created event ${eventId} and stored mapping`);
        }
      }
      
      res.json({
        ok: true,
        task: { id: task.id, title: task.title, due_at: task.due_at },
        teamMember: { id: teamMember.id, email: teamMember.email },
        user: { id: user.id, email: user.email },
        startLocal: startLocal.isValid ? startLocal.toISO() : 'INVALID_DATETIME',
        hasTokens: true,
        eventId,
        action: eventResult.rows.length > 0 ? 'found_existing' : 'created_new'
      });
      
    } catch (error: any) {
      console.error('[SIMPLE] Test failed:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // New diagnostic endpoints

  // List user's calendars
  app.get('/debug/calendar/list', async (req, res) => {
    const impersonateAs = req.query.as as string;
    
    if (!impersonateAs) {
      return res.status(400).json({ error: 'Missing ?as=email parameter' });
    }
    
    try {
      const resolution = await resolveUserAndTokensEnhanced({
        asEmail: impersonateAs
      });
      
      if (!resolution.ok) {
        return res.status(400).json({ 
          error: `Token resolution failed: ${resolution.reason}`,
          details: resolution
        });
      }
      
      const { userId } = resolution;
      const { googleCalendarService } = await import('./googleCalendar');
      
      const calendars = await googleCalendarService.listCalendars(userId);
      
      res.json({
        userEmail: impersonateAs,
        userId,
        calendars: calendars.map(cal => ({
          id: cal.id,
          summary: cal.summary,
          primary: cal.primary || false
        }))
      });
    } catch (error: any) {
      console.error('Calendar list failed:', error);
      res.status(500).json({ 
        error: 'Calendar list failed', 
        details: error.message 
      });
    }
  });

  // Get specific calendar event
  app.get('/debug/calendar/get', async (req, res) => {
    const { eventId, as: impersonateAs } = req.query;
    const calendarId = req.query.calendarId as string || 'primary';
    
    if (!eventId || !impersonateAs) {
      return res.status(400).json({ error: 'Missing ?eventId=...&as=email parameters' });
    }
    
    try {
      const resolution = await resolveUserAndTokensEnhanced({
        asEmail: impersonateAs as string
      });
      
      if (!resolution.ok) {
        return res.status(400).json({ 
          error: `Token resolution failed: ${resolution.reason}`,
          details: resolution
        });
      }
      
      const { userId } = resolution;
      const { googleCalendarService } = await import('./googleCalendar');
      
      const event = await googleCalendarService.getEvent(userId, eventId as string, calendarId);
      
      if (!event) {
        return res.json({
          found: false,
          eventId,
          calendarId
        });
      }
      
      res.json({
        found: true,
        eventId: event.id,
        calendarId,
        start: event.start,
        end: event.end,
        htmlLink: event.htmlLink,
        summary: event.summary,
        description: event.description
      });
    } catch (error: any) {
      console.error('Calendar get event failed:', error);
      res.status(500).json({ 
        error: 'Calendar get event failed', 
        details: error.message 
      });
    }
  });

  // Get task events from database
  app.get('/debug/db/task-events', async (req, res) => {
    const { taskId } = req.query;
    
    if (!taskId) {
      return res.status(400).json({ error: 'Missing ?taskId=... parameter' });
    }
    
    try {
      const result = await pool.query(
        'SELECT task_id, user_id, event_id, created_at, updated_at FROM task_google_events WHERE task_id = $1',
        [taskId]
      );
      
      res.json({
        taskId,
        events: result.rows
      });
    } catch (error: any) {
      console.error('Database query failed:', error);
      res.status(500).json({ 
        error: 'Database query failed', 
        details: error.message 
      });
    }
  });

  return app;
}