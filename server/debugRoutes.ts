import { Router } from "express";
import { storage } from "./storage";
import { googleCalendarService, setSyncEnabled, SYNC_ENABLED } from "./googleCalendar";
import { onTaskCreatedOrUpdated, onAssignmentCreated } from './hooks/taskCalendarHooks';
import { insertTaskSchema, type TeamMember } from "@shared/schema";
import { pool } from "./db";
import { google } from 'googleapis';

const router = Router();

// Helper function to get effective user for debug endpoints
async function getEffectiveUser(req: any) {
  // 1) Check for real session user first
  const sessionUser = (req.session as any)?.user;
  if (sessionUser) {
    return { 
      userId: sessionUser.userId, 
      email: sessionUser.email, 
      sessionExists: true, 
      impersonated: false,
      teamMemberId: sessionUser.teamMemberId 
    };
  }

  // 2) Fallback to Replit auth for local development
  if (req.user?.claims?.sub) {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    return { userId, email: user?.email, sessionExists: true, impersonated: false };
  }
  
  // 3) Handle ?as=email impersonation (only for admins or dev environment)
  if (req.query.as) {
    // Check if current user is admin or in dev mode
    const isAdmin = sessionUser?.role === 'admin' || process.env.NODE_ENV === 'development';
    if (!isAdmin && sessionUser) {
      throw new Error('Impersonation not allowed for non-admin users');
    }
    
    const email = req.query.as;
    const user = await storage.getUserByEmail(email);
    if (user) {
      return { userId: user.id, email: user.email, sessionExists: false, impersonated: true };
    } else {
      throw new Error(`User not found for email: ${email}`);
    }
  }
  
  // 4) If no session, return null (caller should handle 401)
  return null;
}

// Session or impersonation user helper
async function getSessionOrImpersonatedUser(req: any) {
  const effectiveUser = await getEffectiveUser(req);
  if (!effectiveUser) {
    return null;
  }

  // Get team member ID if available
  const teamMembers = await storage.getAllTeamMembers();
  const teamMember = teamMembers.find(member => member.email === effectiveUser.email);
  const teamMemberId = teamMember?.id || null;

  return {
    userId: effectiveUser.userId,
    teamMemberId,
    email: effectiveUser.email,
    impersonated: effectiveUser.impersonated
  };
}

// Unified token resolution helper for debug endpoints
async function resolveUserAndTokens(req: any) {
  const u = await getSessionOrImpersonatedUser(req);
  if (!u) {
    return null;
  }

  const byUser = await storage.getOAuthTokensByUserId(u.userId);
  const byTeam = u.teamMemberId ? await storage.getOAuthTokensByUserId(u.teamMemberId) : null;
  const token = byUser ?? byTeam ?? null;

  return {
    ...u,
    token,
    hasTokens: !!token,
    keyType: byUser ? "userId" : (byTeam ? "teamMemberId" : null)
  };
}

// Simple HTML debug dashboard
router.get('/', (req, res) => {
  const asParam = req.query.as ? `?as=${req.query.as}` : '';
  res.type('html').send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Debug Dashboard</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 600px; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; margin-bottom: 30px; }
        .link { display: block; margin: 15px 0; padding: 15px 20px; background: #007cba; color: white; text-decoration: none; border-radius: 5px; transition: background 0.3s; }
        .link:hover { background: #005a8b; }
        .working { background: #28a745; }
        .testing { background: #ffc107; }
        .status { font-size: 12px; opacity: 0.8; }
        .impersonation { background: #17a2b8; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
        .hidden { display: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Debug Dashboard</h1>
        ${req.query.as ? `<div class="impersonation">🎭 Impersonating: ${req.query.as}</div>` : ''}
        <p>Click any link below to test the debug endpoints:</p>
        
        <a href="/debug/health${asParam}" class="link working">
          🟢 Health Check <span class="status">(Should return: {"ok":true})</span>
        </a>
        
        <a href="/debug/me${asParam}" class="link testing">
          🟡 Current User Info <span class="status">(Shows auth status & user details)</span>
        </a>
        
        <a href="/debug/my-tasks${asParam}" class="link testing">
          🟡 My Tasks <span class="status">(Testing task assignment logic)</span>
        </a>
        
        <a href="/debug/calendar-status${asParam}" class="link testing">
          🟡 Calendar Status <span class="status">(Shows OAuth token status)</span>
        </a>
        
        <a href="/debug/calendar-create-test${asParam}" class="link testing">
          🟡 Create Test Calendar Event <span class="status">(Creates 30-min calendar event)</span>
        </a>
        
        <a href="/debug/create-test-task${asParam}" class="link testing">
          🟡 Create Test Task <span class="status">(Creates task + triggers hooks)</span>
        </a>
        
        <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px;">
          <strong>Calendar Sync Control</strong><br>
          <button onclick="disableSync()" style="margin: 5px; padding: 8px 12px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer;">🛑 DISABLE SYNC</button>
          <button onclick="enableSync()" style="margin: 5px; padding: 8px 12px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer;">▶️ ENABLE SYNC</button>
          <br><small id="sync-status">Current status: ${SYNC_ENABLED ? 'ENABLED' : 'DISABLED'}</small>
        </div>
        
        <script>
          async function updateSyncStatus() {
            try {
              const response = await fetch('/debug/sync/status');
              const data = await response.json();
              document.getElementById('sync-status').textContent = 'Current status: ' + (data.enabled ? 'ENABLED' : 'DISABLED');
            } catch (error) {
              console.error('Error updating status:', error);
            }
          }
          
          async function disableSync() {
            try {
              const response = await fetch('/debug/sync/disable', { method: 'POST' });
              const data = await response.json();
              console.log('Sync disabled:', data);
              await updateSyncStatus();
            } catch (error) {
              console.error('Error disabling sync:', error);
            }
          }
          
          async function enableSync() {
            try {
              const response = await fetch('/debug/sync/enable', { method: 'POST' });
              const data = await response.json();
              console.log('Sync enabled:', data);
              await updateSyncStatus();
            } catch (error) {
              console.error('Error enabling sync:', error);
            }
          }
          

          
          // Update status on page load
          updateSyncStatus();
        </script>
        
        <div style="margin: 20px 0; padding: 15px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px;">
          <strong>🧹 Cleanup Test Tasks</strong><br>
          <button onclick="fetch('/debug/cleanup-test-tasks${asParam}&minutes=60', {method:'DELETE'}).then(r=>r.json()).then(d => alert('Deleted: ' + d.deletedCount + ' items'))" style="margin: 5px; padding: 8px 12px; background: #f39c12; color: white; border: none; border-radius: 3px; cursor: pointer;">Clean Last Hour</button>
          <button onclick="fetch('/debug/cleanup-test-tasks${asParam}&minutes=240', {method:'DELETE'}).then(r=>r.json()).then(d => alert('Deleted: ' + d.deletedCount + ' items'))" style="margin: 5px; padding: 8px 12px; background: #e67e22; color: white; border: none; border-radius: 3px; cursor: pointer;">Clean Last 4 Hours</button>
          <br><small>Removes 'Replit Sync Test (server)' tasks and their assignments</small>
        </div>
        
        ${process.env.NODE_ENV === 'production' ? '' : '<p><small>Add ?as=email@example.com to impersonate a user</small></p>'}
      </div>
    </body>
    </html>
  `);
});

// Health check
router.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Current user info
router.get('/me', async (req: any, res) => {
  try {
    const effectiveUser = await getEffectiveUser(req);
    if (!effectiveUser) {
      return res.status(401).json({ message: 'No session. Pass ?as=<email>' });
    }
    
    res.json({ 
      userId: effectiveUser.userId, 
      email: effectiveUser.email, 
      sessionExists: effectiveUser.sessionExists, 
      impersonated: effectiveUser.impersonated 
    });
  } catch (error) {
    console.error("Error in debug/me:", error);
    res.status(500).json({ message: "Failed to get user info", stack: error instanceof Error ? error.stack : String(error) });
  }
});

// My tasks - using exact same logic as My Tasks page
router.get('/my-tasks', async (req: any, res) => {
  try {
    const effectiveUser = await getEffectiveUser(req);
    if (!effectiveUser) {
      return res.status(401).json({ message: 'No session. Pass ?as=<email>' });
    }

    if (!effectiveUser.email) {
      return res.status(400).json({ message: "User email not found" });
    }

    // Find team member by email (same logic as My Tasks)
    const teamMembers = await storage.getAllTeamMembers();
    const currentTeamMember = teamMembers.find((member: TeamMember) => member.email === effectiveUser.email);
    
    if (!currentTeamMember) {
      return res.json({ message: "No team member record found", userId: effectiveUser.userId, email: effectiveUser.email, tasks: [] });
    }

    // Get assignments using the new userId-based method that handles schema issues
    const assignments = await storage.getTaskAssignmentsByUserId(effectiveUser.userId);
    
    const tasks = assignments.slice(0, 50).map(assignment => ({
      id: assignment.task.id,
      title: assignment.task.title,
      status: assignment.task.status,
      due_date: assignment.task.dueDate,
      due_time: assignment.task.dueTime,
      due_at: assignment.task.dueDate,
      org_id: assignment.task.organizationId,
      project_id: assignment.task.projectId,
      assigneeUserIds: [], 
      created_at: assignment.task.createdAt
    }));

    res.json({ 
      tasks, 
      teamMemberId: currentTeamMember.id, 
      userId: effectiveUser.userId, 
      email: effectiveUser.email, 
      sessionExists: effectiveUser.sessionExists,
      impersonated: effectiveUser.impersonated 
    });
  } catch (error) {
    console.error("Error in debug/my-tasks:", error);
    res.status(500).json({ message: "Failed to fetch my tasks", stack: error instanceof Error ? error.stack : String(error) });
  }
});

// Calendar status - unified token resolution
router.get('/calendar-status', async (req: any, res) => {
  try {
    const userAndTokens = await resolveUserAndTokens(req);
    if (!userAndTokens) {
      return res.status(401).json({ message: 'No session. Pass ?as=<email>' });
    }

    res.json({
      hasTokens: userAndTokens.hasTokens,
      userId: userAndTokens.userId,
      email: userAndTokens.email,
      keyType: userAndTokens.keyType,
      expiry: userAndTokens.token?.expiry || null,
      scopes: userAndTokens.token?.scopes || null,
      impersonated: userAndTokens.impersonated
    });
  } catch (error) {
    console.error("Error in debug/calendar-status:", error);
    res.status(500).json({ message: "Failed to get calendar status", stack: error instanceof Error ? error.stack : String(error) });
  }
});

// Debug tokens - show redacted token record using unified resolver
router.get('/tokens/dump', async (req: any, res) => {
  try {
    const userAndTokens = await resolveUserAndTokens(req);
    if (!userAndTokens) {
      return res.status(401).json({ message: 'No session. Pass ?as=<email>' });
    }

    let tokenRecord = null;
    if (userAndTokens.token) {
      tokenRecord = {
        user_id: userAndTokens.token.user_id,
        expiry: userAndTokens.token.expiry,
        scopes: userAndTokens.token.scopes,
        created_at: userAndTokens.token.created_at,
        updated_at: userAndTokens.token.updated_at,
        access_token: userAndTokens.token.access_token ? `${userAndTokens.token.access_token.slice(0, 10)}...` : null,
        refresh_token: userAndTokens.token.refresh_token ? `${userAndTokens.token.refresh_token.slice(0, 10)}...` : null
      };
    }

    res.json({
      userId: userAndTokens.userId,
      email: userAndTokens.email,
      tokenRecord,
      hasTokens: userAndTokens.hasTokens,
      keyType: userAndTokens.keyType,
      impersonated: userAndTokens.impersonated
    });
  } catch (error) {
    console.error("Error in debug/tokens/dump:", error);
    res.status(500).json({ message: "Failed to dump token records", stack: error instanceof Error ? error.stack : String(error) });
  }
});

// Calendar create test - unified token resolution with event creation  
router.get('/calendar-create-test', async (req: any, res) => {
  try {
    const userAndTokens = await resolveUserAndTokens(req);
    if (!userAndTokens) {
      return res.status(401).json({ 
        ok: false, 
        error: "Unauthorized - No session. Pass ?as=<email>",
        userId: null,
        email: null,
        keyType: null,
        impersonated: false
      });
    }

    if (!userAndTokens.hasTokens) {
      return res.json({
        ok: false,
        error: "No Google tokens available",
        userId: userAndTokens.userId,
        email: userAndTokens.email,
        keyType: userAndTokens.keyType,
        impersonated: userAndTokens.impersonated
      });
    }

    // Create a 30-minute test event starting now
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes later

    try {
      // Use GoogleCalendarService's existing createTaskEvent method
      const testTask = {
        title: "Replit Debug Test Event",
        description: "created from /debug/calendar-create-test",
        dueDate: now.toISOString(),
        status: "in_progress" as const,
        priority: "medium" as const
      };

      const eventId = await googleCalendarService.createTaskEvent(userAndTokens.userId, testTask);

      if (eventId) {
        res.json({
          ok: true,
          eventId,
          keyType: userAndTokens.keyType,
          userId: userAndTokens.userId,
          email: userAndTokens.email,
          start: now.toISOString(),
          end: end.toISOString()
        });
      } else {
        res.json({
          ok: false,
          error: "Calendar service returned null event ID",
          userId: userAndTokens.userId,
          email: userAndTokens.email,
          keyType: userAndTokens.keyType,
          impersonated: userAndTokens.impersonated
        });
      }
    } catch (calendarError) {
      console.error('Calendar API error:', calendarError);
      res.json({
        ok: false,
        error: "Failed to create calendar event",
        userId: userAndTokens.userId,
        email: userAndTokens.email,
        keyType: userAndTokens.keyType,
        impersonated: userAndTokens.impersonated,
        details: calendarError instanceof Error ? calendarError.message : String(calendarError)
      });
    }
  } catch (error) {
    console.error("Error in debug/calendar-create-test:", error);
    res.status(500).json({ 
      ok: false,
      error: "Failed to create test calendar event", 
      stack: error instanceof Error ? error.stack : String(error) 
    });
  }
});

// Create test task (with idempotency to prevent runaway loops)
router.get('/create-test-task', async (req: any, res) => {
  try {
    const effectiveUser = await getEffectiveUser(req);
    if (!effectiveUser) {
      return res.status(401).json({ message: 'No session. Pass ?as=<email>' });
    }

    const user = await storage.getUser(effectiveUser.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find the team member record for this user
    const teamMembers = await storage.getAllTeamMembers();
    const currentTeamMember = teamMembers.find((member: TeamMember) => member.email === effectiveUser.email);
    
    if (!currentTeamMember) {
      return res.status(400).json({ message: "No team member record found for this user" });
    }

    // IDEMPOTENCY CHECK: Look for existing test task created within the last 10 minutes
    const existingTask = await findExistingDebugTask(effectiveUser.userId, currentTeamMember.id);
    if (existingTask) {
      console.log('Debug task already exists, returning existing:', existingTask.id);
      return res.json({
        id: existingTask.id,
        assigneeUserIds: [currentTeamMember.id],
        due_at: existingTask.dueDate,
        title: existingTask.title,
        status: existingTask.status,
        userId: effectiveUser.userId,
        email: effectiveUser.email,
        sessionExists: effectiveUser.sessionExists,
        impersonated: effectiveUser.impersonated,
        teamMemberId: currentTeamMember.id,
        wasExisting: true
      });
    }

    const dueDate = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
    const hours = dueDate.getHours().toString().padStart(2, '0');
    const minutes = dueDate.getMinutes().toString().padStart(2, '0');

    const taskData = insertTaskSchema.parse({
      title: "Replit Sync Test (server)",
      description: "Test task created from debug dashboard",
      status: "in_progress",
      assignedTo: effectiveUser.userId,
      dueDate,
      dueTime: `${hours}:${minutes}`,
      priority: "medium",
      taskScope: "organization"
    });

    const task = await storage.createTask(taskData);
    console.log('Created new debug task:', task.id);

    // Call calendar hooks
    await onTaskCreatedOrUpdated(task.id);
    
    // Create task assignment using team member ID
    const assignment = await storage.createTaskAssignment({
      taskId: task.id,
      teamMemberId: currentTeamMember.id, // Use team member ID, not user ID
      assignedBy: effectiveUser.userId
    });
    await onAssignmentCreated(assignment.id);

    res.json({
      id: task.id,
      assigneeUserIds: [currentTeamMember.id],
      due_at: task.dueDate,
      title: task.title,
      status: task.status,
      userId: effectiveUser.userId,
      email: effectiveUser.email,
      sessionExists: effectiveUser.sessionExists,
      impersonated: effectiveUser.impersonated,
      teamMemberId: currentTeamMember.id,
      wasExisting: false
    });
  } catch (error) {
    console.error("Error creating test task:", error);
    res.status(500).json({ message: "Failed to create test task", stack: error instanceof Error ? error.stack : String(error) });
  }
});

// Sync control endpoints (accept both GET and POST)
router.get('/sync/status', (req, res) => {
  res.json({ enabled: SYNC_ENABLED });
});

router.post('/sync/status', (req, res) => {
  res.json({ enabled: SYNC_ENABLED });
});

// Compatibility aliases
router.get('/create-calendar-event', (req, res) => {
  res.redirect(307, `/debug/calendar-create-test${req.url.includes('?') ? '&' + req.url.split('?')[1] : ''}`);
});

router.get('/api/debug/calendar-create-test', (req, res) => {
  res.redirect(307, `/debug/calendar-create-test${req.url.includes('?') ? '?' + req.url.split('?')[1] : ''}`);
});

// Routes listing endpoint
router.get('/routes', (req, res) => {
  const routes = [
    'GET /debug/',
    'GET /debug/health',
    'GET /debug/me',
    'GET /debug/my-tasks',
    'GET /debug/calendar-status',
    'GET /debug/calendar-create-test',
    'GET /debug/create-test-task',
    'GET /debug/tokens/dump',
    'GET /debug/sync/status',
    'POST /debug/sync/enable',
    'POST /debug/sync/disable',
    'GET /debug/create-calendar-event (alias)',
    'GET /api/debug/calendar-create-test (alias)',
    'GET /debug/routes'
  ];
  
  res.json({
    registered_routes: routes,
    total_count: routes.length,
    note: "All routes support ?as=email parameter for impersonation"
  });
});

router.get('/sync/disable', (req, res) => {
  setSyncEnabled(false);
  res.json({ enabled: false });
});

router.post('/sync/disable', (req, res) => {
  setSyncEnabled(false);
  res.json({ enabled: false });
});

router.get('/sync/enable', (req, res) => {
  setSyncEnabled(true);
  res.json({ enabled: true });
});

router.post('/sync/enable', (req, res) => {
  setSyncEnabled(true);
  res.json({ enabled: true });
});

// Helper function to find existing debug task (idempotency check)
async function findExistingDebugTask(userId: string, teamMemberId: string) {
  try {
    const allTasks = await storage.getAllTasksWithDetails();
    const debugTasks = allTasks.filter(t => 
      t.title === "Replit Sync Test (server)" && 
      t.createdAt > new Date(Date.now() - 10 * 60 * 1000) &&
      !t.deletedAt
    );
    console.log(`Idempotency check: Found ${debugTasks.length} debug tasks in last 10 minutes`);
    return debugTasks.length > 0 ? debugTasks[0] : null;
  } catch (error) {
    console.error('Error checking for existing debug task:', error);
    return null;
  }
}

// Cleanup endpoint for removing test tasks
router.delete('/cleanup-test-tasks', async (req: any, res) => {
  try {
    const effectiveUser = await getEffectiveUser(req);
    if (!effectiveUser) {
      return res.status(401).json({ message: 'No session. Pass ?as=<email>' });
    }

    const minutes = parseInt(req.query.minutes as string) || 240; // Default 4 hours
    const cutoffDate = new Date(Date.now() - minutes * 60 * 1000);

    // Find all debug test tasks created after the cutoff
    const allTasks = await storage.getAllTasksWithDetails();
    const tasks = allTasks.filter(t => 
      t.title === "Replit Sync Test (server)" && 
      t.createdAt > cutoffDate &&
      !t.deletedAt
    );

    let deletedCount = 0;
    for (const task of tasks) {
      // Delete assignments first (cascading)
      const assignments = await storage.getTaskAssignments(task.id);
      for (const assignment of assignments) {
        await storage.deleteTaskAssignment(assignment.id);
        deletedCount++;
      }
      
      // Soft delete the task
      await storage.softDeleteTask(task.id, effectiveUser.userId);
      deletedCount++;
    }

    res.json({ 
      deletedCount,
      tasksDeleted: tasks.length,
      minutesBack: minutes,
      cutoffDate: cutoffDate.toISOString()
    });
  } catch (error) {
    console.error("Error cleaning up test tasks:", error);
    res.status(500).json({ message: "Failed to cleanup test tasks", error: error instanceof Error ? error.message : String(error) });
  }
});

// Debug endpoint to create test task with assignments
router.get('/create-test-task', async (req, res) => {
  try {
    const asEmail = req.query.as as string;
    if (!asEmail) {
      return res.status(400).json({ error: 'Missing ?as=email parameter' });
    }

    // Find team member by email
    const pool = req.app.get('db');
    const teamMemberResult = await pool.query('SELECT id FROM team_members WHERE email = $1', [asEmail]);
    
    if (teamMemberResult.rows.length === 0) {
      return res.status(404).json({ error: `Team member not found for email: ${asEmail}` });
    }

    const teamMemberId = teamMemberResult.rows[0].id;
    
    // Get a sample project for testing
    const projectResult = await pool.query('SELECT id FROM projects LIMIT 1');
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'No projects found for testing' });
    }

    const projectId = projectResult.rows[0].id;

    // Create test task with due time ~10 minutes from now
    const now = new Date();
    const dueAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now
    
    const taskData = {
      title: `Test Task ${now.getTime()}`,
      description: 'Debug test task created automatically',
      projectId,
      status: 'in_progress',
      priority: 'medium',
      dueAt,
      dueDate: dueAt,
      dueTime: `${dueAt.getHours().toString().padStart(2, '0')}:${dueAt.getMinutes().toString().padStart(2, '0')}`,
    };

    // Create task using storage
    const storage = req.app.get('storage');
    const task = await storage.createTask(taskData);

    // Create assignment
    const assignment = await storage.createTaskAssignment({
      taskId: task.id,
      teamMemberId: teamMemberId,
      assignedBy: 'debug-system',
    });

    // Fire calendar hook
    const { onTaskCreatedOrUpdated } = require('./hooks/taskCalendarHooks');
    try {
      await onTaskCreatedOrUpdated(task.id);
    } catch (calendarError) {
      console.error('Calendar hook error in debug:', calendarError);
    }

    res.json({
      success: true,
      task: {
        id: task.id,
        title: task.title,
        dueAt: task.dueAt,
        projectId: task.projectId,
      },
      assignments: [{
        id: assignment.id,
        teamMemberId: assignment.teamMemberId,
        taskId: assignment.taskId,
      }],
      debug: {
        teamMemberEmail: asEmail,
        teamMemberId,
        projectId,
        dueAtFormatted: dueAt.toISOString(),
      }
    });

  } catch (error) {
    console.error('Debug create-test-task error:', error);
    res.status(500).json({ error: error.message });
  }
});

export { router as debugRouter };