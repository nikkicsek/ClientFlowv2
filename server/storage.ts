import {
  users,
  organizations,
  projects,
  services,
  serviceCategories,
  tasks,
  taskTemplates,
  taskAssignments,
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
  type TaskAssignment,
  type InsertTaskAssignment,
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
  quotes,
  quoteLineItems,
  proposals,
  proposalItems,
  type Quote,
  type InsertQuote,
  type QuoteLineItem,
  type InsertQuoteLineItem,
  type Proposal,
  type InsertProposal,
  type ProposalItem,
  type InsertProposalItem,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte, inArray, isNull, isNotNull } from "drizzle-orm";

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
  getAllProjects(): Promise<(Project & { organization?: Organization })[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, updates: Partial<InsertProject>): Promise<Project>;
  updateProjectOrder(organizationId: string, projectOrders: { id: string; displayOrder: number }[]): Promise<void>;
  
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

  // Team member operations
  getAllTeamMembers(): Promise<TeamMember[]>;
  getTeamMember(id: string): Promise<TeamMember | undefined>;
  getTeamMemberByEmail(email: string): Promise<TeamMember | undefined>;
  createTeamMember(memberData: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: string, updates: Partial<TeamMember>): Promise<TeamMember>;
  deleteTeamMember(id: string): Promise<void>;

  // Task assignment operations
  getTaskAssignments(taskId: string): Promise<(TaskAssignment & { teamMember: TeamMember })[]>;
  getTaskAssignmentsByTeamMember(teamMemberId: string): Promise<(TaskAssignment & { task: Task; project?: Project })[]>;
  createTaskAssignment(assignment: InsertTaskAssignment): Promise<TaskAssignment>;
  updateTaskAssignment(id: string, updates: Partial<InsertTaskAssignment>): Promise<TaskAssignment>;
  deleteTaskAssignment(id: string): Promise<void>;

  // Team invitation operations
  createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation>;
  getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined>;
  getTeamInvitations(): Promise<TeamInvitation[]>;
  updateTeamInvitationStatus(id: string, status: string, acceptedAt?: Date): Promise<TeamInvitation | undefined>;
  deleteKpi(id: string): Promise<void>;

  // Quote operations
  getQuotes(): Promise<Quote[]>;
  getQuote(id: string): Promise<Quote | undefined>;
  createQuote(quote: InsertQuote): Promise<Quote>;
  updateQuote(id: string, updates: Partial<InsertQuote>): Promise<Quote>;
  convertQuoteToProject(quoteId: string): Promise<Project>;
  getQuoteLineItems(quoteId: string): Promise<QuoteLineItem[]>;
  createQuoteLineItem(lineItem: InsertQuoteLineItem): Promise<QuoteLineItem>;
  
  // Proposal operations
  createProposal(proposal: InsertProposal): Promise<Proposal>;
  getProposals(): Promise<Proposal[]>;
  getProposal(id: string): Promise<Proposal | undefined>;
  updateProposal(id: string, updates: Partial<InsertProposal>): Promise<Proposal>;
  createProposalItem(item: InsertProposalItem): Promise<ProposalItem>;
  getProposalItems(proposalId: string): Promise<ProposalItem[]>;
  updateProposalItem(id: string, updates: Partial<InsertProposalItem>): Promise<ProposalItem>;

  // Soft delete operations
  softDeleteOrganization(id: string, deletedBy: string): Promise<void>;
  softDeleteUser(id: string, deletedBy: string): Promise<void>;
  softDeleteProject(id: string, deletedBy: string): Promise<void>;
  softDeleteService(id: string, deletedBy: string): Promise<void>;
  softDeleteTask(id: string, deletedBy: string): Promise<void>;
  softDeleteProposal(id: string, deletedBy: string): Promise<void>;

  // Restore operations
  restoreOrganization(id: string): Promise<void>;
  restoreUser(id: string): Promise<void>;
  restoreProject(id: string): Promise<void>;
  restoreService(id: string): Promise<void>;
  restoreTask(id: string): Promise<void>;
  restoreProposal(id: string): Promise<void>;

  // Get deleted items
  getDeletedItems(): Promise<any[]>;
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
    return db.select().from(users).where(and(eq(users.role, 'client'), isNull(users.deletedAt)));
  }

  // Project operations
  async getProjectsByClient(clientId: string): Promise<Project[]> {
    return db.select().from(projects).where(and(eq(projects.clientId, clientId), isNull(projects.deletedAt))).orderBy(desc(projects.createdAt));
  }

  async getAllProjects(): Promise<(Project & { organization?: Organization })[]> {
    const result = await db
      .select({
        project: projects,
        organization: organizations,
      })
      .from(projects)
      .leftJoin(organizations, eq(projects.organizationId, organizations.id))
      .where(isNull(projects.deletedAt))
      .orderBy(desc(projects.createdAt));

    return result.map(({ project, organization }) => ({
      ...project,
      organization: organization || undefined,
    }));
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

  async updateProjectOrder(organizationId: string, projectOrders: { id: string; displayOrder: number }[]): Promise<void> {
    // Update display order for each project
    for (const { id, displayOrder } of projectOrders) {
      await db
        .update(projects)
        .set({ displayOrder, updatedAt: new Date() })
        .where(and(eq(projects.id, id), eq(projects.organizationId, organizationId)));
    }
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
    return db.select().from(services).where(and(eq(services.isActive, true), isNull(services.deletedAt)));
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
    return db.select().from(tasks).where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt))).orderBy(desc(tasks.createdAt));
  }

  async getTasksByProjectWithDetails(projectId: string): Promise<(Task & { service?: Service })[]> {
    const result = await db
      .select({
        task: tasks,
        service: services,
      })
      .from(tasks)
      .leftJoin(services, eq(tasks.serviceId, services.id))
      .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
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
      .where(isNull(tasks.deletedAt))
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
    return db.select().from(organizations).where(isNull(organizations.deletedAt)).orderBy(desc(organizations.createdAt));
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
    return db.select().from(users).where(and(eq(users.organizationId, organizationId), isNull(users.deletedAt)));
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

  // Task assignment operations
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
      .where(and(eq(taskAssignments.teamMemberId, teamMemberId), eq(taskAssignments.isCompleted, false)));
    
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
    const [updatedAssignment] = await db
      .update(taskAssignments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(taskAssignments.id, id))
      .returning();
    return updatedAssignment;
  }

  async deleteTaskAssignment(id: string): Promise<void> {
    await db.delete(taskAssignments).where(eq(taskAssignments.id, id));
  }

  // Quote operations
  async getQuotes(): Promise<Quote[]> {
    return db.select().from(quotes).orderBy(desc(quotes.createdAt));
  }

  async getQuote(id: string): Promise<Quote | undefined> {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    return quote;
  }

  async createQuote(quote: InsertQuote): Promise<Quote> {
    const [newQuote] = await db.insert(quotes).values(quote).returning();
    return newQuote;
  }

  async updateQuote(id: string, updates: Partial<InsertQuote>): Promise<Quote> {
    const [updatedQuote] = await db
      .update(quotes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(quotes.id, id))
      .returning();
    return updatedQuote;
  }

  async convertQuoteToProject(quoteId: string): Promise<Project> {
    const quote = await this.getQuote(quoteId);
    if (!quote) throw new Error("Quote not found");

    // Create project from quote
    const projectData: InsertProject = {
      name: quote.title,
      description: quote.description,
      clientId: quote.clientId,
      organizationId: quote.organizationId,
      budget: quote.totalAmount,
      status: "active",
      startDate: new Date(),
    };

    const project = await this.createProject(projectData);

    // Update quote status and link to project
    await this.updateQuote(quoteId, {
      status: "converted",
      projectId: project.id,
      convertedAt: new Date(),
    });

    // Create tasks from quote line items
    const lineItems = await this.getQuoteLineItems(quoteId);
    for (const item of lineItems) {
      if (item.taskTemplateData) {
        const taskData: InsertTask = {
          title: item.description,
          description: item.description,
          projectId: project.id,
          serviceId: item.serviceId,
          status: "pending",
          priority: "medium",
          estimatedHours: item.estimatedHours,
        };
        await this.createTask(taskData);
      }
    }

    return project;
  }

  async getQuoteLineItems(quoteId: string): Promise<QuoteLineItem[]> {
    return db.select().from(quoteLineItems).where(eq(quoteLineItems.quoteId, quoteId));
  }

  async createQuoteLineItem(lineItem: InsertQuoteLineItem): Promise<QuoteLineItem> {
    const [newLineItem] = await db.insert(quoteLineItems).values(lineItem).returning();
    return newLineItem;
  }

  // Proposal operations
  async createProposal(proposalData: InsertProposal): Promise<Proposal> {
    const [proposal] = await db.insert(proposals).values(proposalData).returning();
    return proposal;
  }

  async getProposals(): Promise<Proposal[]> {
    return db.select().from(proposals).where(isNull(proposals.deletedAt)).orderBy(desc(proposals.createdAt));
  }

  async getProposal(id: string): Promise<Proposal | undefined> {
    const [proposal] = await db.select().from(proposals).where(eq(proposals.id, id));
    return proposal;
  }

  async updateProposal(id: string, updates: Partial<InsertProposal>): Promise<Proposal> {
    const [proposal] = await db
      .update(proposals)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(proposals.id, id))
      .returning();
    return proposal;
  }

  async createProposalItem(itemData: InsertProposalItem): Promise<ProposalItem> {
    const [item] = await db.insert(proposalItems).values(itemData).returning();
    return item;
  }

  async getProposalItems(proposalId: string): Promise<ProposalItem[]> {
    return db.select().from(proposalItems).where(eq(proposalItems.proposalId, proposalId));
  }

  async updateProposalItem(id: string, updates: Partial<InsertProposalItem>): Promise<ProposalItem> {
    const [item] = await db
      .update(proposalItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(proposalItems.id, id))
      .returning();
    return item;
  }

  // Soft delete operations
  async softDeleteOrganization(id: string, deletedBy: string): Promise<void> {
    await db
      .update(organizations)
      .set({ deletedAt: new Date(), deletedBy })
      .where(eq(organizations.id, id));
  }

  async softDeleteUser(id: string, deletedBy: string): Promise<void> {
    await db
      .update(users)
      .set({ deletedAt: new Date(), deletedBy })
      .where(eq(users.id, id));
  }

  async softDeleteProject(id: string, deletedBy: string): Promise<void> {
    await db
      .update(projects)
      .set({ deletedAt: new Date(), deletedBy })
      .where(eq(projects.id, id));
  }

  async softDeleteService(id: string, deletedBy: string): Promise<void> {
    await db
      .update(services)
      .set({ deletedAt: new Date(), deletedBy })
      .where(eq(services.id, id));
  }

  async softDeleteTask(id: string, deletedBy: string): Promise<void> {
    await db
      .update(tasks)
      .set({ deletedAt: new Date(), deletedBy })
      .where(eq(tasks.id, id));
  }

  async softDeleteProposal(id: string, deletedBy: string): Promise<void> {
    await db
      .update(proposals)
      .set({ deletedAt: new Date(), deletedBy })
      .where(eq(proposals.id, id));
  }

  // Restore operations
  async restoreOrganization(id: string): Promise<void> {
    await db
      .update(organizations)
      .set({ deletedAt: null, deletedBy: null })
      .where(eq(organizations.id, id));
  }

  async restoreUser(id: string): Promise<void> {
    await db
      .update(users)
      .set({ deletedAt: null, deletedBy: null })
      .where(eq(users.id, id));
  }

  async restoreProject(id: string): Promise<void> {
    await db
      .update(projects)
      .set({ deletedAt: null, deletedBy: null })
      .where(eq(projects.id, id));
  }

  async restoreService(id: string): Promise<void> {
    await db
      .update(services)
      .set({ deletedAt: null, deletedBy: null })
      .where(eq(services.id, id));
  }

  async restoreTask(id: string): Promise<void> {
    await db
      .update(tasks)
      .set({ deletedAt: null, deletedBy: null })
      .where(eq(tasks.id, id));
  }

  async restoreProposal(id: string): Promise<void> {
    await db
      .update(proposals)
      .set({ deletedAt: null, deletedBy: null })
      .where(eq(proposals.id, id));
  }

  // Get deleted items
  async getDeletedItems(): Promise<any[]> {
    const deletedItems: any[] = [];

    // Get deleted organizations
    const deletedOrganizations = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        deletedAt: organizations.deletedAt,
        deletedBy: organizations.deletedBy,
      })
      .from(organizations)
      .where(isNotNull(organizations.deletedAt))
      .orderBy(desc(organizations.deletedAt));

    deletedItems.push(
      ...deletedOrganizations.map(item => ({
        ...item,
        type: 'organization',
      }))
    );

    // Get deleted users (clients)
    const deletedUsers = await db
      .select({
        id: users.id,
        name: users.firstName,
        deletedAt: users.deletedAt,
        deletedBy: users.deletedBy,
      })
      .from(users)
      .where(isNotNull(users.deletedAt))
      .orderBy(desc(users.deletedAt));

    deletedItems.push(
      ...deletedUsers.map(item => ({
        ...item,
        name: `${item.name} (Client)`,
        type: 'user',
      }))
    );

    // Get deleted projects
    const deletedProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        deletedAt: projects.deletedAt,
        deletedBy: projects.deletedBy,
      })
      .from(projects)
      .where(isNotNull(projects.deletedAt))
      .orderBy(desc(projects.deletedAt));

    deletedItems.push(
      ...deletedProjects.map(item => ({
        ...item,
        type: 'project',
      }))
    );

    // Get deleted services
    const deletedServices = await db
      .select({
        id: services.id,
        name: services.name,
        deletedAt: services.deletedAt,
        deletedBy: services.deletedBy,
      })
      .from(services)
      .where(isNotNull(services.deletedAt))
      .orderBy(desc(services.deletedAt));

    deletedItems.push(
      ...deletedServices.map(item => ({
        ...item,
        type: 'service',
      }))
    );

    // Get deleted tasks
    const deletedTasks = await db
      .select({
        id: tasks.id,
        name: tasks.title,
        deletedAt: tasks.deletedAt,
        deletedBy: tasks.deletedBy,
      })
      .from(tasks)
      .where(isNotNull(tasks.deletedAt))
      .orderBy(desc(tasks.deletedAt));

    deletedItems.push(
      ...deletedTasks.map(item => ({
        ...item,
        type: 'task',
      }))
    );

    // Get deleted proposals
    const deletedProposals = await db
      .select({
        id: proposals.id,
        name: proposals.title,
        deletedAt: proposals.deletedAt,
        deletedBy: proposals.deletedBy,
      })
      .from(proposals)
      .where(isNotNull(proposals.deletedAt))
      .orderBy(desc(proposals.deletedAt));

    deletedItems.push(
      ...deletedProposals.map(item => ({
        ...item,
        type: 'proposal',
      }))
    );

    // Sort all items by deletion date
    return deletedItems.sort((a, b) => 
      new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
    );
  }
}

export const storage = new DatabaseStorage();
