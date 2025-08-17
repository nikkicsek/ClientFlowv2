import { Router } from 'express';
import { storage } from './storage';
import { isAuthenticated } from './replitAuth';
import {
  onTaskCreatedOrUpdated,
  onAssignmentCreated
} from './hooks/taskCalendarHooks';
import { google } from 'googleapis';

export const debugRouter = Router();

// GET /debug/me - Return user info used by My Tasks
debugRouter.get('/me', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    res.json({ userId, email: user?.email });
  } catch (error: any) {
    console.error('Error in debug/me:', error);
    res.status(500).json({ 
      message: 'Failed to get user info', 
      stack: error.stack,
      error: error.message 
    });
  }
});

// GET /debug/my-tasks - Using same code path as My Tasks page
debugRouter.get('/my-tasks', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (!user?.email) {
      return res.status(400).json({ message: "User email not found" });
    }

    // Use same logic as My Tasks page - find team member by email
    const allTeamMembers = await storage.getAllTeamMembers();
    const currentTeamMember = allTeamMembers.find(member => member.email === user.email);
    
    if (!currentTeamMember) {
      return res.json({ 
        message: "No team member record found", 
        userId, 
        email: user.email, 
        tasks: [] 
      });
    }

    // Get assignments using same storage method as My Tasks
    const assignments = await storage.getTaskAssignmentsByTeamMember(currentTeamMember.id);
    
    const tasks = assignments.slice(0, 50).map(assignment => ({
      id: assignment.task.id,
      title: assignment.task.title,
      status: assignment.task.status,
      due_at: assignment.task.dueDate, // Fix: use dueDate instead of dueAt
      due_date: assignment.task.dueDate,
      due_time: assignment.task.dueTime,
      org_id: assignment.task.organizationId,
      project_id: assignment.task.projectId,
      assigneeUserIds: [userId] // Map team member back to user ID
    }));

    res.json({ 
      userId, 
      email: user.email, 
      teamMemberId: currentTeamMember.id, 
      tasks: tasks.slice(0, 5) 
    });
  } catch (error: any) {
    console.error('Error in debug/my-tasks:', error);
    res.status(500).json({ 
      message: 'Failed to get my tasks', 
      stack: error.stack,
      error: error.message 
    });
  }
});

// POST /debug/create-test-task - Create test task and assign to current user
debugRouter.post('/create-test-task', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (!user?.email) {
      return res.status(400).json({ message: "User email not found" });
    }

    // Find team member by email
    const allTeamMembers = await storage.getAllTeamMembers();
    const currentTeamMember = allTeamMembers.find(member => member.email === user.email);
    
    if (!currentTeamMember) {
      return res.status(400).json({ message: "No team member record found" });
    }

    // Create task due in 15 minutes
    const now = new Date();
    const dueAt = new Date(now.getTime() + 15 * 60 * 1000);
    
    const taskData = {
      title: "Replit Sync Test (server)",
      description: "Test task created for debugging My Tasks and calendar sync",
      status: "pending" as const,
      priority: "medium" as const,
      dueDate: dueAt, // Fix: use Date object instead of string
      dueTime: dueAt.toTimeString().substring(0, 5),
      organizationId: null,
      projectId: null,
    };

    const task = await storage.createTask(taskData);
    console.log('Created test task:', task.id, task.title);
    
    // Assign to current team member
    const assignmentData = {
      taskId: task.id,
      teamMemberId: currentTeamMember.id,
      assignedBy: userId,
    };

    const assignment = await storage.createTaskAssignment(assignmentData);
    console.log('Assigned to teamMemberId:', currentTeamMember.id, 'userId:', userId);
    console.log('Assignment created with ID:', assignment.id);
    
    // Call calendar hooks
    await onTaskCreatedOrUpdated(task.id);
    await onAssignmentCreated(assignment.id);
    
    res.json({ 
      task: {
        ...task,
        assigneeUserIds: [userId]
      },
      assignment,
      teamMember: currentTeamMember
    });
  } catch (error: any) {
    console.error('Error creating test task:', error);
    res.status(500).json({ 
      message: 'Failed to create test task', 
      stack: error.stack,
      error: error.message 
    });
  }
});

// GET /debug/calendar-status - Check OAuth tokens for current user
debugRouter.get('/calendar-status', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (!user?.email) {
      return res.status(400).json({ message: "User email not found" });
    }

    // Check if user has OAuth tokens in database
    const db = req.app.get('db');
    const tokenResult = await db.query(
      'SELECT access_token, refresh_token, expiry, scopes FROM oauth_tokens WHERE user_id = $1',
      [userId]
    );

    const hasTokens = tokenResult.rows.length > 0;
    const tokenData = hasTokens ? tokenResult.rows[0] : null;

    res.json({
      userId,
      email: user.email,
      hasTokens,
      expiry: tokenData?.expiry || null,
      scopes: tokenData?.scopes || null
    });
  } catch (error: any) {
    console.error('Error checking calendar status:', error);
    res.status(500).json({ 
      message: 'Failed to check calendar status', 
      stack: error.stack,
      error: error.message 
    });
  }
});

// POST /debug/calendar-create-test - Create test calendar event
debugRouter.post('/calendar-create-test', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (!user?.email) {
      return res.status(400).json({ message: "User email not found" });
    }

    // Get OAuth tokens
    const db = req.app.get('db');
    const tokenResult = await db.query(
      'SELECT access_token, refresh_token, expiry FROM oauth_tokens WHERE user_id = $1',
      [userId]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ message: "No OAuth tokens found" });
    }

    const tokenData = tokenResult.rows[0];
    
    // Create OAuth2 client and set credentials
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: new Date(tokenData.expiry).getTime()
    });

    // Create calendar API instance
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Create event starting in 10 minutes, lasting 30 minutes
    const startTime = new Date(Date.now() + 10 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
    
    const event = {
      summary: 'Debug Test Event - Replit Calendar Sync',
      description: 'Test event created via debug endpoint',
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'America/Los_Angeles'
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'America/Los_Angeles'
      }
    };

    console.log('Creating calendar event:', {
      summary: event.summary,
      start: event.start.dateTime,
      end: event.end.dateTime,
      timeZone: event.start.timeZone
    });

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event
    });

    res.json({
      ok: true,
      eventId: response.data.id,
      htmlLink: response.data.htmlLink
    });
  } catch (error: any) {
    console.error('Error creating test calendar event:', error);
    res.status(500).json({ 
      ok: false,
      message: 'Failed to create calendar event', 
      stack: error.stack,
      error: error.message 
    });
  }
});