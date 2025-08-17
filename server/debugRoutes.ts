import { Router } from "express";
import { storage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { googleCalendarService } from "./googleCalendar";
import { onTaskCreatedOrUpdated, onAssignmentCreated } from './hooks/taskCalendarHooks';
import { insertTaskSchema, type TeamMember } from "@shared/schema";

const router = Router();

// Simple HTML debug dashboard
router.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Debug Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .link { display: block; margin: 10px 0; padding: 10px; background: #f5f5f5; text-decoration: none; color: #333; }
        .link:hover { background: #e0e0e0; }
    </style>
</head>
<body>
    <h1>Debug Dashboard</h1>
    <a href="/debug/health" class="link">Health Check</a>
    <a href="/debug/me" class="link">Current User Info</a>
    <a href="/debug/my-tasks" class="link">My Tasks</a>
    <a href="/debug/calendar-status" class="link">Calendar Status</a>
    <a href="/debug/calendar-create-test" class="link">Create Test Calendar Event</a>
    <a href="/debug/create-test-task" class="link">Create Test Task</a>
</body>
</html>
  `;
  res.send(html);
});

// Health check
router.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Current user info
router.get('/me', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    res.json({ userId, email: user?.email });
  } catch (error) {
    console.error("Error in debug/me:", error);
    res.status(500).json({ message: "Failed to get user info", stack: error instanceof Error ? error.stack : String(error) });
  }
});

// My tasks - using exact same logic as My Tasks page
router.get('/my-tasks', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
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

    res.json({ tasks, teamMemberId: currentTeamMember.id, userId, email: user.email });
  } catch (error) {
    console.error("Error in debug/my-tasks:", error);
    res.status(500).json({ message: "Failed to fetch my tasks", stack: error instanceof Error ? error.stack : String(error) });
  }
});

// Calendar status
router.get('/calendar-status', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      userId,
      email: user.email,
      hasTokens: !!(user.googleAccessToken),
      expiry: user.googleTokenExpiry,
      scopes: user.googleAccessToken ? "calendar.events" : null
    });
  } catch (error) {
    console.error("Error in debug/calendar-status:", error);
    res.status(500).json({ message: "Failed to get calendar status", stack: error instanceof Error ? error.stack : String(error) });
  }
});

// Create test calendar event
router.get('/calendar-create-test', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (!user || !user.googleAccessToken) {
      return res.json({ ok: false, error: "No Google tokens available" });
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

    const eventId = await googleCalendarService.createEvent(user.id, 'primary', eventData);
    
    res.json({ ok: true, eventId });
  } catch (error) {
    console.error("Error creating test calendar event:", error);
    res.json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

// Create test task
router.get('/create-test-task', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
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
    
    // Check if we need to call assignment hook
    if (task.assignedTo) {
      await onAssignmentCreated(task.id, task.assignedTo);
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