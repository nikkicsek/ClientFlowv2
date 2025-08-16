import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertProjectSchema, insertTaskSchema, insertMessageSchema, insertAnalyticsSchema, insertTeamMemberSchema } from "@shared/schema";
import { emailService } from "./emailService";
import { nangoService } from "./nangoService";
import multer from "multer";
import path from "path";
import fs from "fs";

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
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
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
    } catch (error) {
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

      // Convert date string to Date object if present
      const bodyData = { ...req.body };
      if (bodyData.dueDate) {
        bodyData.dueDate = new Date(bodyData.dueDate);
      }
      
      const taskData = insertTaskSchema.parse({
        ...bodyData,
        projectId: req.params.projectId,
      });
      
      const task = await storage.createTask(taskData);

      // Send email notification if task is assigned to a team member
      if (task.assignedToMember) {
        try {
          const teamMember = await storage.getTeamMember(task.assignedToMember);
          const project = await storage.getProject(req.params.projectId);
          
          if (teamMember && project) {
            await emailService.sendTaskAssignmentNotification(
              teamMember.email,
              teamMember.name,
              task.title,
              project.name,
              {
                priority: task.priority,
                assignedBy: `${user.firstName} ${user.lastName}`,
                dueDate: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : undefined,
                notes: task.notes || undefined,
              }
            );
          }
        } catch (emailError) {
          console.error("Failed to send task assignment email:", emailError);
          // Don't fail the task creation if email fails
        }
      }

      res.status(201).json(task);
    } catch (error) {
      console.error("Error creating task:", error);
      if (error instanceof Error) {
        res.status(400).json({ message: `Failed to create task: ${error.message}` });
      } else {
        res.status(500).json({ message: "Failed to create task" });
      }
    }
  });

  app.put('/api/tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can update tasks" });
      }

      const updates = req.body;
      const task = await storage.updateTask(req.params.id, updates);

      // Send email notification if team member assignment changed
      if (updates.assignedToMember) {
        try {
          const teamMember = await storage.getTeamMember(updates.assignedToMember);
          const project = await storage.getProject(task.projectId);
          
          if (teamMember && project) {
            await emailService.sendTaskAssignmentNotification(
              teamMember.email,
              teamMember.name,
              task.title,
              project.name,
              {
                priority: task.priority,
                assignedBy: `${user.firstName} ${user.lastName}`,
                dueDate: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : undefined,
                notes: task.notes || undefined,
              }
            );
          }
        } catch (emailError) {
          console.error("Failed to send task assignment email:", emailError);
        }
      }

      res.json(task);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ message: "Failed to update task" });
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
    } catch (error) {
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
    } catch (error) {
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
      res.status(500).json({ message: `Failed to delete service: ${error.message}` });
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

      if (!name || !clientId) {
        return res.status(400).json({ message: "Project name and client selection are required" });
      }

      // Verify that the client exists
      const client = await storage.getUser(clientId);
      if (!client) {
        return res.status(400).json({ message: "Selected client not found" });
      }

      if (client.role !== 'client') {
        return res.status(400).json({ message: "Selected user is not a client" });
      }

      const projectData = {
        name,
        description: description || null,
        clientId: client.id,
        organizationId: organizationId || client.organizationId || null,
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

  const httpServer = createServer(app);
  return httpServer;
}
