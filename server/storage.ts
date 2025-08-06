import {
  users,
  organizations,
  projects,
  services,
  serviceCategories,
  tasks,
  taskTemplates,
  projectFiles,
  analytics,
  messages,
  kpis,
  teamInvitations,
  teamMembers,
  type User,
  type UpsertUser,
  type Organization,
  type InsertOrganization,
  type Project,
  type InsertProject,
  type Service,
  type InsertService,
  type ServiceCategory,
  type InsertServiceCategory,
  type Task,
  type InsertTask,
  type ProjectFile,
  type InsertProjectFile,
  type Analytics,
  type InsertAnalytics,
  type Message,
  type InsertMessage,
  type Kpi,
  type InsertKpi,
  type TeamInvitation,
  type InsertTeamInvitation,
  type TeamMember,
  type InsertTeamMember,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, inArray } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getClientUsers(): Promise<User[]>;
  
  // Organization operations
  getOrganizations(): Promise<Organization[]>;
  getOrganization(id: string): Promise<Organization | undefined>;
  createOrganization(organization: InsertOrganization): Promise<Organization>;
  updateOrganization(id: string, updates: Partial<InsertOrganization>): Promise<Organization>;
  getOrganizationUsers(organizationId: string): Promise<User[]>;
  assignUserToOrganization(userId: string, organizationId: string): Promise<User>;
  removeUserFromOrganization(userId: string): Promise<User>;
  createClient(client: UpsertUser): Promise<User>;
  
  // Project operations
  getProjectsByClient(clientId: string): Promise<Project[]>;
  getAllProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, updates: Partial<InsertProject>): Promise<Project>;
  
  // Service category operations
  getServiceCategories(): Promise<ServiceCategory[]>;
  createServiceCategory(category: InsertServiceCategory): Promise<ServiceCategory>;
  updateServiceCategory(id: string, updates: Partial<InsertServiceCategory>): Promise<ServiceCategory>;
  deleteServiceCategory(id: string): Promise<void>;

  // Service operations
  getServices(): Promise<Service[]>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: string, updates: Partial<InsertService>): Promise<Service>;
  deleteService(id: string): Promise<void>;
  
  // Task operations
  getTasksByProject(projectId: string): Promise<Task[]>;
  getTasksByProjectWithDetails(projectId: string): Promise<(Task & { service?: Service })[]>;
  getAllTasksWithDetails(): Promise<(Task & { service?: Service; project?: Project })[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, updates: Partial<InsertTask>): Promise<Task>;
  
  // Task template operations (for Faces of Kelowna workflow)
  getTaskTemplatesForService(serviceId: string): Promise<any[]>;
  createTasksFromTemplates(projectId: string, serviceId: string): Promise<void>;
  
  // File operations
  getFilesByProject(projectId: string): Promise<ProjectFile[]>;
  createProjectFile(file: InsertProjectFile): Promise<ProjectFile>;
  getProjectFile(id: string): Promise<ProjectFile | undefined>;
  
  // Analytics operations
  getAnalyticsByProject(projectId: string, startDate?: Date, endDate?: Date): Promise<Analytics[]>;
  createAnalytics(analytics: InsertAnalytics): Promise<Analytics>;
  
  // Message operations
  getMessagesByProject(projectId: string): Promise<(Message & { sender: User })[]>;
  createMessage(message: InsertMessage): Promise<Message>;

  // KPI operations
  getKpisByProject(projectId: string): Promise<Kpi[]>;
  createKpi(kpi: InsertKpi): Promise<Kpi>;
  updateKpi(id: string, updates: Partial<InsertKpi>): Promise<Kpi | undefined>;

  // Team invitation operations
  createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation>;
  getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined>;
  getTeamInvitations(): Promise<TeamInvitation[]>;
  updateTeamInvitationStatus(id: string, status: string, acceptedAt?: Date): Promise<TeamInvitation | undefined>;
  deleteKpi(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getClientUsers(): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, 'client'));
  }

  // Project operations
  async getProjectsByClient(clientId: string): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.clientId, clientId)).orderBy(desc(projects.createdAt));
  }

  async getAllProjects(): Promise<Project[]> {
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db.insert(projects).values(project).returning();
    return newProject;
  }

  async updateProject(id: string, updates: Partial<InsertProject>): Promise<Project> {
    const [updatedProject] = await db
      .update(projects)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return updatedProject;
  }

  // Service category operations
  async getServiceCategories(): Promise<ServiceCategory[]> {
    return db.select().from(serviceCategories).orderBy(serviceCategories.name);
  }

  async createServiceCategory(category: InsertServiceCategory): Promise<ServiceCategory> {
    const [newCategory] = await db.insert(serviceCategories).values(category).returning();
    return newCategory;
  }

  async updateServiceCategory(id: string, updates: Partial<InsertServiceCategory>): Promise<ServiceCategory> {
    const [updatedCategory] = await db
      .update(serviceCategories)
      .set(updates)
      .where(eq(serviceCategories.id, id))
      .returning();
    return updatedCategory;
  }

  async deleteServiceCategory(id: string): Promise<void> {
    await db
      .delete(serviceCategories)
      .where(eq(serviceCategories.id, id));
  }

  // Service operations
  async getServices(): Promise<Service[]> {
    return db.select().from(services).where(eq(services.isActive, true));
  }

  async createService(service: InsertService): Promise<Service> {
    const [newService] = await db.insert(services).values(service).returning();
    return newService;
  }

  async updateService(id: string, updates: Partial<InsertService>): Promise<Service> {
    const [updatedService] = await db
      .update(services)
      .set(updates)
      .where(eq(services.id, id))
      .returning();
    return updatedService;
  }

  async deleteService(id: string): Promise<void> {
    await db
      .delete(services)
      .where(eq(services.id, id));
  }

  // Task operations
  async getTasksByProject(projectId: string): Promise<Task[]> {
    return db.select().from(tasks).where(eq(tasks.projectId, projectId)).orderBy(desc(tasks.createdAt));
  }

  async getTasksByProjectWithDetails(projectId: string): Promise<(Task & { service?: Service })[]> {
    const result = await db
      .select({
        task: tasks,
        service: services,
      })
      .from(tasks)
      .leftJoin(services, eq(tasks.serviceId, services.id))
      .where(eq(tasks.projectId, projectId))
      .orderBy(desc(tasks.createdAt));

    return result.map(({ task, service }) => ({
      ...task,
      service: service || undefined,
    }));
  }

  async getAllTasksWithDetails(): Promise<(Task & { service?: Service; project?: Project })[]> {
    const result = await db
      .select({
        task: tasks,
        service: services,
        project: projects,
      })
      .from(tasks)
      .leftJoin(services, eq(tasks.serviceId, services.id))
      .leftJoin(projects, eq(tasks.projectId, projects.id))
      .orderBy(desc(tasks.createdAt));

    return result.map(({ task, service, project }) => ({
      ...task,
      service: service || undefined,
      project: project || undefined,
    }));
  }

  async createTask(task: InsertTask): Promise<Task> {
    const [newTask] = await db.insert(tasks).values(task).returning();
    return newTask;
  }

  async updateTask(id: string, updates: Partial<InsertTask>): Promise<Task> {
    const [updatedTask] = await db
      .update(tasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask;
  }

  // File operations
  async getFilesByProject(projectId: string): Promise<ProjectFile[]> {
    return db.select().from(projectFiles).where(eq(projectFiles.projectId, projectId)).orderBy(desc(projectFiles.createdAt));
  }

  async createProjectFile(file: InsertProjectFile): Promise<ProjectFile> {
    const [newFile] = await db.insert(projectFiles).values(file).returning();
    return newFile;
  }

  async getProjectFile(id: string): Promise<ProjectFile | undefined> {
    const [file] = await db.select().from(projectFiles).where(eq(projectFiles.id, id));
    return file;
  }

  // Analytics operations
  async getAnalyticsByProject(projectId: string, startDate?: Date, endDate?: Date): Promise<Analytics[]> {
    if (startDate && endDate) {
      return db.select().from(analytics).where(and(
        eq(analytics.projectId, projectId),
        gte(analytics.date, startDate),
        lte(analytics.date, endDate)
      )).orderBy(desc(analytics.date));
    }
    
    return db.select().from(analytics).where(eq(analytics.projectId, projectId)).orderBy(desc(analytics.date));
  }

  async createAnalytics(analyticsData: InsertAnalytics): Promise<Analytics> {
    const [newAnalytics] = await db.insert(analytics).values(analyticsData).returning();
    return newAnalytics;
  }

  // Message operations
  async getMessagesByProject(projectId: string): Promise<(Message & { sender: User })[]> {
    const result = await db
      .select({
        message: messages,
        sender: users,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.projectId, projectId))
      .orderBy(desc(messages.createdAt));

    return result.map(({ message, sender }) => ({
      ...message,
      sender,
    }));
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    return newMessage;
  }

  // KPI operations
  async getKpisByProject(projectId: string): Promise<Kpi[]> {
    return db.select().from(kpis).where(eq(kpis.projectId, projectId)).orderBy(desc(kpis.createdAt));
  }

  async createKpi(kpi: InsertKpi): Promise<Kpi> {
    const [newKpi] = await db.insert(kpis).values(kpi).returning();
    return newKpi;
  }

  async updateKpi(id: string, updates: Partial<InsertKpi>): Promise<Kpi | undefined> {
    const [updatedKpi] = await db
      .update(kpis)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(kpis.id, id))
      .returning();
    return updatedKpi;
  }

  async deleteKpi(id: string): Promise<void> {
    await db.delete(kpis).where(eq(kpis.id, id));
  }

  // Team invitation operations
  async createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation> {
    const [newInvitation] = await db.insert(teamInvitations).values(invitation).returning();
    return newInvitation;
  }

  async getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined> {
    const [invitation] = await db.select().from(teamInvitations).where(eq(teamInvitations.invitationToken, token));
    return invitation;
  }

  async getTeamInvitations(): Promise<TeamInvitation[]> {
    return db.select().from(teamInvitations).orderBy(desc(teamInvitations.createdAt));
  }

  async updateTeamInvitationStatus(id: string, status: string, acceptedAt?: Date): Promise<TeamInvitation | undefined> {
    const [updatedInvitation] = await db
      .update(teamInvitations)
      .set({ 
        status: status as any,
        acceptedAt: acceptedAt || null 
      })
      .where(eq(teamInvitations.id, id))
      .returning();
    return updatedInvitation;
  }

  // Organization operations
  async getOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations).orderBy(desc(organizations.createdAt));
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, id));
    return organization;
  }

  async createOrganization(organization: InsertOrganization): Promise<Organization> {
    const [newOrganization] = await db.insert(organizations).values(organization).returning();
    return newOrganization;
  }

  async updateOrganization(id: string, updates: Partial<InsertOrganization>): Promise<Organization> {
    const [updatedOrganization] = await db
      .update(organizations)
      .set(updates)
      .where(eq(organizations.id, id))
      .returning();
    return updatedOrganization;
  }

  async getOrganizationUsers(organizationId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.organizationId, organizationId));
  }

  async assignUserToOrganization(userId: string, organizationId: string): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ organizationId })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async removeUserFromOrganization(userId: string): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ organizationId: null })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async createClient(clientData: UpsertUser): Promise<User> {
    const [newClient] = await db
      .insert(users)
      .values({
        ...clientData,
        role: 'client',
      })
      .returning();
    return newClient;
  }

  async updateUser(id: string, updates: Partial<UpsertUser>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async deleteUser(id: string): Promise<void> {
    // Delete related records first to avoid foreign key constraint violations
    
    // Delete messages sent by this user
    await db.delete(messages).where(eq(messages.senderId, id));
    
    // Remove user from projects (set clientId to null instead of deleting projects)
    await db.update(projects).set({ clientId: null }).where(eq(projects.clientId, id));
    
    // Delete KPIs associated with projects owned by this user
    const userProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.clientId, id));
    if (userProjects.length > 0) {
      const projectIds = userProjects.map(p => p.id);
      await db.delete(kpis).where(inArray(kpis.projectId, projectIds));
      await db.delete(analytics).where(inArray(analytics.projectId, projectIds));
      await db.delete(projectFiles).where(inArray(projectFiles.projectId, projectIds));
      await db.delete(tasks).where(inArray(tasks.projectId, projectIds));
    }
    
    // Remove as primary contact from organizations
    await db.update(organizations).set({ primaryContactId: null }).where(eq(organizations.primaryContactId, id));
    
    // Finally delete the user
    await db.delete(users).where(eq(users.id, id));
  }

  // Task template operations for Faces of Kelowna workflow
  async getTaskTemplatesForService(serviceId: string): Promise<any[]> {
    return await db.select().from(taskTemplates).where(eq(taskTemplates.serviceId, serviceId));
  }

  async createTasksFromTemplates(projectId: string, serviceId: string): Promise<void> {
    const templates = await this.getTaskTemplatesForService(serviceId);
    
    if (templates.length === 0) {
      return; // No templates found for this service
    }

    const projectStartDate = new Date();
    
    // Create tasks from templates
    for (const template of templates) {
      const dueDate = new Date(projectStartDate);
      dueDate.setDate(dueDate.getDate() + template.dayOffset);

      await db.insert(tasks).values({
        projectId,
        serviceId,
        title: template.title,
        description: template.description,
        status: 'in_progress',
        dueDate,
        priority: template.priority,
        taskType: template.taskType,
        estimatedHours: template.estimatedHours,
        clientVisible: template.clientVisible,
      });
    }
  }

  // Team member operations
  async getAllTeamMembers(): Promise<TeamMember[]> {
    return await db.select().from(teamMembers).where(eq(teamMembers.isActive, true));
  }

  async getTeamMember(id: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member;
  }

  async getTeamMemberByEmail(email: string): Promise<TeamMember | undefined> {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.email, email));
    return member;
  }

  async createTeamMember(memberData: InsertTeamMember): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values(memberData).returning();
    return member;
  }

  async updateTeamMember(id: string, updates: Partial<TeamMember>): Promise<TeamMember> {
    const [member] = await db
      .update(teamMembers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(teamMembers.id, id))
      .returning();
    return member;
  }

  async deleteTeamMember(id: string): Promise<void> {
    await db.update(teamMembers).set({ isActive: false }).where(eq(teamMembers.id, id));
  }
}

export const storage = new DatabaseStorage();
