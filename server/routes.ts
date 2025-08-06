import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertProjectSchema, insertTaskSchema, insertMessageSchema, insertAnalyticsSchema } from "@shared/schema";
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
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  // Task routes
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

      const taskData = insertTaskSchema.parse({
        ...req.body,
        projectId: req.params.projectId,
      });
      
      const task = await storage.createTask(taskData);
      res.status(201).json(task);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ message: "Failed to create task" });
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

      const { clientEmail, clientFirstName, clientLastName, clientCompanyName, ...projectData } = req.body;

      // Create or get client user
      let clientUser = await storage.getUserByEmail(clientEmail);
      if (!clientUser) {
        clientUser = await storage.upsertUser({
          id: clientEmail, // Use email as ID for now
          email: clientEmail,
          firstName: clientFirstName,
          lastName: clientLastName,
          companyName: clientCompanyName,
          role: 'client',
        });
      }

      const project = await storage.createProject({
        ...projectData,
        clientId: clientUser.id,
      });

      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating admin project:", error);
      res.status(500).json({ message: "Failed to create project" });
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

      const newClient = await storage.createClient(req.body);
      res.status(201).json(newClient);
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).json({ message: "Failed to create client" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
