import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  varchar,
  timestamp,
  integer,
  decimal,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
// Organizations/Business table for grouping multiple clients
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  website: varchar("website"),
  industry: varchar("industry"),
  primaryContactId: varchar("primary_contact_id").references(() => users.id),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("client"), // "client" or "admin"
  companyName: varchar("company_name"),
  organizationId: varchar("organization_id").references(() => organizations.id),
  jobTitle: varchar("job_title"),
  phone: varchar("phone"),
  address: text("address"),
  googleAccessToken: text("google_access_token"), // Google OAuth access token
  googleRefreshToken: text("google_refresh_token"), // Google OAuth refresh token
  googleTokenExpiry: timestamp("google_token_expiry"), // Token expiration
  calendarSyncEnabled: boolean("calendar_sync_enabled").default(false), // User preference for calendar sync
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  clientId: varchar("client_id").references(() => users.id),
  organizationId: varchar("organization_id").references(() => organizations.id),
  serviceId: varchar("service_id").references(() => services.id), // Link to service for workflow automation
  status: varchar("status").notNull().default("active"), // "active", "completed", "on_hold", "pending"
  startDate: timestamp("start_date"),
  expectedCompletion: timestamp("expected_completion"),
  budget: decimal("budget", { precision: 10, scale: 2 }),
  progress: integer("progress").default(0), // percentage 0-100
  displayOrder: integer("display_order").default(0), // For drag-and-drop ordering within organizations
  googleDriveFolderId: text("google_drive_folder_id"),
  googleDriveFolderUrl: text("google_drive_folder_url"),
  isDeleted: boolean("is_deleted").default(false), // Soft delete flag
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const serviceCategories = pgTable("service_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  categoryId: varchar("category_id").references(() => serviceCategories.id),
  category: varchar("category").notNull(), // Main category field for now
  description: text("description"),
  isActive: boolean("is_active").default(true),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id), // Made nullable for organization tasks
  organizationId: varchar("organization_id").references(() => organizations.id), // For organization-level tasks
  serviceId: varchar("service_id").references(() => services.id),
  title: text("title").notNull(),
  description: text("description"),
  status: varchar("status").notNull().default("in_progress"), // "in_progress", "completed", "needs_approval", "outstanding", "needs_clarification"
  assignedTo: varchar("assigned_to").references(() => users.id),
  dueDate: timestamp("due_date"),
  dueTime: varchar("due_time", { length: 5 }), // Format: "HH:MM"
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  priority: varchar("priority").default("medium"), // "low", "medium", "high", "urgent"
  taskType: varchar("task_type").default("standard"), // "standard", "milestone", "review", "approval"
  taskScope: varchar("task_scope").default("project"), // "project", "organization"
  googleDriveLink: text("google_drive_link"), // Optional link to Google Drive files
  dependencies: text("dependencies").array(), // Array of task IDs that must be completed first
  estimatedHours: integer("estimated_hours"),
  actualHours: integer("actual_hours"),
  assigneeRole: varchar("assignee_role"), // "project_manager", "content_writer", "photographer", "designer", "client"
  assignedToMember: varchar("assigned_to_member"), // Specific team member name assignment
  clientVisible: boolean("client_visible").default(true), // Whether client can see this task
  googleCalendarEventId: varchar("google_calendar_event_id"), // Google Calendar event ID for synced tasks
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projectFiles = pgTable("project_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  taskId: varchar("task_id").references(() => tasks.id),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size"),
  fileType: varchar("file_type"),
  category: varchar("category"), // "design", "document", "report", etc.
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  isApprovalRequired: boolean("is_approval_required").default(false),
  isApproved: boolean("is_approved"),
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const analytics = pgTable("analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  metricType: varchar("metric_type").notNull(), // "traffic", "conversions", "leads", "revenue", etc.
  metricValue: decimal("metric_value", { precision: 15, scale: 2 }).notNull(),
  period: varchar("period").notNull(), // "daily", "weekly", "monthly"
  date: timestamp("date").notNull(),
  additionalData: jsonb("additional_data"), // flexible storage for metric-specific data
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  messageType: varchar("message_type").default("text"), // "text", "file", "system"
  attachmentPath: text("attachment_path"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const kpis = pgTable("kpis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(), // e.g. "Lead Generation", "Brand Awareness", "Sales Revenue"
  category: varchar("category").notNull(), // "marketing", "sales", "engagement", "revenue", "traffic"
  targetValue: decimal("target_value", { precision: 15, scale: 2 }).notNull(),
  currentValue: decimal("current_value", { precision: 15, scale: 2 }).default("0"),
  unit: varchar("unit").notNull(), // "leads", "dollars", "visitors", "conversions", "percentage"
  period: varchar("period").notNull(), // "monthly", "quarterly", "annual", "campaign"
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  integrationSource: varchar("integration_source"), // "google_ads", "facebook_ads", "ga4", "manual", etc.
  integrationConfig: jsonb("integration_config"), // API connection details and mapping
  status: varchar("status").default("active"), // "active", "paused", "completed"
  notes: text("notes"),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});



// Task templates for service workflows (especially Faces of Kelowna)
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

// Team members table for task assignments and notifications
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

// Individual task assignments - allows multiple team members per task with individual completion status
export const taskAssignments = pgTable("task_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => tasks.id),
  teamMemberId: varchar("team_member_id").notNull().references(() => teamMembers.id),
  assignedBy: varchar("assigned_by").notNull().references(() => users.id),
  isCompleted: boolean("is_completed").default(false), // Individual completion status for this team member
  completedAt: timestamp("completed_at"),
  notes: text("notes"), // Individual notes for this assignment
  estimatedHours: integer("estimated_hours"), // Can be different per team member
  actualHours: integer("actual_hours"),
  calendarEventId: varchar("calendar_event_id"), // Google Calendar event ID for this assignment
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Proposals table for slide deck and complex proposal management
export const proposals = pgTable("proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalNumber: varchar("proposal_number").notNull().unique(),
  clientId: varchar("client_id").references(() => users.id),
  organizationId: varchar("organization_id").references(() => organizations.id),
  title: text("title").notNull(),
  description: text("description"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status").notNull().default("draft"), // "draft", "sent", "approved", "partially_approved", "declined", "converted"
  validUntil: timestamp("valid_until"),
  terms: text("terms"),
  notes: text("notes"),
  attachmentPath: text("attachment_path"), // Path to uploaded proposal/slide deck file
  approvalType: varchar("approval_type"), // "full", "partial", "declined"
  approvedDate: timestamp("approved_date"),
  convertedToProjectsAt: timestamp("converted_to_projects_at"),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Proposal items/phases that can be individually approved
export const proposalItems = pgTable("proposal_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  proposalId: varchar("proposal_id").notNull().references(() => proposals.id),
  title: text("title").notNull(),
  description: text("description"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  timeline: text("timeline"), // e.g., "2-3 weeks", "3-4 weeks"
  phase: integer("phase"), // 1, 2, 3, etc. for phase-based proposals
  itemOrder: integer("item_order").default(0),
  isApproved: boolean("is_approved").default(false),
  serviceId: varchar("service_id").references(() => services.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Quotes/Proposals table for automatic project and task generation (legacy - keeping for compatibility)
export const quotes = pgTable("quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteNumber: varchar("quote_number").notNull().unique(),
  clientId: varchar("client_id").references(() => users.id),
  organizationId: varchar("organization_id").references(() => organizations.id),
  title: text("title").notNull(),
  description: text("description"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status").notNull().default("draft"), // "draft", "sent", "approved", "declined", "converted"
  filePath: text("file_path"), // Path to uploaded quote file
  fileName: varchar("file_name"),
  fileSize: integer("file_size"),
  parsedData: jsonb("parsed_data"), // Extracted services and tasks from quote
  projectId: varchar("project_id").references(() => projects.id), // Generated project ID
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  approvedAt: timestamp("approved_at"),
  convertedAt: timestamp("converted_at"), // When quote was converted to project
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Quote line items for detailed breakdown
export const quoteLineItems = pgTable("quote_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").references(() => quotes.id, { onDelete: "cascade" }).notNull(),
  serviceId: varchar("service_id").references(() => services.id),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  estimatedHours: integer("estimated_hours"),
  taskTemplateData: jsonb("task_template_data"), // Template for auto-generated tasks
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  primaryContact: one(users, {
    fields: [organizations.primaryContactId],
    references: [users.id],
  }),
  users: many(users),
  projects: many(projects),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  projects: many(projects),
  assignedTasks: many(tasks),
  uploadedFiles: many(projectFiles),
  sentMessages: many(messages),
  createdKpis: many(kpis),
}));

export const serviceCategoriesRelations = relations(serviceCategories, ({ many }) => ({
  services: many(services),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(users, {
    fields: [projects.clientId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  tasks: many(tasks),
  files: many(projectFiles),
  analytics: many(analytics),
  messages: many(messages),
  kpis: many(kpis),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  category: one(serviceCategories, {
    fields: [services.categoryId],
    references: [serviceCategories.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  service: one(services, {
    fields: [tasks.serviceId],
    references: [services.id],
  }),
  assignee: one(users, {
    fields: [tasks.assignedTo],
    references: [users.id],
  }),
  assignments: many(taskAssignments),
}));

export const teamMembersRelations = relations(teamMembers, ({ many }) => ({
  assignments: many(taskAssignments),
}));

export const taskAssignmentsRelations = relations(taskAssignments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAssignments.taskId],
    references: [tasks.id],
  }),
  teamMember: one(teamMembers, {
    fields: [taskAssignments.teamMemberId],
    references: [teamMembers.id],
  }),
  assignedBy: one(users, {
    fields: [taskAssignments.assignedBy],
    references: [users.id],
  }),
}));

export const projectFilesRelations = relations(projectFiles, ({ one }) => ({
  project: one(projects, {
    fields: [projectFiles.projectId],
    references: [projects.id],
  }),
  task: one(tasks, {
    fields: [projectFiles.taskId],
    references: [tasks.id],
  }),
  uploader: one(users, {
    fields: [projectFiles.uploadedBy],
    references: [users.id],
  }),
  approver: one(users, {
    fields: [projectFiles.approvedBy],
    references: [users.id],
  }),
}));

export const analyticsRelations = relations(analytics, ({ one }) => ({
  project: one(projects, {
    fields: [analytics.projectId],
    references: [projects.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  project: one(projects, {
    fields: [messages.projectId],
    references: [projects.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
}));

export const kpisRelations = relations(kpis, ({ one }) => ({
  project: one(projects, {
    fields: [kpis.projectId],
    references: [projects.id],
  }),
  creator: one(users, {
    fields: [kpis.createdBy],
    references: [users.id],
  }),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  client: one(users, {
    fields: [quotes.clientId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [quotes.organizationId],
    references: [organizations.id],
  }),
  project: one(projects, {
    fields: [quotes.projectId],
    references: [projects.id],
  }),
  creator: one(users, {
    fields: [quotes.createdBy],
    references: [users.id],
  }),
  lineItems: many(quoteLineItems),
}));

export const quoteLineItemsRelations = relations(quoteLineItems, ({ one }) => ({
  quote: one(quotes, {
    fields: [quoteLineItems.quoteId],
    references: [quotes.id],
  }),
  service: one(services, {
    fields: [quoteLineItems.serviceId],
    references: [services.id],
  }),
}));

// Insert schemas
export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertServiceCategorySchema = createInsertSchema(serviceCategories).omit({
  id: true,
  createdAt: true,
});

export const insertServiceSchema = createInsertSchema(services).omit({
  id: true,
  createdAt: true,
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTaskAssignmentSchema = createInsertSchema(taskAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectFileSchema = createInsertSchema(projectFiles).omit({
  id: true,
  createdAt: true,
});

export const insertAnalyticsSchema = createInsertSchema(analytics).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertKpiSchema = createInsertSchema(kpis).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuoteLineItemSchema = createInsertSchema(quoteLineItems).omit({
  id: true,
  createdAt: true,
});

export const insertProposalSchema = createInsertSchema(proposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProposalItemSchema = createInsertSchema(proposalItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type UpsertUser = typeof users.$inferInsert;
export type InsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Team invitation system for agency staff
export const teamInvitations = pgTable("team_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull(),
  invitedBy: varchar("invited_by").notNull().references(() => users.id),
  role: varchar("role").notNull().default("admin"), // Agency team members get admin access
  status: varchar("status").notNull().default("pending"), // pending, accepted, expired
  invitationToken: varchar("invitation_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
});

export type TeamInvitation = typeof teamInvitations.$inferSelect;
export type InsertTeamInvitation = typeof teamInvitations.$inferInsert;

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertServiceCategory = z.infer<typeof insertServiceCategorySchema>;
export type ServiceCategory = typeof serviceCategories.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof services.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTaskAssignment = z.infer<typeof insertTaskAssignmentSchema>;
export type TaskAssignment = typeof taskAssignments.$inferSelect;
export type InsertProjectFile = z.infer<typeof insertProjectFileSchema>;
export type ProjectFile = typeof projectFiles.$inferSelect;
export type InsertAnalytics = z.infer<typeof insertAnalyticsSchema>;
export type Analytics = typeof analytics.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertKpi = z.infer<typeof insertKpiSchema>;
export type Kpi = typeof kpis.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type QuoteLineItem = typeof quoteLineItems.$inferSelect;
export type InsertQuoteLineItem = z.infer<typeof insertQuoteLineItemSchema>;
export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type ProposalItem = typeof proposalItems.$inferSelect;
export type InsertProposalItem = z.infer<typeof insertProposalItemSchema>;
