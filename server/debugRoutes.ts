import { Router } from "express";
import { storage } from "./storage";
import { googleCalendarService } from "./googleCalendar";
import { onTaskCreatedOrUpdated, onAssignmentCreated } from './hooks/taskCalendarHooks';
import { insertTaskSchema, type TeamMember } from "@shared/schema";

const router = Router();

// Simple HTML debug dashboard
router.get('/', (req, res) => {
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
        .broken { background: #dc3545; }
        .status { font-size: 12px; opacity: 0.8; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Debug Dashboard</h1>
        <p>Click any link below to test the debug endpoints:</p>
        
        <a href="/debug/health" class="link working">
          🟢 Health Check <span class="status">(Should return: {"ok":true})</span>
        </a>
        
        <a href="/debug/me" class="link working">
          🟡 Current User Info <span class="status">(Shows auth status & user details)</span>
        </a>
        
        <a href="/debug/my-tasks" class="link broken">
          🔴 My Tasks <span class="status">(Testing task assignment logic)</span>
        </a>
        
        <a href="/debug/calendar-status" class="link working">
          🟡 Calendar Status <span class="status">(Shows OAuth token status)</span>
        </a>
        
        <a href="/debug/calendar-create-test" class="link broken">
          🔴 Create Test Calendar Event <span class="status">(Requires Google tokens)</span>
        </a>
        
        <a href="/debug/create-test-task" class="link broken">
          🔴 Create Test Task <span class="status">(Testing task creation + hooks)</span>
        </a>
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
    // Try to get user from session, or use a demo user for testing
    let userId = req.user?.claims?.sub;
    let user;
    
    if (!userId) {
      // For debug purposes, try to find any admin user
      const adminUsers = await storage.getAllTeamMembers();
      const adminUser = adminUsers.find(u => u.role === 'admin');
      if (adminUser) {
        userId = adminUser.id;
        user = { id: adminUser.id, email: adminUser.email };
      } else {
        return res.json({ message: "No authenticated user and no admin users found", userId: null, email: null });
      }
    } else {
      user = await storage.getUser(userId);
    }
    
    res.json({ userId, email: user?.email, sessionExists: !!req.user });
  } catch (error) {
    console.error("Error in debug/me:", error);
    res.status(500).json({ message: "Failed to get user info", stack: error instanceof Error ? error.stack : String(error) });
  }
});

// My tasks - using exact same logic as My Tasks page
router.get('/my-tasks', async (req: any, res) => {
  try {
    // Try to get user from session, or use first admin user for testing
    let userId = req.user?.claims?.sub;
    let user;
    
    if (!userId) {
      const teamMembers = await storage.getAllTeamMembers();
      const adminUser = teamMembers.find(u => u.role === 'admin');
      if (adminUser) {
        userId = adminUser.id;
        user = { id: adminUser.id, email: adminUser.email };
      } else {
        return res.json({ message: "No user found for testing", tasks: [] });
      }
    } else {
      user = await storage.getUser(userId);
    }
    
    if (!user?.email) {
      return res.status(400).json({ message: "User email not found" });
    }

    // Find team member by email (same logic as My Tasks)
    const teamMembers = await storage.getAllTeamMembers();
    const currentTeamMember = teamMembers.find((member: TeamMember) => member.email === user.email);
    
    if (!currentTeamMember) {
      return res.json({ message: "No team member record found", userId, email: user.email, tasks: [] });
    }

    // Get assignments using same logic as My Tasks
    const assignments = await storage.getTaskAssignmentsByTeamMember(currentTeamMember.id);
    
    const tasks = assignments.slice(0, 50).map(assignment => ({
      id: assignment.task.id,
      title: assignment.task.title,
      status: assignment.task.status,
      due_date: assignment.task.dueDate,
      due_time: assignment.task.dueTime,
      due_at: assignment.task.dueDate,
      org_id: assignment.task.organizationId,
      project_id: assignment.task.projectId,
      assigneeUserIds: [], // Will populate below
      created_at: assignment.task.createdAt
    }));

    res.json({ tasks, teamMemberId: currentTeamMember.id, userId, email: user.email, sessionExists: !!req.user });
  } catch (error) {
    console.error("Error in debug/my-tasks:", error);
    res.status(500).json({ message: "Failed to fetch my tasks", stack: error instanceof Error ? error.stack : String(error) });
  }
});

// Calendar status
router.get('/calendar-status', async (req: any, res) => {
  try {
    // Try to get user from session, or use first admin user for testing
    let userId = req.user?.claims?.sub;
    let user;
    
    if (!userId) {
      const teamMembers = await storage.getAllTeamMembers();
      const adminUser = teamMembers.find(u => u.role === 'admin');
      if (adminUser) {
        const userRecord = await storage.getUserByEmail(adminUser.email);
        if (userRecord) {
          userId = userRecord.id;
          user = userRecord;
        }
      }
    } else {
      user = await storage.getUser(userId);
    }
    
    if (!user) {
      return res.json({ message: "No user found for testing", hasTokens: false });
    }

    res.json({
      userId,
      email: user.email,
      hasTokens: !!(user.googleAccessToken),
      expiry: user.googleTokenExpiry,
      scopes: user.googleAccessToken ? "calendar.events" : null,
      sessionExists: !!req.user
    });
  } catch (error) {
    console.error("Error in debug/calendar-status:", error);
    res.status(500).json({ message: "Failed to get calendar status", stack: error instanceof Error ? error.stack : String(error) });
  }
});

// Create test calendar event
router.get('/calendar-create-test', async (req: any, res) => {
  try {
    // Try to get user from session, or use first admin user for testing
    let userId = req.user?.claims?.sub;
    let user;
    
    if (!userId) {
      const teamMembers = await storage.getAllTeamMembers();
      const adminUser = teamMembers.find(u => u.role === 'admin');
      if (adminUser) {
        const userRecord = await storage.getUserByEmail(adminUser.email);
        if (userRecord) {
          userId = userRecord.id;
          user = userRecord;
        }
      }
    } else {
      user = await storage.getUser(userId);
    }
    
    if (!user || !user.googleAccessToken) {
      return res.json({ ok: false, error: "No Google tokens available", sessionExists: !!req.user });
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
    // Try to get user from session, or use first admin user for testing
    let userId = req.user?.claims?.sub;
    let user;
    
    if (!userId) {
      const teamMembers = await storage.getAllTeamMembers();
      const adminUser = teamMembers.find(u => u.role === 'admin');
      if (adminUser) {
        userId = adminUser.id;
        user = { id: adminUser.id, email: adminUser.email };
      }
    } else {
      user = await storage.getUser(userId);
    }
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const dueDate = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
    const hours = dueDate.getHours().toString().padStart(2, '0');
    const minutes = dueDate.getMinutes().toString().padStart(2, '0');

    const taskData = insertTaskSchema.parse({
      title: "Replit Sync Test (server)",
      description: "Test task created from debug dashboard",
      status: "in_progress",
      assignedTo: userId,
      dueDate,
      dueTime: `${hours}:${minutes}`,
      priority: "medium",
      taskScope: "organization"
    });

    const task = await storage.createTask(taskData);

    // Call calendar hooks
    await onTaskCreatedOrUpdated(task.id);
    
    // Create task assignment if there's an assigned user
    if (task.assignedTo) {
      const assignment = await storage.createTaskAssignment({
        taskId: task.id,
        teamMemberId: task.assignedTo,
        assignedBy: userId
      });
      await onAssignmentCreated(assignment.id);
    }

    res.json({
      id: task.id,
      assigneeUserIds: task.assignedTo ? [task.assignedTo] : [],
      due_at: task.dueDate,
      title: task.title,
      status: task.status
    });
  } catch (error) {
    console.error("Error creating test task:", error);
    res.status(500).json({ message: "Failed to create test task", stack: error instanceof Error ? error.stack : String(error) });
  }
});

export { router as debugRouter };