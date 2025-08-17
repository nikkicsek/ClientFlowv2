# Current Task System Files - For Grok Analysis

This document contains all current task-related files from the AgencyPro project for analysis and refactoring recommendations.

## 1. DATABASE SCHEMA (shared/schema.ts)

### Tasks Table Definition:
```typescript
// Main tasks table with enhanced fields for better time management
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id),
  organizationId: varchar("organization_id").references(() => organizations.id), // For organization-level tasks
  serviceId: varchar("service_id").references(() => services.id),
  title: text("title").notNull(),
  description: text("description"),
  status: varchar("status").default("pending"), // "pending", "in_progress", "completed", "needs_approval", "outstanding", "needs_clarification"
  priority: varchar("priority").default("medium"), // "low", "medium", "high", "urgent"
  dueDate: timestamp("due_date"),
  dueTime: varchar("due_time"), // Separate time field like "14:30"
  assignedTo: varchar("assigned_to").references(() => users.id), // Legacy single assignment
  assignedToMember: varchar("assigned_to_member").references(() => teamMembers.id), // Legacy single team member assignment
  taskType: varchar("task_type").default("standard"), // "standard", "milestone", "review", "approval"
  taskScope: varchar("task_scope").default("project"), // "project", "organization"
  estimatedHours: integer("estimated_hours"),
  actualHours: integer("actual_hours"),
  completedAt: timestamp("completed_at"),
  clientVisible: boolean("client_visible").default(true),
  notes: text("notes"),
  googleDriveLink: text("google_drive_link"),
  googleCalendarEventId: varchar("google_calendar_event_id"), // For calendar sync
  isDeleted: boolean("is_deleted").default(false),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Task templates for service workflows
export const taskTemplates = pgTable("task_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").notNull().references(() => services.id),
  title: text("title").notNull(),
  description: text("description"),
  taskType: varchar("task_type").default("standard"), // "standard", "milestone", "review", "approval"
  priority: varchar("priority").default("medium"), // "low", "medium", "high", "urgent"
  estimatedHours: integer("estimated_hours"),
  dayOffset: integer("day_offset").default(0), // Days from project start
  dependsOnTemplateId: varchar("depends_on_template_id"), // Self-reference for dependencies
  clientVisible: boolean("client_visible").default(true),
  assigneeRole: varchar("assignee_role"), // "content_writer", "photographer", "designer", "project_manager", "ghl_lead", "strategist", "finance"
  createdAt: timestamp("created_at").defaultNow(),
});

// Team members table for task assignments
export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: varchar("role").notNull(), // "project_manager", "content_writer", "photographer", "designer", "ghl_lead", "strategist", "finance"
  isActive: boolean("is_active").default(true),
  profileImageUrl: text("profile_image_url"),
  phoneNumber: text("phone_number"),
  notificationPreferences: jsonb("notification_preferences").default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Individual task assignments - allows multiple team members per task
export const taskAssignments = pgTable("task_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => tasks.id),
  teamMemberId: varchar("team_member_id").notNull().references(() => teamMembers.id),
  assignedBy: varchar("assigned_by").notNull().references(() => users.id),
  isCompleted: boolean("is_completed").default(false), // Individual completion status
  completedAt: timestamp("completed_at"),
  notes: text("notes"), // Individual notes for this assignment
  estimatedHours: integer("estimated_hours"), // Can be different per team member
  actualHours: integer("actual_hours"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Schema Types:
```typescript
export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;
export type TaskAssignment = typeof taskAssignments.$inferSelect;
export type InsertTaskAssignment = typeof taskAssignments.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

export const insertTaskSchema = createInsertSchema(tasks);
export const insertTaskAssignmentSchema = createInsertSchema(taskAssignments);
export const insertTeamMemberSchema = createInsertSchema(teamMembers);
```

## 2. STORAGE LAYER (server/storage.ts)

### Task CRUD Operations:
```typescript
// Task operations
async getTasks(): Promise<Task[]> {
  return await db.select().from(tasks).where(eq(tasks.isDeleted, false)).orderBy(desc(tasks.createdAt));
}

async getTask(id: string): Promise<Task | undefined> {
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.isDeleted, false)));
  return task;
}

async getTasksByProject(projectId: string): Promise<Task[]> {
  return await db.select().from(tasks).where(and(
    eq(tasks.projectId, projectId),
    eq(tasks.isDeleted, false)
  )).orderBy(desc(tasks.createdAt));
}

async getTasksByProjectWithDetails(projectId: string): Promise<(Task & { assignedMembers: TeamMember[] })[]> {
  const projectTasks = await this.getTasksByProject(projectId);
  const tasksWithAssignments = [];
  
  for (const task of projectTasks) {
    const assignments = await this.getTaskAssignments(task.id);
    const assignedMembers = assignments.map(a => a.teamMember);
    tasksWithAssignments.push({
      ...task,
      assignedMembers
    });
  }
  
  return tasksWithAssignments;
}

async createTask(task: InsertTask): Promise<Task> {
  const [newTask] = await db.insert(tasks).values(task).returning();
  return newTask;
}

async updateTask(id: string, updates: Partial<InsertTask>): Promise<Task> {
  const updateData: any = { ...updates };
  
  // Handle null values for timestamp fields
  if (updateData.completedAt === null) {
    updateData.completedAt = null;
  } else if (updateData.completedAt && typeof updateData.completedAt === 'string') {
    updateData.completedAt = new Date(updateData.completedAt);
  }
  
  if (updateData.dueDate === null) {
    updateData.dueDate = null;
  } else if (updateData.dueDate && typeof updateData.dueDate === 'string') {
    updateData.dueDate = new Date(updateData.dueDate);
  }
  
  updateData.updatedAt = new Date();
  
  const [updatedTask] = await db
    .update(tasks)
    .set(updateData)
    .where(eq(tasks.id, id))
    .returning();
  return updatedTask;
}

async deleteTask(id: string): Promise<void> {
  await db.update(tasks).set({ isDeleted: true }).where(eq(tasks.id, id));
}

async softDeleteTask(id: string, deletedBy: string): Promise<void> {
  await db.update(tasks).set({ 
    isDeleted: true, 
    deletedAt: new Date(),
    deletedBy 
  }).where(eq(tasks.id, id));
}
```

### Task Assignment Operations:
```typescript
async getAllTaskAssignments(): Promise<(TaskAssignment & { teamMember: TeamMember; task: Task })[]> {
  const results = await db
    .select({
      assignment: taskAssignments,
      teamMember: teamMembers,
      task: tasks,
    })
    .from(taskAssignments)
    .innerJoin(teamMembers, eq(taskAssignments.teamMemberId, teamMembers.id))
    .innerJoin(tasks, eq(taskAssignments.taskId, tasks.id));
  
  return results.map(row => ({
    ...row.assignment,
    teamMember: row.teamMember,
    task: row.task,
  }));
}

async getTaskAssignments(taskId: string): Promise<(TaskAssignment & { teamMember: TeamMember })[]> {
  const results = await db
    .select({
      assignment: taskAssignments,
      teamMember: teamMembers,
    })
    .from(taskAssignments)
    .innerJoin(teamMembers, eq(taskAssignments.teamMemberId, teamMembers.id))
    .where(eq(taskAssignments.taskId, taskId));
  
  return results.map(row => ({
    ...row.assignment,
    teamMember: row.teamMember,
  }));
}

async getTaskAssignmentsByTeamMember(teamMemberId: string): Promise<(TaskAssignment & { task: Task; project?: Project })[]> {
  const results = await db
    .select({
      assignment: taskAssignments,
      task: tasks,
      project: projects,
    })
    .from(taskAssignments)
    .innerJoin(tasks, eq(taskAssignments.taskId, tasks.id))
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(
      eq(taskAssignments.teamMemberId, teamMemberId),
      isNull(tasks.deletedAt)
    ))
    .orderBy(desc(taskAssignments.createdAt));
  
  return results.map(row => ({
    ...row.assignment,
    task: row.task,
    project: row.project || undefined,
  }));
}

async createTaskAssignment(assignment: InsertTaskAssignment): Promise<TaskAssignment> {
  const [newAssignment] = await db.insert(taskAssignments).values(assignment).returning();
  return newAssignment;
}

async updateTaskAssignment(id: string, updates: Partial<InsertTaskAssignment>): Promise<TaskAssignment> {
  const updateData: any = { ...updates };
  
  // Handle null values for timestamp fields
  if (updateData.completedAt === null) {
    updateData.completedAt = null;
  } else if (updateData.completedAt && typeof updateData.completedAt === 'string') {
    updateData.completedAt = new Date(updateData.completedAt);
  }
  
  updateData.updatedAt = new Date();
  
  const [updatedAssignment] = await db
    .update(taskAssignments)
    .set(updateData)
    .where(eq(taskAssignments.id, id))
    .returning();
  return updatedAssignment;
}
```

### Organization Task Operations:
```typescript
async getOrganizationTasks(organizationId: string): Promise<Task[]> {
  return await db.select().from(tasks).where(and(
    eq(tasks.organizationId, organizationId),
    eq(tasks.taskScope, 'organization'),
    eq(tasks.isDeleted, false)
  )).orderBy(desc(tasks.createdAt));
}

async createOrganizationTask(taskData: InsertTask): Promise<Task> {
  const [task] = await db.insert(tasks).values({
    ...taskData,
    taskScope: 'organization'
  }).returning();
  return task;
}
```

## 3. API ROUTES (server/routes.ts)

### Task CRUD Routes:
```typescript
// Get tasks for a project
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
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ message: "Failed to fetch tasks" });
  }
});

// Create new task
app.post('/api/projects/:projectId/tasks', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (user?.role !== 'admin') {
      return res.status(403).json({ message: "Only admins can create tasks" });
    }

    // Convert date string to Date object and extract time if present
    const bodyData = { ...req.body };
    if (bodyData.dueDate) {
      const dueDateTime = new Date(bodyData.dueDate);
      bodyData.dueDate = dueDateTime;
      
      // Extract time component for the separate dueTime field
      if (!isNaN(dueDateTime.getTime())) {
        const hours = dueDateTime.getHours().toString().padStart(2, '0');
        const minutes = dueDateTime.getMinutes().toString().padStart(2, '0');
        bodyData.dueTime = `${hours}:${minutes}`;
      }
    }
    
    const taskData = insertTaskSchema.parse({
      ...bodyData,
      projectId: req.params.projectId,
    });
    
    const task = await storage.createTask(taskData);
    res.status(201).json(task);
  } catch (error) {
    console.error("Error creating task:", error);
    res.status(400).json({ message: `Failed to create task: ${error.message}` });
  }
});

// Update task
app.put('/api/tasks/:id', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (user?.role !== 'admin') {
      return res.status(403).json({ message: "Only admins can update tasks" });
    }

    const updates = { ...req.body };
    
    // Convert date string to Date object and extract time if present
    if (updates.dueDate) {
      const dueDateTime = new Date(updates.dueDate);
      updates.dueDate = dueDateTime;
      
      // Extract time component for the separate dueTime field
      if (!isNaN(dueDateTime.getTime())) {
        const hours = dueDateTime.getHours().toString().padStart(2, '0');
        const minutes = dueDateTime.getMinutes().toString().padStart(2, '0');
        updates.dueTime = `${hours}:${minutes}`;
      }
    }
    
    const task = await storage.updateTask(req.params.id, updates);
    res.json(task);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ message: "Failed to update task" });
  }
});
```

### Task Assignment Routes:
```typescript
// Get task assignments for a team member
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

// Create task assignment
app.post('/api/task-assignments', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (user?.role !== 'admin') {
      return res.status(403).json({ message: "Only admins can create task assignments" });
    }

    const validation = insertTaskAssignmentSchema.safeParse({
      ...req.body,
      assignedBy: userId,
    });

    if (!validation.success) {
      return res.status(400).json({ error: validation.error });
    }

    const assignment = await storage.createTaskAssignment(validation.data);
    res.status(201).json(assignment);
  } catch (error) {
    console.error("Error creating task assignment:", error);
    res.status(500).json({ message: "Failed to create task assignment" });
  }
});

// Update task assignment (team members can update their own)
app.put('/api/assignments/:id', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    const { id } = req.params;
    const updates = req.body;
    
    // Get the assignment to check ownership
    const assignments = await storage.getAllTaskAssignments();
    const assignment = assignments.find((a: any) => a.id === id);
    
    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    
    // Allow access if user is admin or if the assignment belongs to a team member with matching email
    if (user?.role !== 'admin' && user?.email !== assignment.teamMember.email) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedAssignment = await storage.updateTaskAssignment(id, updates);
    res.json(updatedAssignment);
  } catch (error) {
    console.error("Error updating task assignment:", error);
    res.status(500).json({ message: "Failed to update assignment" });
  }
});
```

### Organization Task Routes:
```typescript
app.get('/api/organizations/:organizationId/tasks', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (user?.role !== 'admin') {
      return res.status(403).json({ message: "Only admins can view organization tasks" });
    }

    const tasks = await storage.getOrganizationTasks(req.params.organizationId);
    res.json(tasks);
  } catch (error) {
    console.error("Error fetching organization tasks:", error);
    res.status(500).json({ message: "Failed to fetch organization tasks" });
  }
});

app.post('/api/organizations/:organizationId/tasks', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    
    if (user?.role !== 'admin') {
      return res.status(403).json({ message: "Only admins can create organization tasks" });
    }

    const taskData = {
      ...req.body,
      organizationId: req.params.organizationId,
      taskScope: 'organization',
      projectId: null,
      serviceId: null,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
    };

    const validation = insertTaskSchema.safeParse(taskData);

    if (!validation.success) {
      return res.status(400).json({ error: validation.error });
    }

    const task = await storage.createOrganizationTask(validation.data);
    res.status(201).json(task);
  } catch (error) {
    console.error("Error creating organization task:", error);
    res.status(500).json({ message: "Failed to create organization task" });
  }
});
```

## 4. GOOGLE CALENDAR INTEGRATION (server/googleCalendar.ts)

```typescript
import { google } from 'googleapis';
import { storage } from './storage';

class GoogleCalendarService {
  private oauth2Client: any;

  constructor() {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
      console.warn('Google Calendar integration disabled - missing OAuth credentials');
      return;
    }

    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  async createTaskEvent(userId: string, task: any): Promise<string | null> {
    try {
      const calendar = await this.getAuthenticatedClient(userId);
      
      // Handle PostgreSQL timestamp format properly
      let startDate;
      if (task.dueDate) {
        if (task.dueDate.includes(' ') && !task.dueDate.includes('T')) {
          // PostgreSQL format: "2025-08-29 13:00:00" - treat as local time
          startDate = new Date(task.dueDate.replace(' ', 'T'));
        } else {
          startDate = new Date(task.dueDate);
        }
      } else {
        startDate = new Date();
      }
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour duration

      const event = {
        summary: task.title,
        description: `${task.description || ''}\n\n${task.projectName ? `Project: ${task.projectName}` : 'Organization Task'}\nStatus: ${task.status}\nPriority: ${task.priority || 'medium'}${task.googleDriveLink ? `\nDrive Link: ${task.googleDriveLink}` : ''}`,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: 'America/Los_Angeles',
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'America/Los_Angeles',
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 24 hours before
            { method: 'popup', minutes: 60 }, // 1 hour before
          ],
        },
      };

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });

      return response.data.id || null;
    } catch (error) {
      console.error('Error creating calendar event:', error);
      return null;
    }
  }

  async updateTaskEvent(userId: string, eventId: string, task: any): Promise<boolean> {
    try {
      const calendar = await this.getAuthenticatedClient(userId);
      
      let startDate;
      if (task.dueDate) {
        if (task.dueDate.includes(' ') && !task.dueDate.includes('T')) {
          startDate = new Date(task.dueDate.replace(' ', 'T'));
        } else {
          startDate = new Date(task.dueDate);
        }
      } else {
        startDate = new Date();
      }
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

      const event = {
        summary: task.title,
        description: `${task.description || ''}\n\n${task.projectName ? `Project: ${task.projectName}` : 'Organization Task'}\nStatus: ${task.status}\nPriority: ${task.priority || 'medium'}${task.googleDriveLink ? `\nDrive Link: ${task.googleDriveLink}` : ''}`,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: 'America/Los_Angeles',
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'America/Los_Angeles',
        },
      };

      await calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        requestBody: event,
      });

      return true;
    } catch (error) {
      console.error('Error updating calendar event:', error);
      return false;
    }
  }

  async deleteTaskEvent(userId: string, eventId: string): Promise<boolean> {
    try {
      const calendar = await this.getAuthenticatedClient(userId);
      
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });

      return true;
    } catch (error) {
      console.error('Error deleting calendar event:', error);
      return false;
    }
  }
}

export const googleCalendarService = new GoogleCalendarService();
```

## 5. FRONTEND COMPONENTS

### Create Task Modal (client/src/components/create-task-modal.tsx):
```typescript
import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
}

export default function CreateTaskModal({ isOpen, onClose, onSuccess, projectId }: CreateTaskModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "in_progress",
    priority: "medium",
    dueDate: "",
    dueTime: "",
    googleDriveLink: "",
  });
  
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);

  // Fetch team members for assignment
  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
    enabled: isOpen,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/tasks`, data);
      return response.json();
    },
    onSuccess: async (newTask) => {
      // Assign selected team members to the task
      if (selectedTeamMembers.length > 0) {
        for (const memberId of selectedTeamMembers) {
          try {
            await apiRequest("POST", "/api/task-assignments", {
              taskId: newTask.id,
              teamMemberId: memberId,
            });
          } catch (error) {
            console.error("Error assigning team member:", error);
          }
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      
      onSuccess();
      // Reset form...
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Combine date and time for due date if both are provided
    let dueDateTime = null;
    if (formData.dueDate) {
      if (formData.dueTime) {
        dueDateTime = `${formData.dueDate}T${formData.dueTime}:00`;
      } else {
        dueDateTime = `${formData.dueDate}T09:00:00`; // Default to 9 AM
      }
    }

    const taskData = {
      title: formData.title,
      description: formData.description || null,
      status: formData.status,
      priority: formData.priority,
      dueDate: dueDateTime,
      googleDriveLink: formData.googleDriveLink || null,
    };

    createTaskMutation.mutate(taskData);
  };

  // Form JSX with date/time fields, team member selection, etc.
}
```

### My Tasks Page (client/src/pages/my-tasks.tsx):
```typescript
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TeamMemberTasks } from '@/components/team-member-tasks';
import { CalendarSyncDialog } from '@/components/calendar-sync-dialog';

export function MyTasksPage() {
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);

  // Get current user info
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  // Get team members to find the current user's team member record
  const { data: teamMembers = [], isLoading: teamLoading } = useQuery({
    queryKey: ["/api/team-members"],
    enabled: !!user?.email,
  });

  // Find the team member record matching the current user's email
  const currentTeamMember = teamMembers.find((member: any) => member.email === user.email);

  if (!currentTeamMember) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Team Member Not Found</h3>
              <p className="text-gray-600">
                You are not currently registered as a team member. Contact your admin to be added to the team.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
          <Button
            onClick={() => setShowCalendarDialog(true)}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            Calendar Sync
          </Button>
        </div>
        
        <TeamMemberTasks 
          teamMemberId={currentTeamMember.id} 
          teamMemberName={currentTeamMember.name}
        />
        
        <CalendarSyncDialog
          isOpen={showCalendarDialog}
          onClose={() => setShowCalendarDialog(false)}
        />
      </div>
    </div>
  );
}
```

### Team Member Tasks Component (client/src/components/team-member-tasks.tsx):
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface TeamMemberTasksProps {
  teamMemberId: string;
  teamMemberName: string;
}

export function TeamMemberTasks({ teamMemberId, teamMemberName }: TeamMemberTasksProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get tasks assigned to this team member
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["/api/team-members", teamMemberId, "assignments"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/team-members/${teamMemberId}/assignments`);
      return response.json();
    }
  });

  // Mark assignment as completed
  const completeAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const response = await apiRequest("PUT", `/api/assignments/${assignmentId}`, {
        isCompleted: true
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members", teamMemberId, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-assignments"] });
      toast({
        title: "Task completed",
        description: "Your task has been marked as completed.",
      });
    }
  });

  const completedAssignments = assignments.filter((a: any) => a.isCompleted);
  const pendingAssignments = assignments.filter((a: any) => !a.isCompleted);

  return (
    <div className="space-y-6">
      {/* Task statistics */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Tasks</h2>
          <p className="text-gray-600">Tasks assigned to {teamMemberName}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{pendingAssignments.length}</div>
            <div className="text-gray-600">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{completedAssignments.length}</div>
            <div className="text-gray-600">Completed</div>
          </div>
        </div>
      </div>

      {/* Pending tasks */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Pending Tasks ({pendingAssignments.length})</h3>
        {pendingAssignments.map((assignment: any) => (
          <Card key={assignment.id} className="bg-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{assignment.task.title}</h4>
                    {assignment.task.description && (
                      <p className="text-sm text-gray-600 mt-1">{assignment.task.description}</p>
                    )}
                  </div>
                </div>
                <Button
                  onClick={() => completeAssignmentMutation.mutate(assignment.id)}
                  disabled={completeAssignmentMutation.isPending}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Complete
                </Button>
              </div>
              
              <div className="flex items-center gap-4 text-sm">
                <Badge className={getStatusColor(assignment.task.status)}>
                  {assignment.task.status.replace('_', ' ')}
                </Badge>
                <Badge className={getPriorityColor(assignment.task.priority)}>
                  {assignment.task.priority}
                </Badge>
                {assignment.task.dueDate && (
                  <div className="flex items-center gap-1 text-gray-600">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(assignment.task.dueDate).toLocaleDateString()}</span>
                    {assignment.task.dueTime && (
                      <>
                        <Clock className="h-4 w-4 ml-2" />
                        <span>{assignment.task.dueTime}</span>
                      </>
                    )}
                  </div>
                )}
                {assignment.project && (
                  <div className="flex items-center gap-1 text-gray-600">
                    <Building2 className="h-4 w-4" />
                    <span>{assignment.project.name}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Completed tasks */}
      {completedAssignments.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Completed Tasks ({completedAssignments.length})</h3>
          {completedAssignments.map((assignment: any) => (
            <Card key={assignment.id} className="bg-gray-50 opacity-75">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <h4 className="font-medium text-gray-700">{assignment.task.title}</h4>
                      <p className="text-sm text-gray-500">
                        Completed {new Date(assignment.completedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

## CURRENT ISSUES IDENTIFIED:

1. **Date/Time Handling**: Complex logic for combining separate date/time fields
2. **Multiple Assignment Models**: Both legacy single assignment and new multi-assignment system
3. **Complex Permission Logic**: Different rules for admins vs team members vs clients
4. **Calendar Integration**: Not properly integrated with task CRUD operations
5. **Task Visibility**: Complex logic for determining when tasks appear in "My Tasks"
6. **Database Schema**: Mixed concerns with both project and organization tasks in same table
7. **API Inconsistency**: Different endpoints for similar operations
8. **Frontend State Management**: Complex forms with multiple state variables
9. **Error Handling**: Inconsistent error handling across components
10. **Performance**: N+1 queries in some assignment fetching operations

## RECOMMENDATIONS FOR GROK:

Please analyze this task system and provide:

1. **Simplified Schema Design**: Clean separation of concerns
2. **Unified API Design**: Consistent endpoints and patterns
3. **Better State Management**: Simplified forms and data flow
4. **Improved Calendar Integration**: Seamless sync with task operations
5. **Clear Permission Model**: Simplified access control
6. **Performance Optimizations**: Efficient querying patterns
7. **Error Handling Strategy**: Consistent error management
8. **Component Architecture**: Reusable and maintainable UI components

Focus on maintaining current functionality while dramatically simplifying the codebase and improving maintainability.