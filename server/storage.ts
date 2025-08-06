import {
  users,
  projects,
  services,
  tasks,
  projectFiles,
  analytics,
  messages,
  kpis,
  type User,
  type UpsertUser,
  type Project,
  type InsertProject,
  type Service,
  type InsertService,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte } from "drizzle-orm";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getClientUsers(): Promise<User[]>;
  
  // Project operations
  getProjectsByClient(clientId: string): Promise<Project[]>;
  getAllProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, updates: Partial<InsertProject>): Promise<Project>;
  
  // Service operations
  getServices(): Promise<Service[]>;
  createService(service: InsertService): Promise<Service>;
  
  // Task operations
  getTasksByProject(projectId: string): Promise<Task[]>;
  getTasksByProjectWithDetails(projectId: string): Promise<(Task & { service?: Service })[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, updates: Partial<InsertTask>): Promise<Task>;
  
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

  // Service operations
  async getServices(): Promise<Service[]> {
    return db.select().from(services).where(eq(services.isActive, true));
  }

  async createService(service: InsertService): Promise<Service> {
    const [newService] = await db.insert(services).values(service).returning();
    return newService;
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
}

export const storage = new DatabaseStorage();
