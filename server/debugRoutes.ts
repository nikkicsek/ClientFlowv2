import { Router } from "express";
import { storage } from "./storage";
import { googleCalendarService, setSyncEnabled, SYNC_ENABLED } from "./googleCalendar";
import { onTaskCreatedOrUpdated, onAssignmentCreated } from './hooks/taskCalendarHooks';
import { insertTaskSchema, type TeamMember } from "@shared/schema";

const router = Router();

// Helper function to get effective user for debug endpoints
async function getEffectiveUser(req: any) {
  // 1) If logged-in session exists, return session user
  if (req.user?.claims?.sub) {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    return { userId, email: user?.email, sessionExists: true, impersonated: false };
  }
  
  // 2) If req.query.as is present (an email), look up users.id by that email
  if (req.query.as) {
    const email = req.query.as;
    const user = await storage.getUserByEmail(email);
    if (user) {
      return { userId: user.id, email: user.email, sessionExists: false, impersonated: true };
    } else {
      throw new Error(`User not found for email: ${email}`);
    }
  }
  
  // 3) If neither exists, return null (caller should handle 401)
  return null;
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
          🟡 Create Test Calendar Event <span class="status">(Creates calendar event)</span>
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

// Calendar status - updated to check both userId and teamMemberId tokens
router.get('/calendar-status', async (req: any, res) => {
  try {
    const effectiveUser = await getEffectiveUser(req);
    if (!effectiveUser) {
      return res.status(401).json({ message: 'No session. Pass ?as=<email>' });
    }

    // Get database connection for direct oauth_tokens queries
    const db = req.app?.get?.('db') as any;
    if (!db) {
      return res.status(500).json({ message: "Database connection not available" });
    }

    // Find team member ID for this user
    const teamMembers = await storage.getAllTeamMembers();
    const teamMember = teamMembers.find(member => member.email === effectiveUser.email);
    
    let hasTokens = false;
    let keyType: string | null = null;
    let tokenData: any = null;

    // Try userId first (canonical)
    try {
      const userTokenResult = await db.query('SELECT * FROM oauth_tokens WHERE user_id = $1', [effectiveUser.userId]);
      if (userTokenResult.rows.length > 0) {
        hasTokens = true;
        keyType = 'userId';
        tokenData = userTokenResult.rows[0];
      }
    } catch (err) {
      console.error('Error querying oauth_tokens by userId:', err);
    }

    // If not found by userId, try teamMemberId
    if (!hasTokens && teamMember?.id) {
      try {
        const teamTokenResult = await db.query('SELECT * FROM oauth_tokens WHERE user_id = $1', [teamMember.id]);
        if (teamTokenResult.rows.length > 0) {
          hasTokens = true;
          keyType = 'teamMemberId';
          tokenData = teamTokenResult.rows[0];
        }
      } catch (err) {
        console.error('Error querying oauth_tokens by teamMemberId:', err);
      }
    }

    res.json({
      userId: effectiveUser.userId,
      teamMemberId: teamMember?.id || null,
      email: effectiveUser.email,
      hasTokens,
      keyType,
      expiry: tokenData?.expiry || null,
      scopes: tokenData?.scopes || null,
      sessionExists: effectiveUser.sessionExists,
      impersonated: effectiveUser.impersonated
    });
  } catch (error) {
    console.error("Error in debug/calendar-status:", error);
    res.status(500).json({ message: "Failed to get calendar status", stack: error instanceof Error ? error.stack : String(error) });
  }
});

// Debug tokens - show token records for current user (with redacted secrets)
router.get('/tokens/dump', async (req: any, res) => {
  try {
    const effectiveUser = await getEffectiveUser(req);
    if (!effectiveUser) {
      return res.status(401).json({ message: 'No session. Pass ?as=<email>' });
    }

    // Get database connection for direct oauth_tokens queries
    const db = req.app?.get?.('db') as any;
    if (!db) {
      return res.status(500).json({ message: "Database connection not available" });
    }

    // Find team member ID for this user
    const teamMembers = await storage.getAllTeamMembers();
    const teamMember = teamMembers.find(member => member.email === effectiveUser.email);
    
    const tokenRecords = [];

    // Query by userId
    try {
      const userTokenResult = await db.query('SELECT user_id, expiry, scopes, created_at, updated_at, access_token, refresh_token FROM oauth_tokens WHERE user_id = $1', [effectiveUser.userId]);
      for (const row of userTokenResult.rows) {
        tokenRecords.push({
          keyType: 'userId',
          user_id: row.user_id,
          expiry: row.expiry,
          scopes: row.scopes,
          created_at: row.created_at,
          updated_at: row.updated_at,
          access_token: row.access_token ? `${row.access_token.slice(0, 10)}...` : null,
          refresh_token: row.refresh_token ? `${row.refresh_token.slice(0, 10)}...` : null
        });
      }
    } catch (err) {
      console.error('Error querying oauth_tokens by userId:', err);
    }

    // Query by teamMemberId if it exists
    if (teamMember?.id) {
      try {
        const teamTokenResult = await db.query('SELECT user_id, expiry, scopes, created_at, updated_at, access_token, refresh_token FROM oauth_tokens WHERE user_id = $1', [teamMember.id]);
        for (const row of teamTokenResult.rows) {
          tokenRecords.push({
            keyType: 'teamMemberId',
            user_id: row.user_id,
            expiry: row.expiry,
            scopes: row.scopes,
            created_at: row.created_at,
            updated_at: row.updated_at,
            access_token: row.access_token ? `${row.access_token.slice(0, 10)}...` : null,
            refresh_token: row.refresh_token ? `${row.refresh_token.slice(0, 10)}...` : null
          });
        }
      } catch (err) {
        console.error('Error querying oauth_tokens by teamMemberId:', err);
      }
    }

    res.json({
      userId: effectiveUser.userId,
      teamMemberId: teamMember?.id || null,
      email: effectiveUser.email,
      tokenRecords,
      recordCount: tokenRecords.length,
      sessionExists: effectiveUser.sessionExists,
      impersonated: effectiveUser.impersonated
    });
  } catch (error) {
    console.error("Error in debug/tokens/dump:", error);
    res.status(500).json({ message: "Failed to dump token records", stack: error instanceof Error ? error.stack : String(error) });
  }
});

// Create test calendar event
router.get('/calendar-create-test', async (req: any, res) => {
  try {
    const effectiveUser = await getEffectiveUser(req);
    if (!effectiveUser) {
      return res.status(401).json({ message: 'No session. Pass ?as=<email>' });
    }

    const user = await storage.getUser(effectiveUser.userId);
    if (!user || !user.googleAccessToken) {
      return res.json({ 
        ok: false, 
        error: "No Google tokens available", 
        userId: effectiveUser.userId,
        email: effectiveUser.email,
        sessionExists: effectiveUser.sessionExists,
        impersonated: effectiveUser.impersonated
      });
    }

    const startTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 minutes later

    const eventData = {
      summary: "Replit Debug Test Event",
      description: "Test event created from debug dashboard",
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'America/Vancouver'
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'America/Vancouver'
      }
    };

    console.log("Creating test calendar event with payload:", eventData);

    const eventId = await googleCalendarService.createTaskEvent(user.id, {
      title: eventData.summary,
      description: eventData.description,
      dueDate: eventData.start.dateTime,
      status: 'in_progress',
      priority: 'medium'
    });
    
    res.json({ ok: true, eventId });
  } catch (error) {
    console.error("Error creating test calendar event:", error);
    res.json({ ok: false, error: error instanceof Error ? error.message : String(error) });
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

export { router as debugRouter };