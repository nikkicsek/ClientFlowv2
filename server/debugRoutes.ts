import { Router } from "express";
import { storage } from "./storage";
import { googleCalendarService } from "./googleCalendar";
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

// Calendar status
router.get('/calendar-status', async (req: any, res) => {
  try {
    const effectiveUser = await getEffectiveUser(req);
    if (!effectiveUser) {
      return res.status(401).json({ message: 'No session. Pass ?as=<email>' });
    }

    const user = await storage.getUser(effectiveUser.userId);
    if (!user) {
      return res.json({ message: "User not found in database", hasTokens: false });
    }

    res.json({
      userId: effectiveUser.userId,
      email: effectiveUser.email,
      hasTokens: !!(user.googleAccessToken),
      expiry: user.googleTokenExpiry,
      scopes: user.googleAccessToken ? "calendar.events" : null,
      sessionExists: effectiveUser.sessionExists,
      impersonated: effectiveUser.impersonated
    });
  } catch (error) {
    console.error("Error in debug/calendar-status:", error);
    res.status(500).json({ message: "Failed to get calendar status", stack: error instanceof Error ? error.stack : String(error) });
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

// Create test task
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

    const dueDate = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
    const hours = dueDate.getHours().toString().padStart(2, '0');
    const minutes = dueDate.getMinutes().toString().padStart(2, '0');

    // Find the team member record for this user
    const teamMembers = await storage.getAllTeamMembers();
    const currentTeamMember = teamMembers.find((member: TeamMember) => member.email === effectiveUser.email);
    
    if (!currentTeamMember) {
      return res.status(400).json({ message: "No team member record found for this user" });
    }

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
      teamMemberId: currentTeamMember.id
    });
  } catch (error) {
    console.error("Error creating test task:", error);
    res.status(500).json({ message: "Failed to create test task", stack: error instanceof Error ? error.stack : String(error) });
  }
});

export { router as debugRouter };