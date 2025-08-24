import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { requireAuth, getCurrentUser } from "./middleware/auth";
import { insertProjectSchema, insertTaskSchema, insertMessageSchema, insertAnalyticsSchema, insertTeamMemberSchema, insertTaskAssignmentSchema, insertProposalSchema, insertProposalItemSchema, type TeamMember } from "@shared/schema";
import { computeDueAt, buildDueAtUTC, parseTaskDateTime, backfillDisplayFields } from "./utils/timeHandling";
import { emailService } from "./emailService";
import { nangoService } from "./nangoService";
import { googleCalendarService } from "./googleCalendar";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  onTaskCreatedOrUpdated,
  onTaskDeleted,
  onAssignmentCreated,
  onAssignmentDeleted
} from './hooks/taskCalendarHooks';
import { AutoCalendarSync } from './hooks/autoCalendarSync';
import { CalendarService } from './services/CalendarService';
import { syncAllCalendarEventsForTask } from "./calendarEvents";

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Google OAuth callback is now handled by /oauth/google/callback in googleRoutes.ts

  // Auth middleware
  await setupAuth(app);

  // Auth status route - lightweight check
  app.get('/auth/status', async (req: any, res) => {
    try {
      console.log('AUTH STATUS DEBUG:', {
        cookieKeys: Object.keys(req.cookies || {}),
        sessionId: req.session?.id,
        sessionUser: req.session?.user,
        replitUser: req.user
      });

      // Check if we have a valid session and Replit user
      const sessionExists = !!(req.session?.id);
      let user = null;

      // If we have Replit user, get/create database user
      if (req.user?.claims?.sub) {
        const replitUser = req.user.claims;
        
        // Always ensure user exists in database with admin role
        await storage.upsertUser({
          id: replitUser.sub,
          email: replitUser.email,
          firstName: replitUser.first_name || '',
          lastName: replitUser.last_name || '',
          profileImageUrl: replitUser.profile_image_url || '',
          role: 'admin' // Always set admin for testing
        });
        
        user = await storage.getUser(replitUser.sub);
        
        // Update session if needed
        if (!req.session.user || req.session.user.userId !== user.id) {
          req.session.user = { 
            userId: user.id, 
            email: user.email 
          };
        }
      }

      const isAuthenticated = sessionExists && !!user && !!req.user?.claims;

      res.json({
        sessionExists,
        user,
        isAuthenticated
      });
    } catch (error) {
      console.error("Error checking auth status:", error);
      res.json({
        sessionExists: false,
        user: null,
        isAuthenticated: false
      });
    }
  });

  // Auth routes - check session first, then Replit auth
  app.get('/api/auth/user', requireAuth, async (req: any, res) => {
    try {
      const currentUser = getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const user = await storage.getUser(currentUser.userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Lightweight API route for manual sync with UI integration
  app.post('/api/tasks/:id/sync-calendar', isAuthenticated, async (req: any, res) => {
    try {
      const taskId = req.params.id;
      const userId = req.user.claims.sub;
      
      // Verify user has access to this task
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      // Get assignments to check access
      const assignments = await storage.getTaskAssignments(taskId);
      const user = await storage.getUser(userId);
      const isAssigned = assignments.some(assignment => 
        assignment.teamMember?.email === user?.email
      );
      
      if (user?.role !== 'admin' && !isAssigned) {
        return res.status(403).json({ message: "Not authorized to sync this task" });
      }
      
      // Trigger the calendar sync using the unified system
      await syncAllCalendarEventsForTask(taskId);
      
      // Get the first assignment's calendar event for the response
      let eventId = null;
      let htmlLink = null;
      
      if (assignments.length > 0) {
        const assignment = assignments[0];
        if (assignment.teamMember?.email) {
          // Get user by email and check for calendar event
          const assigneeUser = await storage.getUserByEmail(assignment.teamMember.email);
          if (assigneeUser) {
            const { pool } = await import('./db');
            const eventResult = await pool.query(
              'SELECT event_id FROM task_google_events WHERE task_id = $1 AND user_id = $2',
              [taskId, assigneeUser.id]
            );
            
            if (eventResult.rows.length > 0) {
              eventId = eventResult.rows[0].event_id;
              
              // Try to get the htmlLink from Google Calendar
              try {
                const { googleCalendarService } = await import('./googleCalendar');
                const event = await googleCalendarService.getEvent(assigneeUser.id, eventId);
                htmlLink = event?.htmlLink || null;
              } catch (error) {
                console.warn('Could not fetch event htmlLink:', error);
              }
            }
          }
        }
      }
      
      res.json({ 
        ok: true, 
        success: true, 
        message: "Calendar sync completed successfully",
        eventId,
        htmlLink
      });
    } catch (error) {
      console.error("Error syncing task calendar:", error);
      res.status(500).json({ 
        ok: false,
        message: "Failed to sync calendar", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Debug endpoints
  app.get('/debug/me', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json({ userId, email: user?.email });
    } catch (error) {
      console.error("Error in debug/me:", error);
      res.status(500).json({ message: "Failed to get user info" });
    }
  });

  // Add non-authenticated debug endpoint for testing
  app.get('/debug/current-user-check', async (req: any, res) => {
    try {
      // Check session state
      const sessionUserId = req.user?.claims?.sub;
      if (!sessionUserId) {
        return res.json({ authenticated: false, message: "No session found" });
      }
      
      const user = await storage.getUser(sessionUserId);
      if (!user?.email) {
        return res.json({ authenticated: true, userFound: false, userId: sessionUserId });
      }

      // Find team member by email
      const teamMembers = await storage.getAllTeamMembers();
      const currentTeamMember = teamMembers.find((member: TeamMember) => member.email === user.email);
      
      res.json({ 
        authenticated: true, 
        userFound: true,
        userId: sessionUserId,
        email: user.email,
        teamMemberFound: !!currentTeamMember,
        teamMemberId: currentTeamMember?.id
      });
    } catch (error: any) {
      console.error("Error in debug/current-user-check:", error);
      res.json({ authenticated: false, error: error.message });
    }
  });

  app.get('/debug/my-tasks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.email) {
        return res.status(400).json({ message: "User email not found" });
      }

      // Find team member by email (same logic as My Tasks)
      const teamMembers = await storage.getAllTeamMembers();
      const currentTeamMember = teamMembers.find((member: any) => member.email === user.email);
      
      if (!currentTeamMember) {
        return res.json({ message: "No team member record found", userId, email: user.email, tasks: [] });
      }

      // Get assignments using same logic as My Tasks
      const assignments = await storage.getTaskAssignmentsByTeamMember(currentTeamMember.id);
      
      const tasks = assignments.map(assignment => ({
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

      res.json({ userId, email: user.email, teamMemberId: currentTeamMember.id, tasks: tasks.slice(0, 5) });
    } catch (error) {
      console.error("Error in debug/my-tasks:", error);
      res.status(500).json({ message: "Failed to get my tasks" });
    }
  });

  // Debug route to test organization data in task assignments
  app.get('/debug/assignments-with-org/:teamMemberId', async (req, res) => {
    try {
      const { teamMemberId } = req.params;
      const assignments = await storage.getTaskAssignmentsByTeamMember(teamMemberId);
      
      res.json({
        teamMemberId,
        assignmentCount: assignments.length,
        assignments: assignments.map(a => ({
          id: a.id,
          taskTitle: a.task.title,
          projectName: a.project?.name || 'No project',
          organizationName: a.organization?.name || 'No organization',
          hasOrganization: !!a.organization,
          hasProject: !!a.project
        }))
      });
    } catch (error) {
      console.error('Debug assignment error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Direct debug route for Kassie's assignments (bypasses auth)
  app.get('/debug/kassie-assignments', async (req, res) => {
    try {
      // Find Kassie's team member ID
      const allTeamMembers = await storage.getAllTeamMembers();
      const kassie = allTeamMembers.find((m: any) => m.name.includes('Kassie'));
      
      if (!kassie) {
        return res.json({ error: 'Kassie not found', allMembers: allTeamMembers.map((m: any) => ({ id: m.id, name: m.name, email: m.email })) });
      }

      const assignments = await storage.getTaskAssignmentsByTeamMember(kassie.id);
      
      res.json({
        kassieInfo: { id: kassie.id, name: kassie.name, email: kassie.email },
        assignmentCount: assignments.length,
        assignments: assignments.map(a => ({
          id: a.id,
          taskTitle: a.task.title,
          projectName: a.project?.name || null,
          organizationName: a.organization?.name || null,
          organizationId: a.organization?.id || null,
          projectId: a.project?.id || null,
          hasOrganization: !!a.organization,
          hasProject: !!a.project,
          fullOrgData: a.organization,
          fullProjectData: a.project
        }))
      });
    } catch (error) {
      console.error('Debug Kassie assignment error:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/debug/create-test-task', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user?.email) {
        return res.status(400).json({ message: "User email not found" });
      }

      // Find team member by email
      const teamMembers = await storage.getAllTeamMembers();
      const currentTeamMember = teamMembers.find((member: any) => member.email === user.email);
      
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
        dueDate: dueAt,
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
      
      // Call calendar hook
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
    } catch (error) {
      console.error("Error creating test task:", error);
      res.status(500).json({ message: "Failed to create test task" });
    }
  });

  // Temporary route to upgrade current user to admin (for development)
  app.post('/api/auth/upgrade-to-admin', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const claims = req.user.claims;
      
      // Update user to admin role
      await storage.upsertUser({
        id: claims.sub,
        email: claims.email,
        firstName: claims.first_name,
        lastName: claims.last_name,
        profileImageUrl: claims.profile_image_url,
        role: 'admin', // Upgrade to admin
      });
      
      const updatedUser = await storage.getUser(userId);
      res.json({ message: "Successfully upgraded to admin", user: updatedUser });
    } catch (error) {
      console.error("Error upgrading user:", error);
      res.status(500).json({ message: "Failed to upgrade user" });
    }
  });

  // Project routes
  app.get('/api/projects', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let projects: any[];
      if (user.role === 'admin') {
        // Admins can see all projects - for now just return empty array
        // In a real implementation, you'd have a method to get all projects
        projects = [];
      } else {
        projects = await storage.getProjectsByClient(userId);
      }
      
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get('/api/projects/:id', isAuthenticated, async (req: any, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Check access permissions
      if (user?.role !== 'admin' && project.clientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post('/api/projects', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can create projects" });
      }

      const projectData = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(projectData);
      
      // Auto-generate tasks for Faces of Kelowna services
      if (project.serviceId) {
        const service = await storage.getServices();
        const selectedService = service.find(s => s.id === project.serviceId);
        if (selectedService && selectedService.name.includes('Faces of Kelowna')) {
          await storage.createTasksFromTemplates(project.id, project.serviceId);
        }
      }
      
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  // Project status update route
  app.put('/api/admin/projects/:projectId/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can update project status" });
      }

      const { status } = req.body;
      if (!status || !['active', 'pending', 'on_hold', 'completed'].includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }

      const project = await storage.updateProject(req.params.projectId, { status });
      res.json(project);
    } catch (error) {
      console.error("Error updating project status:", error);
      res.status(500).json({ message: "Failed to update project status" });
    }
  });

  // Project reordering route
  app.put('/api/admin/organizations/:orgId/projects/reorder', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can reorder projects" });
      }

      const { projectOrders } = req.body;
      if (!Array.isArray(projectOrders)) {
        return res.status(400).json({ message: "Invalid project orders data" });
      }

      await storage.updateProjectOrder(req.params.orgId, projectOrders);
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering projects:", error);
      res.status(500).json({ message: "Failed to reorder projects" });
    }
  });

  // Task routes
  app.get('/api/admin/tasks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can view all tasks" });
      }

      const tasks = await storage.getAllTasksWithDetails();
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching all tasks:", error);
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  app.get('/api/projects/:projectId/tasks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const project = await storage.getProject(req.params.projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check access permissions
      if (user?.role !== 'admin' && project.clientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const tasks = await storage.getTasksByProjectWithDetails(req.params.projectId);
      res.json(tasks);
    } catch (error: any) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ message: "Failed to fetch tasks" });
    }
  });

  app.post('/api/projects/:projectId/tasks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can create tasks" });
      }

      const { selectedTeamMembers = [], ...bodyData } = req.body;
      
      // Compute due_at using new CalendarService time normalization
      let finalTaskData = {
        ...bodyData,
        projectId: req.params.projectId
      };

      // Normalize due_at using Luxon (America/Vancouver)
      if (bodyData.dueDate) {
        try {
          finalTaskData.dueAt = CalendarService.computeDueAt(bodyData.dueDate, bodyData.dueTime);
        } catch (error: any) {
          console.warn('Time computation failed:', error.message);
          // Keep original data if time computation fails
        }
      }
      
      const taskData = insertTaskSchema.parse(finalTaskData);
      
      // Remove timezone from the final data (not a database field)
      delete (finalTaskData as any).timezone;
      
      // Start transaction
      let task: any;
      let assignments: any[] = [];
      
      try {
        // Create the task (pass the validated taskData, not finalTaskData)
        task = await storage.createTask(taskData);
        console.log('Created task:', { taskId: task.id, title: task.title, dueDate: task.dueDate, dueTime: task.dueTime });
        
        // Auto-sync calendar events for task using new system
        try {
          await AutoCalendarSync.onTaskChanged(task.id);
          console.log(`Auto-synced calendar events for task ${task.id}`);
        } catch (calendarError) {
          console.warn('Auto calendar sync failed:', calendarError);
          // Don't fail task creation if calendar sync fails
        }
        
        // Create task assignments for each selected team member
        for (const teamMemberId of selectedTeamMembers) {
          const assignment = await storage.createTaskAssignment({
            taskId: task.id,
            teamMemberId: teamMemberId,
            assignedBy: userId,
          });
          assignments.push(assignment);
          console.log('Created task assignment:', { assignmentId: assignment.id, taskId: task.id, teamMemberId });
          
          // Verify assignment was created correctly
          const { pool } = await import('./db');
          const verifyQuery = await pool.query(
            'SELECT * FROM task_assignments WHERE id = $1',
            [assignment.id]
          );
          console.log('Assignment verification:', verifyQuery.rows[0]);
        }
        
        console.log('Task creation summary:', { 
          taskId: task.id, 
          assignmentCount: assignments.length,
          assignmentIds: assignments.map(a => a.id)
        });

        // Send email notifications
        for (const assignment of assignments) {
          try {
            const teamMember = await storage.getTeamMember(assignment.teamMemberId);
            const project = await storage.getProject(req.params.projectId!);
            
            if (teamMember && project) {
              await emailService.sendTaskAssignmentNotification(
                teamMember.email,
                teamMember.name,
                task.title,
                project.name,
                {
                  priority: task.priority ?? undefined,
                  assignedBy: `${user.firstName ?? ''} ${user.lastName ?? ''}`,
                  dueDate: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : undefined,
                  notes: task.notes ?? undefined,
                }
              );
            }
          } catch (emailError) {
            console.error("Failed to send task assignment email:", emailError);
            // Don't fail the task creation if email fails
          }
        }

        // Fire assignment creation hooks for each assignment (idempotent)
        for (const assignment of assignments) {
          try {
            await onAssignmentCreated(assignment.id);
          } catch (calendarError) {
            console.error('Calendar hook error for assignment:', assignment.id, calendarError);
            // Don't fail task creation if calendar sync fails
          }
        }
        
        // Auto-sync calendar event if eligible
        try {
          const { calendarAutoSync } = await import('./calendarAutoSync');
          const syncResult = await calendarAutoSync.syncTaskIfEligible(task.id, userId);
          if (syncResult.ok) {
            console.log(`Auto-synced calendar for task ${task.id}:`, syncResult.eventId);
          } else {
            console.log(`Auto-sync skipped for task ${task.id}:`, syncResult.error);
          }
        } catch (calendarError) {
          console.error('Auto-sync error for task:', task.id, calendarError);
          // Don't fail task creation if calendar sync fails
        }

        res.status(201).json({ task, assignments });
      } catch (transactionError) {
        console.error('Task creation transaction failed:', transactionError);
        throw transactionError;
      }
    } catch (error) {
      console.error("Error creating task:", error);
      if (error instanceof Error) {
        res.status(400).json({ message: `Failed to create task: ${error.message}` });
      } else {
        res.status(500).json({ message: "Failed to create task" });
      }
    }
  });

  // Get individual task route
  app.get('/api/tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const taskId = req.params.id;
      
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }
      
      // Get task assignments to check if user has access
      const assignments = await storage.getTaskAssignments(taskId);
      const isAssigned = assignments.some(assignment => {
        return assignment.teamMember?.email === user.email;
      });
      
      // Allow access if user is admin or assigned to task
      if (user.role !== 'admin' && !isAssigned) {
        return res.status(403).json({ message: 'Not authorized to view this task' });
      }
      
      res.json(task);
    } catch (error) {
      console.error('Error fetching task:', error);
      res.status(500).json({ message: 'Failed to fetch task' });
    }
  });

  // Lightweight manual sync endpoint for UI integration
  app.post('/api/tasks/:id/sync-calendar', isAuthenticated, async (req: any, res) => {
    try {
      const taskId = req.params.id;
      const userId = req.user.claims.sub;
      
      // Get task and verify access
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }
      
      const assignments = await storage.getTaskAssignments(taskId);
      const user = await storage.getUser(userId);
      const isAssigned = assignments.some(assignment => 
        assignment.teamMember?.email === user.email
      );
      
      if (user.role !== 'admin' && !isAssigned) {
        return res.status(403).json({ message: 'Not authorized to sync this task' });
      }
      
      // Use new auto-sync system
      await AutoCalendarSync.onTaskChanged(taskId);
      res.json({ ok: true, message: 'Calendar sync triggered successfully' });
    } catch (error) {
      console.error('Manual sync error:', error);
      res.status(500).json({ message: 'Failed to sync calendar' });
    }
  });

  app.put('/api/tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const taskId = req.params.id;
      
      // Check if user has permission to edit this task (admin or assigned to task)
      const existingTask = await storage.getTask(taskId);
      if (!existingTask) {
        return res.status(404).json({ message: 'Task not found' });
      }
      
      // Get task assignments to check if user is assigned
      const assignments = await storage.getTaskAssignments(taskId);
      const isAssigned = assignments.some(assignment => {
        // Check if user is assigned through team member
        return assignment.teamMember?.email === user.email;
      });
      
      if (user.role !== 'admin' && !isAssigned) {
        return res.status(403).json({ message: 'Not authorized to edit this task' });
      }

      // Parse and validate the request body
      const { title, description, status, priority, dueDate, dueTime, timezone, assigneeUserIds } = req.body;
      
      const updateData: any = {
        title,
        description,
        status,
        priority,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        dueTime,
      };

      // Normalize due_at using new CalendarService time normalization
      if (dueDate) {
        try {
          updateData.dueAt = CalendarService.computeDueAt(dueDate, dueTime);
          console.log('✓ Task update time computation:', { dueDate, dueTime, computed: updateData.dueAt });
        } catch (error: any) {
          console.warn('Time computation failed during update:', error.message);
        }
      }
      
      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      // Update the task
      const updatedTask = await storage.updateTask(taskId, updateData);

      // Auto-sync calendar event using new system
      try {
        await AutoCalendarSync.onTaskChanged(taskId);
        console.log(`Auto-synced calendar for updated task ${taskId}`);
      } catch (calendarError) {
        console.error('Auto-sync error for updated task:', taskId, calendarError);
        // Don't fail task update if calendar sync fails
      }

      // Handle assignment changes if provided
      if (assigneeUserIds && Array.isArray(assigneeUserIds)) {
        // Get current assignments
        const currentAssignments = await storage.getTaskAssignments(taskId);
        const currentTeamMemberIds = currentAssignments.map(a => a.teamMemberId);
        
        // Determine assignments to add and remove
        const toAdd = assigneeUserIds.filter(id => !currentTeamMemberIds.includes(id));
        const toRemove = currentTeamMemberIds.filter(id => !assigneeUserIds.includes(id));
        
        // Remove old assignments
        for (const assignment of currentAssignments) {
          if (toRemove.includes(assignment.teamMemberId)) {
            await storage.deleteTaskAssignment(assignment.id);
            // Fire calendar hook for removal
            const { onAssignmentDeleted } = await import('./hooks/taskCalendarHooks');
            await onAssignmentDeleted(assignment.id);
          }
        }
        
        // Add new assignments
        for (const teamMemberId of toAdd) {
          const newAssignment = await storage.createTaskAssignment({
            taskId,
            teamMemberId,
            assignedBy: userId,
          });
          // Fire calendar hook for new assignment
          const { onAssignmentCreated } = await import('./hooks/taskCalendarHooks');
          await onAssignmentCreated(newAssignment.id);
        }
      }

      // Fire calendar hook for task update if due date/time changed
      if (updateData.dueDate || updateData.dueTime || updateData.dueAt) {
        try {
          await syncAllCalendarEventsForTask(taskId);
          console.log(`Synced calendar events for updated task ${taskId}`);
        } catch (calendarError) {
          console.error('Calendar sync error for task update:', taskId, calendarError);
          // Don't fail task update if calendar sync fails
        }
      }

      res.json({ task: updatedTask });
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({ message: 'Failed to update task' });
    }
  });

  // Task assignment routes
  // Get assignments for a specific team member (team members can view their own)
  app.get('/api/team-members/:teamMemberId/assignments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const { teamMemberId } = req.params;
      
      // Check if user is admin or the team member themselves
      const teamMember = await storage.getTeamMember(teamMemberId);
      if (!teamMember) {
        return res.status(404).json({ message: "Team member not found" });
      }
      
      // Allow access if user is admin or if the team member's email matches the user's email
      if (user?.role !== 'admin' && user?.email !== teamMember.email) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Use the userId-based method for better schema compatibility
      const assignments = await storage.getTaskAssignmentsByUserId(userId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching team member assignments:", error);
      res.status(500).json({ message: "Failed to fetch assignments" });
    }
  });

  // Update task assignment (team members can update their own)
  app.put('/api/task-assignments/:assignmentId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const { assignmentId } = req.params;
      const updates = req.body;
      
      // Get the assignment to check ownership
      const assignments = await storage.getAllTaskAssignments();
      const assignment = assignments.find((a: any) => a.id === assignmentId);
      
      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      
      // Allow access if user is admin or if the assignment belongs to a team member with matching email
      if (user?.role !== 'admin' && user?.email !== assignment.teamMember.email) {
        return res.status(403).json({ message: "Access denied" });
      }

      const updatedAssignment = await storage.updateTaskAssignment(assignmentId, updates);
      res.json(updatedAssignment);
    } catch (error) {
      console.error("Error updating task assignment:", error);
      res.status(500).json({ message: "Failed to update assignment" });
    }
  });

  app.get('/api/admin/task-assignments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can view all task assignments" });
      }

      // Get all task assignments with team member and task details
      const allAssignments = await storage.getAllTaskAssignments();
      res.json(allAssignments);
    } catch (error) {
      console.error("Error fetching all task assignments:", error);
      res.status(500).json({ message: "Failed to fetch task assignments" });
    }
  });

  app.get('/api/tasks/:taskId/assignments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can view task assignments" });
      }

      const assignments = await storage.getTaskAssignments(req.params.taskId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching task assignments:", error);
      res.status(500).json({ message: "Failed to fetch task assignments" });
    }
  });

  app.post('/api/tasks/:taskId/assignments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can create task assignments" });
      }

      const validation = insertTaskAssignmentSchema.safeParse({
        ...req.body,
        taskId: req.params.taskId,
        assignedBy: userId,
      });

      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }

      const assignment = await storage.createTaskAssignment(validation.data);

      // Send notification email to assigned team member
      try {
        const teamMember = await storage.getTeamMember(assignment.teamMemberId);
        const task = await storage.getTasksByProject('').then(tasks => tasks.find(t => t.id === req.params.taskId));
        const project = task ? await storage.getProject(task.projectId) : null;
        
        if (teamMember && task && project) {
          await emailService.sendTaskAssignmentNotification(
            teamMember.email,
            teamMember.name,
            task.title,
            project.name,
            {
              priority: task.priority,
              assignedBy: `${user.firstName} ${user.lastName}`,
              dueDate: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : undefined,
              notes: assignment.notes || undefined,
            }
          );
        }
      } catch (emailError) {
        console.error("Failed to send task assignment email:", emailError);
      }

      // Calendar hook: Assignment created
      await onAssignmentCreated(assignment.id);

      res.status(201).json(assignment);
    } catch (error) {
      console.error("Error creating task assignment:", error);
      res.status(500).json({ message: "Failed to create task assignment" });
    }
  });

  app.get('/api/team-members/:teamMemberId/assignments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const { teamMemberId } = req.params;
      
      // Get the team member to check ownership
      const teamMember = await storage.getTeamMember(teamMemberId);
      if (!teamMember) {
        return res.status(404).json({ message: "Team member not found" });
      }
      
      // Allow access if user is admin or if the team member's email matches the user's email
      if (user?.role !== 'admin' && user?.email !== teamMember.email) {
        return res.status(403).json({ message: "Access denied" });
      }

      const assignments = await storage.getTaskAssignmentsByTeamMember(teamMemberId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching team member assignments:", error);
      res.status(500).json({ message: "Failed to fetch team member assignments" });
    }
  });

  app.put('/api/assignments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can update task assignments" });
      }

      const updates: any = {};
      
      // Only copy non-undefined values from request body
      Object.keys(req.body).forEach(key => {
        if (req.body[key] !== undefined) {
          updates[key] = req.body[key];
        }
      });
      
      // Handle completion status logic
      if ('isCompleted' in updates) {
        if (updates.isCompleted === true && !updates.completedAt) {
          updates.completedAt = new Date();
        } else if (updates.isCompleted === false) {
          updates.completedAt = null;
        }
      }
      
      // Always set updatedAt to current timestamp
      updates.updatedAt = new Date();

      const assignment = await storage.updateTaskAssignment(req.params.id, updates);
      res.json(assignment);
    } catch (error) {
      console.error("Error updating task assignment:", error);
      res.status(500).json({ message: "Failed to update task assignment" });
    }
  });

  app.delete('/api/assignments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can delete task assignments" });
      }

      // Calendar hook: Assignment deleted
      await onAssignmentDeleted(req.params.id);
      
      await storage.deleteTaskAssignment(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting task assignment:", error);
      res.status(500).json({ message: "Failed to delete task assignment" });
    }
  });

  // File routes
  app.get('/api/projects/:projectId/files', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const project = await storage.getProject(req.params.projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check access permissions
      if (user?.role !== 'admin' && project.clientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const files = await storage.getFilesByProject(req.params.projectId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ message: "Failed to fetch files" });
    }
  });

  app.post('/api/projects/:projectId/files', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const project = await storage.getProject(req.params.projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check access permissions
      if (user?.role !== 'admin' && project.clientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const fileData = {
        projectId: req.params.projectId,
        fileName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        category: req.body.category || 'document',
        uploadedBy: userId,
        isApprovalRequired: req.body.isApprovalRequired === 'true',
      };

      const file = await storage.createProjectFile(fileData);
      res.status(201).json(file);
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  app.get('/api/files/:id/download', isAuthenticated, async (req: any, res) => {
    try {
      const file = await storage.getProjectFile(req.params.id);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }

      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const project = await storage.getProject(file.projectId);
      
      // Check access permissions
      if (user?.role !== 'admin' && project?.clientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!fs.existsSync(file.filePath)) {
        return res.status(404).json({ message: "File not found on disk" });
      }

      res.download(file.filePath, file.fileName);
    } catch (error) {
      console.error("Error downloading file:", error);
      res.status(500).json({ message: "Failed to download file" });
    }
  });

  // Analytics routes
  app.get('/api/projects/:projectId/analytics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const project = await storage.getProject(req.params.projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check access permissions
      if (user?.role !== 'admin' && project.clientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const analytics = await storage.getAnalyticsByProject(req.params.projectId, startDate, endDate);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.post('/api/projects/:projectId/analytics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can create analytics" });
      }

      const analyticsData = insertAnalyticsSchema.parse({
        ...req.body,
        projectId: req.params.projectId,
      });
      
      const analytics = await storage.createAnalytics(analyticsData);
      res.status(201).json(analytics);
    } catch (error) {
      console.error("Error creating analytics:", error);
      res.status(500).json({ message: "Failed to create analytics" });
    }
  });

  // Message routes
  app.get('/api/projects/:projectId/messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const project = await storage.getProject(req.params.projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check access permissions
      if (user?.role !== 'admin' && project.clientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const messages = await storage.getMessagesByProject(req.params.projectId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post('/api/projects/:projectId/messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      const project = await storage.getProject(req.params.projectId);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check access permissions
      if (user?.role !== 'admin' && project.clientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const messageData = insertMessageSchema.parse({
        ...req.body,
        projectId: req.params.projectId,
        senderId: userId,
      });
      
      const message = await storage.createMessage(messageData);
      res.status(201).json(message);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ message: "Failed to create message" });
    }
  });

  // QA Calendar Test route - One-click self-test
  app.get('/api/qa/calendar-test', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can run QA tests" });
      }

      const { qaCalendarTest } = await import('./qaCalendarTest');
      const results = await qaCalendarTest.runFullQATest();
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        ...results
      });
    } catch (error) {
      console.error('QA Calendar Test error:', error);
      res.status(500).json({ 
        success: false,
        message: 'QA test failed',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Service category routes
  app.get('/api/service-categories', isAuthenticated, async (req: any, res) => {
    try {
      const categories = await storage.getServiceCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching service categories:", error);
      res.status(500).json({ message: "Failed to fetch service categories" });
    }
  });

  app.post('/api/service-categories', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can create service categories" });
      }

      const category = await storage.createServiceCategory(req.body);
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creating service category:", error);
      res.status(500).json({ message: "Failed to create service category" });
    }
  });

  app.put('/api/service-categories/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can update service categories" });
      }

      const category = await storage.updateServiceCategory(req.params.id, req.body);
      res.json(category);
    } catch (error) {
      console.error("Error updating service category:", error);
      res.status(500).json({ message: "Failed to update service category" });
    }
  });

  app.delete('/api/service-categories/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can delete service categories" });
      }

      await storage.deleteServiceCategory(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting service category:", error);
      res.status(500).json({ message: "Failed to delete service category" });
    }
  });

  // Services routes (for admin to manage available services)
  app.get('/api/services', isAuthenticated, async (req: any, res) => {
    try {
      const services = await storage.getServices();
      res.json(services);
    } catch (error) {
      console.error("Error fetching services:", error);
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  // Create new service
  app.post('/api/services', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can create services" });
      }

      console.log("Creating service with data:", req.body);
      
      // Validate required fields
      const { name, categoryId } = req.body;
      if (!name || !categoryId) {
        return res.status(400).json({ message: "Service name and category are required" });
      }

      const newService = await storage.createService(req.body);
      console.log("Successfully created service:", newService);
      res.status(201).json(newService);
    } catch (error: any) {
      console.error("Error creating service:", error);
      res.status(500).json({ message: `Failed to create service: ${error.message}` });
    }
  });

  // Update service
  app.put('/api/services/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can update services" });
      }

      console.log("Updating service with data:", req.body);
      
      const updatedService = await storage.updateService(req.params.id, req.body);
      console.log("Successfully updated service:", updatedService);
      res.json(updatedService);
    } catch (error: any) {
      console.error("Error updating service:", error);
      res.status(500).json({ message: `Failed to update service: ${error.message}` });
    }
  });

  // Delete service
  app.delete('/api/services/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can delete services" });
      }

      console.log("Deleting service:", req.params.id);
      
      await storage.deleteService(req.params.id);
      console.log("Successfully deleted service:", req.params.id);
      res.json({ message: "Service deleted successfully" });
    } catch (error) {
      console.error("Error deleting service:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ message: `Failed to delete service: ${message}` });
    }
  });

  // Admin routes
  app.get('/api/admin/projects', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const projects = await storage.getAllProjects();
      res.json(projects);
    } catch (error) {
      console.error("Error fetching admin projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.post('/api/admin/projects', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { 
        name, 
        description, 
        clientId,
        organizationId,
        budget, 
        startDate, 
        expectedCompletion 
      } = req.body;

      console.log("Creating project with data:", req.body);

      if (!name || !organizationId) {
        return res.status(400).json({ message: "Project name and organization selection are required" });
      }

      // Verify that the organization exists
      const organization = await storage.getOrganization(organizationId);
      if (!organization) {
        return res.status(400).json({ message: "Selected organization not found" });
      }

      const projectData = {
        name,
        description: description || null,
        clientId: clientId || null, // Optional - can be assigned later
        organizationId: organization.id,
        budget: budget || null,
        startDate: startDate ? new Date(startDate) : null,
        expectedCompletion: expectedCompletion ? new Date(expectedCompletion) : null,
        status: 'active',
        progress: 0
      };

      const newProject = await storage.createProject(projectData);
      console.log("Successfully created project:", newProject);
      res.status(201).json(newProject);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: `Failed to create project: ${error.message}` });
    }
  });

  // Update project endpoint
  app.put('/api/admin/projects/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { 
        name, 
        description, 
        budget, 
        startDate, 
        expectedCompletion,
        status,
        progress
      } = req.body;

      console.log("Updating project with data:", req.body);

      if (!name) {
        return res.status(400).json({ message: "Project name is required" });
      }

      // Verify project exists
      const existingProject = await storage.getProject(req.params.id);
      if (!existingProject) {
        return res.status(404).json({ message: "Project not found" });
      }

      const updateData = {
        name,
        description: description || null,
        budget: budget || null,
        startDate: startDate ? new Date(startDate) : null,
        expectedCompletion: expectedCompletion ? new Date(expectedCompletion) : null,
        status: status || 'active',
        progress: typeof progress === 'number' ? progress : 0,
        updatedAt: new Date()
      };

      const updatedProject = await storage.updateProject(req.params.id, updateData);
      console.log("Successfully updated project:", updatedProject);
      res.json(updatedProject);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ message: `Failed to update project: ${error.message}` });
    }
  });

  // Update project Google Drive links
  app.put('/api/admin/projects/:id/google-drive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { googleDriveFolderId, googleDriveFolderUrl } = req.body;
      
      // Verify project exists
      const existingProject = await storage.getProject(req.params.id);
      if (!existingProject) {
        return res.status(404).json({ message: "Project not found" });
      }

      const updateData = {
        googleDriveFolderId: googleDriveFolderId || null,
        googleDriveFolderUrl: googleDriveFolderUrl || null,
        updatedAt: new Date()
      };

      const updatedProject = await storage.updateProject(req.params.id, updateData);
      console.log("Successfully updated project Google Drive links:", updatedProject);
      res.json(updatedProject);
    } catch (error) {
      console.error("Error updating project Google Drive links:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ message: `Failed to update Google Drive links: ${message}` });
    }
  });

  // Update project status
  app.put('/api/admin/projects/:id/status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can update project status" });
      }

      const { status } = req.body;
      const project = await storage.updateProject(req.params.id, { status });
      res.json(project);
    } catch (error) {
      console.error("Error updating project status:", error);
      res.status(500).json({ message: "Failed to update project status" });
    }
  });

  // Reorder projects within an organization
  app.put('/api/admin/organizations/:orgId/projects/reorder', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can reorder projects" });
      }

      const { projectOrders } = req.body; // Array of { id, displayOrder }
      await storage.updateProjectOrder(req.params.orgId, projectOrders);
      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering projects:", error);
      res.status(500).json({ message: "Failed to reorder projects" });
    }
  });

  app.get('/api/admin/clients', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const clients = await storage.getClientUsers();
      res.json(clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  // Individual project route (for client view)
  app.get('/api/projects/:id', isAuthenticated, async (req: any, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      // Check access permissions
      if (user?.role !== 'admin' && project.clientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  // File preview route (for viewing images and documents)
  app.get('/api/projects/:projectId/files/:fileId/preview', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId, fileId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      // Get the project to check permissions
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check access permissions
      if (user?.role !== 'admin' && project.clientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get the file
      const file = await storage.getProjectFile(fileId);
      if (!file || file.projectId !== projectId) {
        return res.status(404).json({ message: "File not found" });
      }

      // For clients, same access rules apply for preview as download
      if (user?.role !== 'admin' && file.isApprovalRequired && file.isApproved === null) {
        return res.status(403).json({ message: "File is pending approval and cannot be viewed yet" });
      }

      // Set appropriate headers for inline viewing
      res.setHeader('Content-Type', file.fileType || 'application/octet-stream');
      
      // For now, return a placeholder response since we don't have actual file storage
      // In a real implementation, you would stream the actual file content
      res.status(200).send("File preview placeholder - actual file content would be streamed here");
    } catch (error) {
      console.error("Error previewing file:", error);
      res.status(500).json({ message: "Failed to preview file" });
    }
  });

  // File download route with access control
  app.get('/api/projects/:projectId/files/:fileId/download', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId, fileId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      // Get the project to check permissions
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check access permissions
      if (user?.role !== 'admin' && project.clientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get the file
      const file = await storage.getProjectFile(fileId);
      if (!file || file.projectId !== projectId) {
        return res.status(404).json({ message: "File not found" });
      }

      // For clients, they can download files that are:
      // - Approved (is_approved = true)
      // - Need changes (is_approved = false) - so they can see iteration history
      // - Don't require approval (is_approval_required = false)
      // They cannot download files pending approval (is_approved = null)
      if (user?.role !== 'admin' && file.isApprovalRequired && file.isApproved === null) {
        return res.status(403).json({ message: "File is pending approval and cannot be downloaded yet" });
      }

      // Set appropriate headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.setHeader('Content-Type', file.fileType || 'application/octet-stream');

      // In a real implementation, you would serve the actual file from storage
      // For now, we'll just return file metadata
      res.json({
        message: `Downloading ${file.fileName}`,
        fileName: file.fileName,
        fileType: file.fileType,
        filePath: file.filePath,
        category: file.category,
        isApproved: file.isApproved,
        uploadedAt: file.uploadedAt
      });
    } catch (error) {
      console.error("Error downloading file:", error);
      res.status(500).json({ message: "Failed to download file" });
    }
  });

  // Get project KPIs
  app.get('/api/projects/:projectId/kpis', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      // Get the project to check permissions
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Check access permissions
      if (user?.role !== 'admin' && project.clientId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const kpis = await storage.getKpisByProject(projectId);
      res.json(kpis);
    } catch (error) {
      console.error("Error fetching KPIs:", error);
      res.status(500).json({ message: "Failed to fetch KPIs" });
    }
  });

  // Create project KPI (admin only)
  app.post('/api/projects/:projectId/kpis', isAuthenticated, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      // Only admins can create KPIs
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can create KPIs" });
      }

      const kpiData = {
        ...req.body,
        projectId,
        createdBy: userId,
      };

      const kpi = await storage.createKpi(kpiData);
      res.status(201).json(kpi);
    } catch (error) {
      console.error("Error creating KPI:", error);
      res.status(500).json({ message: "Failed to create KPI" });
    }
  });

  // Update KPI (admin only)
  app.put('/api/projects/:projectId/kpis/:kpiId', isAuthenticated, async (req: any, res) => {
    try {
      const { kpiId } = req.params;
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      // Only admins can update KPIs
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can update KPIs" });
      }

      const updatedKpi = await storage.updateKpi(kpiId, req.body);
      if (!updatedKpi) {
        return res.status(404).json({ message: "KPI not found" });
      }

      res.json(updatedKpi);
    } catch (error) {
      console.error("Error updating KPI:", error);
      res.status(500).json({ message: "Failed to update KPI" });
    }
  });

  // Team invitation routes (admin only)
  app.get('/api/admin/team-invitations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can view team invitations" });
      }

      const invitations = await storage.getTeamInvitations();
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching team invitations:", error);
      res.status(500).json({ message: "Failed to fetch team invitations" });
    }
  });

  app.post('/api/admin/team-invitations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can send invitations" });
      }

      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail?.(email);
      if (existingUser) {
        return res.status(400).json({ message: "User with this email already exists" });
      }

      // Check if invitation already exists
      const existingInvitations = await storage.getTeamInvitations();
      const pendingInvitation = existingInvitations.find(inv => 
        inv.email === email && inv.status === 'pending'
      );
      
      if (pendingInvitation) {
        return res.status(400).json({ message: "Invitation already sent to this email" });
      }

      // Create invitation token
      const invitationToken = Math.random().toString(36).substr(2, 32);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      const invitation = await storage.createTeamInvitation({
        email,
        invitedBy: userId,
        role: 'admin',
        status: 'pending',
        invitationToken,
        expiresAt,
      });

      res.status(201).json({ 
        message: "Invitation sent successfully",
        invitation: {
          ...invitation,
          invitationToken: undefined // Don't send token in response
        },
        invitationLink: `${req.protocol}://${req.get('host')}/invite/${invitationToken}`
      });
    } catch (error) {
      console.error("Error creating team invitation:", error);
      res.status(500).json({ message: "Failed to create invitation" });
    }
  });

  // Accept invitation endpoint
  app.post('/api/accept-invitation/:token', async (req, res) => {
    try {
      const { token } = req.params;
      
      const invitation = await storage.getTeamInvitationByToken(token);
      if (!invitation) {
        return res.status(404).json({ message: "Invalid invitation token" });
      }

      if (invitation.status !== 'pending') {
        return res.status(400).json({ message: "Invitation has already been used or expired" });
      }

      if (new Date() > invitation.expiresAt) {
        return res.status(400).json({ message: "Invitation has expired" });
      }

      // Mark invitation as accepted
      await storage.updateTeamInvitationStatus(invitation.id, 'accepted', new Date());

      res.json({ 
        message: "Invitation accepted successfully",
        redirectTo: "/api/login" // Redirect to login to complete registration
      });
    } catch (error) {
      console.error("Error accepting invitation:", error);
      res.status(500).json({ message: "Failed to accept invitation" });
    }
  });

  // Organization task routes removed - all tasks are now project-based

  // Organization management routes (admin only)
  app.get('/api/admin/organizations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can view organizations" });
      }

      const organizations = await storage.getOrganizations();
      res.json(organizations);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });

  app.post('/api/admin/organizations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can create organizations" });
      }

      // Validate required fields
      const { name, description, website, industry, primaryContactId } = req.body;
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: "Organization name is required" });
      }

      const organizationData = {
        name: name.trim(),
        description: description || null,
        website: website || null,
        industry: industry || null,
        primaryContactId: primaryContactId || null,
      };

      console.log("Creating organization with data:", organizationData);
      const organization = await storage.createOrganization(organizationData);
      console.log("Successfully created organization:", organization);
      
      res.status(201).json(organization);
    } catch (error) {
      console.error("Detailed error creating organization:", error);
      
      // Check if it's a database constraint error
      if (error.message && error.message.includes('unexpected token')) {
        return res.status(400).json({ 
          message: "Invalid data format. Please check all fields are properly filled.",
          details: error.message 
        });
      }
      
      res.status(500).json({ 
        message: "Failed to create organization",
        details: error.message || "Unknown error"
      });
    }
  });

  app.put('/api/admin/organizations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can update organizations" });
      }

      const { name, description, website, industry, primaryContactId } = req.body;
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ message: "Organization name is required" });
      }

      const organizationData = {
        name: name.trim(),
        description: description || null,
        website: website || null,
        industry: industry || null,
        primaryContactId: primaryContactId || null,
      };

      const organization = await storage.updateOrganization(req.params.id, organizationData);
      res.json(organization);
    } catch (error) {
      console.error("Error updating organization:", error);
      res.status(500).json({ 
        message: "Failed to update organization",
        details: error.message || "Unknown error"
      });
    }
  });

  app.get('/api/admin/organizations/:id/users', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can view organization users" });
      }

      const users = await storage.getOrganizationUsers(req.params.id);
      res.json(users);
    } catch (error) {
      console.error("Error fetching organization users:", error);
      res.status(500).json({ message: "Failed to fetch organization users" });
    }
  });

  // Assign user to organization
  app.put('/api/admin/users/:userId/organization', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can manage user organizations" });
      }

      const { organizationId } = req.body;
      
      if (organizationId) {
        const updatedUser = await storage.assignUserToOrganization(req.params.userId, organizationId);
        res.json(updatedUser);
      } else {
        const updatedUser = await storage.removeUserFromOrganization(req.params.userId);
        res.json(updatedUser);
      }
    } catch (error) {
      console.error("Error updating user organization:", error);
      res.status(500).json({ message: "Failed to update user organization" });
    }
  });

  // Create new client
  app.post('/api/admin/clients', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can create clients" });
      }

      console.log("Creating client with data:", req.body);
      
      // Validate required fields
      const { firstName, lastName, email } = req.body;
      if (!firstName || !lastName || !email) {
        return res.status(400).json({ message: "First name, last name, and email are required" });
      }

      const newClient = await storage.createClient(req.body);
      console.log("Successfully created client:", newClient);
      res.status(201).json(newClient);
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).json({ message: `Failed to create client: ${error.message}` });
    }
  });

  // Update existing client
  app.put('/api/admin/clients/:clientId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can update clients" });
      }

      const clientId = req.params.clientId;
      console.log("Updating client with data:", req.body);
      
      // Validate email is provided
      const { email } = req.body;
      if (!email || !email.trim()) {
        return res.status(400).json({ message: "Email is required" });
      }

      const updatedClient = await storage.updateUser(clientId, req.body);
      if (!updatedClient) {
        return res.status(404).json({ message: "Client not found" });
      }

      console.log("Successfully updated client:", updatedClient);
      res.json(updatedClient);
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({ message: `Failed to update client: ${error.message}` });
    }
  });

  // Delete client
  app.delete('/api/admin/clients/:clientId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can delete clients" });
      }

      const clientId = req.params.clientId;
      console.log("Deleting client:", clientId);
      
      await storage.deleteUser(clientId);
      console.log("Successfully deleted client:", clientId);
      res.json({ message: "Client deleted successfully" });
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ message: `Failed to delete client: ${error.message}` });
    }
  });

  // HeyGen Avatar integration routes
  app.post('/api/heygen/generate-video', isAuthenticated, async (req: any, res) => {
    try {
      const { message, clientName, organizationName, videoType } = req.body;
      
      if (!message || !clientName) {
        return res.status(400).json({ message: "Message and client name are required" });
      }

      // Check if HeyGen API key is configured
      const heygenApiKey = process.env.HEYGEN_API_KEY;
      if (!heygenApiKey) {
        return res.status(500).json({ 
          message: "HeyGen API key not configured. Please add HEYGEN_API_KEY to environment variables." 
        });
      }

      console.log("Generating HeyGen video for:", clientName);

      // Call HeyGen API to generate video
      const heygenResponse = await fetch('https://api.heygen.com/v2/video/generate', {
        method: 'POST',
        headers: {
          'X-Api-Key': heygenApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          video_inputs: [{
            character: {
              type: "avatar",
              avatar_id: "Daisy-inskirt-20220818", // Default professional avatar
              avatar_style: "normal"
            },
            voice: {
              type: "text", 
              input_text: message,
              voice_id: "2d5b0e6cf36f460aa7fc47e3eee4ba54" // Professional female voice
            },
            background: {
              type: "color",
              value: "#f8fafc" // Light gray background
            }
          }],
          dimension: {
            width: 1280,
            height: 720
          },
          aspect_ratio: "16:9"
        })
      });

      if (!heygenResponse.ok) {
        const errorData = await heygenResponse.text();
        console.error("HeyGen API error:", errorData);
        return res.status(500).json({ 
          message: "Failed to generate video with HeyGen API",
          error: errorData
        });
      }

      const heygenData = await heygenResponse.json();
      console.log("HeyGen video generation initiated:", heygenData.data.video_id);

      res.json({
        success: true,
        videoId: heygenData.data.video_id,
        message: "Video generation started. Check status to get download URL."
      });
    } catch (error) {
      console.error("Error generating HeyGen video:", error);
      res.status(500).json({ 
        message: "Failed to generate welcome video",
        error: error.message 
      });
    }
  });

  // Check HeyGen video generation status
  app.get('/api/heygen/video-status/:videoId', isAuthenticated, async (req: any, res) => {
    try {
      const { videoId } = req.params;
      const heygenApiKey = process.env.HEYGEN_API_KEY;
      
      if (!heygenApiKey) {
        return res.status(500).json({ message: "HeyGen API key not configured" });
      }

      const statusResponse = await fetch(`https://api.heygen.com/v1/video_status/${videoId}`, {
        headers: {
          'X-Api-Key': heygenApiKey
        }
      });

      if (!statusResponse.ok) {
        const errorData = await statusResponse.text();
        return res.status(500).json({ 
          message: "Failed to check video status",
          error: errorData 
        });
      }

      const statusData = await statusResponse.json();
      res.json(statusData);
    } catch (error) {
      console.error("Error checking video status:", error);
      res.status(500).json({ 
        message: "Failed to check video status",
        error: error.message 
      });
    }
  });

  // Get video thumbnail placeholder
  app.get('/api/heygen/video-thumbnail', async (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(`
      <svg width="640" height="360" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#f1f5f9"/>
        <circle cx="320" cy="140" r="40" fill="#3b82f6"/>
        <polygon points="310,125 310,155 340,140" fill="white"/>
        <text x="320" y="200" text-anchor="middle" font-family="Arial" font-size="16" fill="#64748b">
          Welcome Video Thumbnail
        </text>
      </svg>
    `);
  });

  // Team member management routes
  app.get("/api/team-members", isAuthenticated, async (req, res) => {
    try {
      const teamMembers = await storage.getAllTeamMembers();
      res.json(teamMembers);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ error: "Failed to fetch team members" });
    }
  });

  app.get("/api/admin/team-members", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const teamMembers = await storage.getAllTeamMembers();
      // Filter for active team members only
      const activeTeamMembers = teamMembers.filter(member => member.isActive);
      res.json(activeTeamMembers);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ error: "Failed to fetch team members" });
    }
  });

  app.post("/api/team-members", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);

      const validation = insertTeamMemberSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error });
      }
      
      // Check if email already exists
      const existingMember = await storage.getTeamMemberByEmail(validation.data.email);
      if (existingMember) {
        return res.status(400).json({ error: "Team member with this email already exists" });
      }
      
      const teamMember = await storage.createTeamMember(validation.data);

      // Send welcome email to new team member
      try {
        await emailService.sendTeamMemberWelcomeEmail(
          teamMember.email,
          teamMember.name,
          "Your Agency", // You can customize this agency name
          {
            role: teamMember.role,
            addedBy: `${user?.firstName} ${user?.lastName}`,
          }
        );
      } catch (emailError) {
        console.error("Failed to send welcome email to team member:", emailError);
        // Don't fail the team member creation if email fails
      }

      res.status(201).json(teamMember);
    } catch (error) {
      console.error("Error creating team member:", error);
      res.status(500).json({ error: "Failed to create team member" });
    }
  });

  app.put("/api/team-members/:id", isAuthenticated, async (req, res) => {
    try {
      const teamMember = await storage.updateTeamMember(req.params.id, req.body);
      res.json(teamMember);
    } catch (error) {
      console.error("Error updating team member:", error);
      res.status(500).json({ error: "Failed to update team member" });
    }
  });

  app.delete("/api/team-members/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteTeamMember(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting team member:", error);
      res.status(500).json({ error: "Failed to delete team member" });
    }
  });

  // Facebook Integration Routes with Nango
  app.post("/api/facebook/connect", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { connectionId } = req.body;
      
      if (!connectionId) {
        return res.status(400).json({ error: "Connection ID is required" });
      }

      const result = await nangoService.createFacebookConnection(connectionId, userId);
      res.json(result);
    } catch (error) {
      console.error("Error creating Facebook connection:", error);
      res.status(500).json({ error: "Failed to create Facebook connection" });
    }
  });

  app.get("/api/facebook/connections", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const connections = await nangoService.getUserConnections(userId);
      
      // Check connection status for each
      const connectionsWithStatus = await Promise.all(
        connections.map(async (conn) => {
          const isConnected = await nangoService.getConnectionStatus(conn.connectionId);
          return { ...conn, isConnected };
        })
      );
      
      res.json(connectionsWithStatus);
    } catch (error) {
      console.error("Error fetching Facebook connections:", error);
      res.status(500).json({ error: "Failed to fetch Facebook connections" });
    }
  });

  app.get("/api/facebook/ads-data", isAuthenticated, async (req, res) => {
    try {
      const { connectionId } = req.query;
      if (!connectionId || typeof connectionId !== 'string') {
        return res.status(400).json({ error: "Connection ID is required" });
      }
      const adsData = await nangoService.getFacebookAdsData(connectionId);
      res.json(adsData);
    } catch (error) {
      console.error("Error fetching Facebook ads data:", error);
      res.status(500).json({ error: "Failed to fetch Facebook ads data" });
    }
  });

  app.delete("/api/facebook/connections/:connectionId", isAuthenticated, async (req, res) => {
    try {
      const { connectionId } = req.params;
      await nangoService.deleteFacebookConnection(connectionId);
      res.json({ message: "Connection deleted successfully" });
    } catch (error) {
      console.error("Error deleting Facebook connection:", error);
      res.status(500).json({ error: "Failed to delete Facebook connection" });
    }
  });

  app.post("/api/facebook/sync", isAuthenticated, async (req, res) => {
    try {
      const { connectionId, syncName } = req.body;
      
      if (!connectionId || !syncName) {
        return res.status(400).json({ error: "Connection ID and sync name are required" });
      }

      await nangoService.triggerSync(connectionId, syncName);
      res.json({ message: "Sync triggered successfully" });
    } catch (error) {
      console.error("Error triggering Facebook sync:", error);
      res.status(500).json({ error: "Failed to trigger sync" });
    }
  });

  // Quote management routes
  app.get("/api/quotes", isAuthenticated, async (req, res) => {
    try {
      const quotes = await storage.getQuotes();
      res.json(quotes);
    } catch (error) {
      console.error("Error fetching quotes:", error);
      res.status(500).json({ error: "Failed to fetch quotes" });
    }
  });

  app.post("/api/quotes/upload", isAuthenticated, upload.single("quote"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const userId = req.user.claims.sub;
      const file = req.file;

      // Generate quote number
      const quoteNumber = `Q-${Date.now()}`;

      // Extract basic info from filename
      const title = file.originalname.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

      const quoteData = {
        quoteNumber,
        title,
        description: `Uploaded quote from ${file.originalname}`,
        totalAmount: "0", // Will be updated later
        status: "draft",
        filePath: file.path,
        fileName: file.originalname,
        fileSize: file.size,
        createdBy: userId,
      };

      const quote = await storage.createQuote(quoteData);
      res.json(quote);
    } catch (error) {
      console.error("Error uploading quote:", error);
      res.status(500).json({ error: "Failed to upload quote" });
    }
  });

  app.post("/api/quotes/:id/convert", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const project = await storage.convertQuoteToProject(id);
      res.json(project);
    } catch (error) {
      console.error("Error converting quote to project:", error);
      res.status(500).json({ error: "Failed to convert quote to project" });
    }
  });

  app.get("/api/quotes/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const quote = await storage.getQuote(id);
      if (!quote) {
        return res.status(404).json({ error: "Quote not found" });
      }
      res.json(quote);
    } catch (error) {
      console.error("Error fetching quote:", error);
      res.status(500).json({ error: "Failed to fetch quote" });
    }
  });

  app.put("/api/quotes/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const quote = await storage.updateQuote(id, updates);
      res.json(quote);
    } catch (error) {
      console.error("Error updating quote:", error);
      res.status(500).json({ error: "Failed to update quote" });
    }
  });

  // Proposal Management Routes
  app.get('/api/admin/proposals', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const proposals = await storage.getProposals();
      
      // Enrich proposals with items, client, and organization data
      const enrichedProposals = await Promise.all(proposals.map(async (proposal) => {
        const [items, client, organization] = await Promise.all([
          storage.getProposalItems(proposal.id),
          proposal.clientId ? storage.getUser(proposal.clientId) : null,
          proposal.organizationId ? storage.getOrganization(proposal.organizationId) : null
        ]);
        
        return {
          ...proposal,
          items,
          client,
          organization
        };
      }));
      
      res.json(enrichedProposals);
    } catch (error) {
      console.error("Error fetching proposals:", error);
      res.status(500).json({ message: "Failed to fetch proposals" });
    }
  });

  app.post('/api/admin/proposals', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const proposalData = insertProposalSchema.parse(req.body);
      proposalData.proposalNumber = `PROP-${Date.now()}`;
      
      const proposal = await storage.createProposal(proposalData);
      res.status(201).json(proposal);
    } catch (error) {
      console.error("Error creating proposal:", error);
      res.status(500).json({ message: "Failed to create proposal" });
    }
  });

  app.post('/api/admin/proposal-items', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const itemData = insertProposalItemSchema.parse(req.body);
      const item = await storage.createProposalItem(itemData);
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating proposal item:", error);
      res.status(500).json({ message: "Failed to create proposal item" });
    }
  });

  app.put('/api/admin/proposals/:id/approve', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { itemApprovals } = req.body;
      
      for (const [itemId, isApproved] of Object.entries(itemApprovals)) {
        await storage.updateProposalItem(itemId, { isApproved: !!isApproved });
      }
      
      res.json({ message: "Proposal approvals updated" });
    } catch (error) {
      console.error("Error updating proposal approvals:", error);
      res.status(500).json({ message: "Failed to update approvals" });
    }
  });

  app.post('/api/admin/proposals/:id/convert', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { id } = req.params;
      const proposal = await storage.getProposal(id);
      
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }

      const approvedItems = await storage.getProposalItems(id);
      const approvedItemsList = approvedItems.filter(item => item.isApproved);
      
      if (approvedItemsList.length === 0) {
        return res.status(400).json({ message: "No approved items to convert" });
      }

      const createdProjects = [];
      
      for (const item of approvedItemsList) {
        const projectData = {
          name: item.title,
          description: item.description || '',
          clientId: proposal.clientId!,
          organizationId: proposal.organizationId,
          budget: item.amount,
          status: 'active',
          progress: 0,
          startDate: new Date(),
          expectedCompletion: null
        };
        
        const project = await storage.createProject(projectData);
        createdProjects.push(project);
      }

      await storage.updateProposal(id, {
        status: 'converted',
        convertedToProjectsAt: new Date()
      });

      res.json({ 
        message: `Successfully converted ${createdProjects.length} approved items to projects`,
        projects: createdProjects 
      });
    } catch (error) {
      console.error("Error converting proposal to projects:", error);
      res.status(500).json({ message: "Failed to convert proposal to projects" });
    }
  });

  // Soft delete endpoints (admin only)
  app.delete('/api/admin/organizations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const result = await storage.softDeleteOrganization(req.params.id, userId);
      res.json({ message: "Organization deleted successfully" });
    } catch (error) {
      console.error("Error deleting organization:", error);
      res.status(500).json({ message: "Failed to delete organization" });
    }
  });

  app.delete('/api/admin/clients/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const result = await storage.softDeleteUser(req.params.id, userId);
      res.json({ message: "Client deleted successfully" });
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ message: "Failed to delete client" });
    }
  });

  app.delete('/api/admin/projects/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const result = await storage.softDeleteProject(req.params.id, userId);
      res.json({ message: "Project deleted successfully" });
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  app.delete('/api/admin/services/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const result = await storage.softDeleteService(req.params.id, userId);
      res.json({ message: "Service deleted successfully" });
    } catch (error) {
      console.error("Error deleting service:", error);
      res.status(500).json({ message: "Failed to delete service" });
    }
  });

  app.delete('/api/admin/tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const result = await storage.softDeleteTask(req.params.id, userId);
      res.json({ message: "Task deleted successfully" });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  app.delete('/api/admin/proposals/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const result = await storage.softDeleteProposal(req.params.id, userId);
      res.json({ message: "Proposal deleted successfully" });
    } catch (error) {
      console.error("Error deleting proposal:", error);
      res.status(500).json({ message: "Failed to delete proposal" });
    }
  });

  // Additional soft delete endpoints for frontend compatibility
  app.delete('/api/organizations/:id/soft', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Get all projects for this organization first
      const orgProjects = await storage.getProjectsByOrganization(req.params.id);
      
      // Delete all task assignments and tasks for projects in this organization
      for (const project of orgProjects) {
        const projectTasks = await storage.getProjectTasks(project.id);
        for (const task of projectTasks) {
          await storage.deleteTaskAssignments(task.id);
        }
        await storage.deleteProjectTasks(project.id);
      }

      const result = await storage.softDeleteOrganization(req.params.id, userId);
      res.json({ message: "Organization and related tasks deleted successfully" });
    } catch (error) {
      console.error("Error deleting organization:", error);
      res.status(500).json({ message: "Failed to delete organization" });
    }
  });

  app.delete('/api/projects/:id/soft', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Delete all task assignments and tasks for this project
      const projectTasks = await storage.getProjectTasks(req.params.id);
      for (const task of projectTasks) {
        await storage.deleteTaskAssignments(task.id);
      }
      await storage.deleteProjectTasks(req.params.id);

      const result = await storage.softDeleteProject(req.params.id, userId);
      res.json({ message: "Project and related tasks deleted successfully" });
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  app.delete('/api/tasks/:id/soft', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const result = await storage.softDeleteTask(req.params.id, userId);
      res.json({ message: "Task deleted successfully" });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // Get deleted items endpoint (admin only)
  app.get('/api/admin/deleted-items', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const deletedItems = await storage.getDeletedItems();
      res.json(deletedItems);
    } catch (error) {
      console.error("Error fetching deleted items:", error);
      res.status(500).json({ message: "Failed to fetch deleted items" });
    }
  });

  // Restore endpoints (admin only)
  app.post('/api/admin/restore/:type/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { type, id } = req.params;
      let result;

      switch (type) {
        case 'organization':
          result = await storage.restoreOrganization(id);
          break;
        case 'user':
          result = await storage.restoreUser(id);
          break;
        case 'project':
          result = await storage.restoreProject(id);
          break;
        case 'service':
          result = await storage.restoreService(id);
          break;
        case 'task':
          result = await storage.restoreTask(id);
          break;
        case 'proposal':
          result = await storage.restoreProposal(id);
          break;
        default:
          return res.status(400).json({ message: "Invalid item type" });
      }

      res.json({ message: `${type.charAt(0).toUpperCase() + type.slice(1)} restored successfully` });
    } catch (error) {
      console.error("Error restoring item:", error);
      res.status(500).json({ message: "Failed to restore item" });
    }
  });

  // Google Calendar integration routes
  app.get('/api/auth/google/calendar', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const authUrl = googleCalendarService.getAuthUrl(userId);
      res.json({ authUrl });
    } catch (error) {
      console.error('Error getting Google auth URL:', error);
      res.status(500).json({ message: 'Failed to get authorization URL' });
    }
  });



  app.post('/api/tasks/:id/sync-calendar', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const taskId = req.params.id;

      // Get the task with project info
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: 'Task not found' });
      }

      // Get project name if it's a project task
      let projectName = null;
      if (task.projectId) {
        const project = await storage.getProject(task.projectId);
        projectName = project?.name;
      }

      // Create calendar event
      const eventId = await googleCalendarService.createTaskEvent(userId, {
        ...task,
        projectName
      });

      if (eventId) {
        // Store the event ID in the task
        await storage.updateTaskCalendarEvent(taskId, eventId);
        res.json({ success: true, eventId });
      } else {
        res.status(500).json({ message: 'Failed to create calendar event' });
      }
    } catch (error) {
      console.error('Error syncing task to calendar:', error);
      res.status(500).json({ message: 'Failed to sync task to calendar' });
    }
  });

  app.delete('/api/tasks/:id/sync-calendar', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const taskId = req.params.id;

      const task = await storage.getTask(taskId);
      if (!task || !task.googleCalendarEventId) {
        return res.status(404).json({ message: 'Task or calendar event not found' });
      }

      // Delete calendar event
      const success = await googleCalendarService.deleteTaskEvent(userId, task.googleCalendarEventId);

      if (success) {
        // Remove event ID from task
        await storage.updateTaskCalendarEvent(taskId, null);
        res.json({ success: true });
      } else {
        res.status(500).json({ message: 'Failed to delete calendar event' });
      }
    } catch (error) {
      console.error('Error removing calendar sync:', error);
      res.status(500).json({ message: 'Failed to remove calendar sync' });
    }
  });

  app.get('/api/user/calendar-status', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const isAvailable = await googleCalendarService.isCalendarSyncAvailable(userId);
      const user = await storage.getUser(userId);
      
      res.json({
        available: isAvailable,
        enabled: user?.calendarSyncEnabled || false,
        hasTokens: !!(user?.googleAccessToken)
      });
    } catch (error) {
      console.error('Error getting calendar status:', error);
      res.status(500).json({ message: 'Failed to get calendar status' });
    }
  });

  app.post('/api/user/calendar-sync', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { enabled } = req.body;

      await storage.updateUserCalendarSync(userId, enabled);
      res.json({ success: true, enabled });
    } catch (error) {
      console.error('Error updating calendar sync preference:', error);
      res.status(500).json({ message: 'Failed to update calendar sync preference' });
    }
  });

  app.delete('/api/user/calendar-access', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const success = await googleCalendarService.revokeAccess(userId);
      
      if (success) {
        res.json({ success: true });
      } else {
        res.status(500).json({ message: 'Failed to revoke calendar access' });
      }
    } catch (error) {
      console.error('Error revoking calendar access:', error);
      res.status(500).json({ message: 'Failed to revoke calendar access' });
    }
  });

  // Debug endpoint for quick verification (as specified)
  app.get('/debug/time/preview', async (req, res) => {
    try {
      const { date, time, tz = "America/Vancouver" } = req.query as { date: string, time: string, tz?: string };
      
      if (!date || !time) {
        return res.status(400).json({ error: 'Missing date or time parameters' });
      }
      
      // Use the unified computeDueAt function
      const result = computeDueAt(date, time, tz);
      
      res.json({
        local: `${date} ${time} (${tz})`,
        due_at_utc: result.due_at,
        due_time_db: result.due_time_db,
        due_date_db: result.due_date_db
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Backfill helper for calendar events (as specified)
  app.get('/debug/calendar/backfill', async (req, res) => {
    try {
      const { hours = "24", as } = req.query as { hours?: string, as?: string };
      
      if (!as) {
        return res.status(400).json({ error: 'Missing ?as=email parameter' });
      }

      // Get user by email
      const user = await storage.getUserByEmail(as);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Find tasks assigned to user where due_at exists but calendar_event_id is null
      const { pool } = await import('./db');
      const hoursAgo = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);
      
      const query = `
        SELECT t.* FROM tasks t 
        JOIN task_assignments ta ON t.id = ta.task_id 
        JOIN team_members tm ON ta.team_member_id = tm.id 
        WHERE tm.email = $1 
          AND t.due_at IS NOT NULL 
          AND t.google_calendar_event_id IS NULL 
          AND t.updated_at >= $2
      `;
      
      const result = await pool.query(query, [as, hoursAgo]);
      const tasksToBackfill = result.rows;
      
      const { calendarUpsert } = await import('./calendarUpsert');
      let backfilled = 0;
      
      for (const task of tasksToBackfill) {
        const upsertResult = await calendarUpsert(task, user.id);
        
        if (upsertResult.success && upsertResult.eventId) {
          await storage.updateTask(task.id, { googleCalendarEventId: upsertResult.eventId });
          backfilled++;
          console.log('Backfilled calendar event:', { taskId: task.id, eventId: upsertResult.eventId });
        }
      }
      
      res.json({
        success: true,
        user: as,
        tasksFound: tasksToBackfill.length,
        backfilled
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Additional debug endpoints for task debugging and regression testing
  app.get('/debug/task/:id', async (req, res) => {
    try {
      const taskId = req.params.id;
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      // Return normalized response with all three time fields
      res.json({
        id: task.id,
        title: task.title,
        due_date: task.dueDate ? task.dueDate.toISOString().split('T')[0] : null, // ISO date local
        due_time: task.dueTime || null, // HH:mm 24h string 
        due_at: task.dueAt ? task.dueAt.toISOString() : null, // UTC ISO
        status: task.status,
        priority: task.priority,
        created_at: task.createdAt?.toISOString(),
        project_id: task.projectId,
        organization_id: task.organizationId
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/debug/create-quick-task', async (req, res) => {
    try {
      const { dueTime, timezone = "America/Vancouver" } = req.body;
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      // Compute due_at using the unified system
      const timeResult = computeDueAt(today, dueTime, timezone);
      
      // Debug route disabled - organization tasks removed
      res.status(400).json({ 
        error: "Debug task creation disabled - organization tasks have been eliminated",
        message: "Use project-based task creation instead"
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
