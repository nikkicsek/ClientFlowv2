# Google Calendar Integration Export

This document contains all the relevant code files for the Google Calendar OAuth integration implementation.

## Overview

The Google Calendar integration provides session-independent OAuth authentication that:
- Uses Google profile email matching against users/team_members tables
- Stores OAuth tokens in dedicated database table
- Supports both root and /api path routing for maximum compatibility
- Implements proper Express routing order to prevent SPA 404 conflicts
- Provides full page navigation for OAuth flow

## Files

### server/index.ts

```typescript
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { googleRouter } from './oauth/googleRoutes';
import { pool } from './db';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Attach database pool to app for Google OAuth
app.set('db', pool);

// CRITICAL: Mount Google OAuth routes BEFORE any static/SPA routes
app.use(googleRouter);

// Add routes introspection endpoint for debugging
app.get('/debug/express-routes', (_req, res) => {
  const routes = [];
  const stack = app._router?.stack || [];
  stack.forEach((m) => {
    if (m.route?.path) {
      routes.push({ method: Object.keys(m.route.methods)[0], path: m.route.path });
    } else if (m.name === 'router' && m.handle?.stack) {
      m.handle.stack.forEach((h) => {
        if (h.route?.path) {
          routes.push({ method: Object.keys(h.route.methods)[0], path: h.route.path });
        }
      });
    }
  });
  res.json(routes);
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

  // Also mount Google OAuth routes under /api for compatibility
  app.use('/api', googleRouter);

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
```

### server/oauth/googleRoutes.ts

```typescript
import { Router } from 'express';
import { google } from 'googleapis';
import { Pool } from 'pg';

export const googleRouter = Router();

function oauth2() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

async function saveTokens(db: Pool, userId: string, tokens: any, scopes: string) {
  const expiry = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 55 * 60 * 1000);
  await db.query(`
    INSERT INTO oauth_tokens (user_id, access_token, refresh_token, expiry, scopes, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
      expiry = EXCLUDED.expiry,
      scopes = EXCLUDED.scopes,
      updated_at = now()
  `, [userId, tokens.access_token, tokens.refresh_token || null, expiry, scopes]);
}

googleRouter.get('/oauth/google/connect', async (req: any, res) => {
  console.log('>> HIT /oauth/google/connect');
  const client = oauth2();
  const scope = [
    'openid', 'email', 'profile',
    'https://www.googleapis.com/auth/calendar.events'
  ];
  const state = (req.user?.claims?.sub as string) || (req.user?.id as string) || '';
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope,
    state,
  });
  res.redirect(url);
});

// Also mount under /api path for compatibility
googleRouter.get('/api/oauth/google/connect', async (req: any, res) => {
  console.log('>> HIT /api/oauth/google/connect');
  const client = oauth2();
  const scope = [
    'openid', 'email', 'profile',
    'https://www.googleapis.com/auth/calendar.events'
  ];
  const state = (req.user?.claims?.sub as string) || (req.user?.id as string) || '';
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope,
    state,
  });
  res.redirect(url);
});

googleRouter.get('/oauth/google/callback', async (req: any, res) => {
  console.log('>> HIT /oauth/google/callback', req.query);
  try {
    const client = oauth2();
    const { tokens } = await client.getToken(req.query.code as string);
    client.setCredentials(tokens);

    // Get user profile from Google
    const oauth2Api = google.oauth2({ version: 'v2', auth: client });
    const { data: profile } = await oauth2Api.userinfo.get();
    const email = profile.email;
    const googleSub = profile.id;

    if (!email) {
      console.error('OAuth callback failure: No email in Google profile', { query: req.query });
      return res.status(400).send('Unable to retrieve email from Google profile. Please try again.');
    }

    // Find user ID by email in our database
    const db = req.app.get('db') as Pool;
    let userId: string | null = null;

    // Try users table first
    try {
      const userResult = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id;
      }
    } catch (err) {
      console.error('Error querying users table:', err);
    }

    // If not found in users, try team_members table
    if (!userId) {
      try {
        const teamResult = await db.query('SELECT id FROM team_members WHERE email = $1', [email]);
        if (teamResult.rows.length > 0) {
          // For team members, we'll use their team_member ID as the userId for tokens
          userId = teamResult.rows[0].id;
        }
      } catch (err) {
        console.error('Error querying team_members table:', err);
      }
    }

    if (!userId) {
      console.error('OAuth callback failure: Email not recognized', { email, query: req.query });
      return res.status(400).send(`Email ${email} not recognized in this workspace. Please contact your administrator.`);
    }

    const scopes = (tokens.scope as string) || 'https://www.googleapis.com/auth/calendar.events openid email profile';
    await saveTokens(db, userId, tokens, scopes);

    res.send('Google Calendar connected. You can close this window.');
  } catch (e: any) {
    console.error('OAuth callback failure', { query: req.query, err: e?.message });
    res.status(500).send('OAuth error occurred. Please try again or contact support.');
  }
});

// Also mount callback under /api path for compatibility
googleRouter.get('/api/oauth/google/callback', async (req: any, res) => {
  console.log('>> HIT /api/oauth/google/callback', req.query);
  try {
    const client = oauth2();
    const { tokens } = await client.getToken(req.query.code as string);
    client.setCredentials(tokens);

    // Get user profile from Google
    const oauth2Api = google.oauth2({ version: 'v2', auth: client });
    const { data: profile } = await oauth2Api.userinfo.get();
    const email = profile.email;
    const googleSub = profile.id;

    if (!email) {
      console.error('OAuth callback failure: No email in Google profile', { query: req.query });
      return res.status(400).send('Unable to retrieve email from Google profile. Please try again.');
    }

    // Find user ID by email in our database
    const db = req.app.get('db') as Pool;
    let userId: string | null = null;

    // Try users table first
    try {
      const userResult = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id;
      }
    } catch (err) {
      console.error('Error querying users table:', err);
    }

    // If not found in users, try team_members table
    if (!userId) {
      try {
        const teamResult = await db.query('SELECT id FROM team_members WHERE email = $1', [email]);
        if (teamResult.rows.length > 0) {
          // For team members, we'll use their team_member ID as the userId for tokens
          userId = teamResult.rows[0].id;
        }
      } catch (err) {
        console.error('Error querying team_members table:', err);
      }
    }

    if (!userId) {
      console.error('OAuth callback failure: Email not recognized', { email, query: req.query });
      return res.status(400).send(`Email ${email} not recognized in this workspace. Please contact your administrator.`);
    }

    const scopes = (tokens.scope as string) || 'https://www.googleapis.com/auth/calendar.events openid email profile';
    await saveTokens(db, userId, tokens, scopes);

    res.send('Google Calendar connected. You can close this window.');
  } catch (e: any) {
    console.error('OAuth callback failure', { query: req.query, err: e?.message });
    res.status(500).send('OAuth error occurred. Please try again or contact support.');
  }
});

// Hard test route to confirm Express routing
googleRouter.get('/oauth/ping', (_req, res) => {
  console.log('>> HIT /oauth/ping');
  res.type('text').send('pong');
});

// Debug health route to confirm router is mounted
googleRouter.get('/debug/google-router', (req, res) => {
  res.json({ ok: true });
});
```

### server/routes.ts (Task/Assignment CRUD Hooks)

```typescript
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertProjectSchema, insertTaskSchema, insertMessageSchema, insertAnalyticsSchema, insertTeamMemberSchema, insertTaskAssignmentSchema, insertProposalSchema, insertProposalItemSchema } from "@shared/schema";
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

  // Calendar-related task operations with hooks
  app.post('/api/projects/:projectId/tasks', isAuthenticated, async (req: any, res) => {
    try {
      const projectId = req.params.projectId;
      const taskData = insertTaskSchema.parse({
        ...req.body,
        projectId,
        assignedTo: req.body.assignedTo || req.user.claims.sub,
      });

      const task = await storage.createTask(taskData);
      
      // Calendar hook for task creation
      await onTaskCreatedOrUpdated(task.id);
      
      res.json(task);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  app.put('/api/tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const task = await storage.updateTask(id, updates);
      
      // Calendar hook for task updates
      await onTaskCreatedOrUpdated(id);
      
      res.json(task);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  // Task assignment operations with calendar hooks
  app.post('/api/tasks/:taskId/assignments', isAuthenticated, async (req: any, res) => {
    try {
      const { taskId } = req.params;
      const assignmentData = insertTaskAssignmentSchema.parse({
        ...req.body,
        taskId,
      });

      const assignment = await storage.createTaskAssignment(assignmentData);
      
      // Calendar hook for assignment creation
      await onAssignmentCreated(assignment.id);
      
      res.json(assignment);
    } catch (error) {
      console.error("Error creating assignment:", error);
      res.status(500).json({ message: "Failed to create assignment" });
    }
  });

  app.delete('/api/assignments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      // Calendar hook for assignment deletion
      await onAssignmentDeleted(id);
      
      await storage.deleteTaskAssignment(id);
      res.json({ message: "Assignment deleted successfully" });
    } catch (error) {
      console.error("Error deleting assignment:", error);
      res.status(500).json({ message: "Failed to delete assignment" });
    }
  });

  // More routes...
  
  return createServer(app);
}
```

### server/storage.ts (Calendar-related methods)

```typescript
// Calendar-related storage methods

interface IStorage {
  // Google Calendar integration
  updateUserGoogleTokens(userId: string, tokens: {
    accessToken: string | null;
    refreshToken?: string | null;
    expiryDate: Date | null;
  }): Promise<User>;
  updateUserCalendarSync(userId: string, enabled: boolean): Promise<User>;
  updateTaskCalendarEvent(taskId: string, eventId: string | null): Promise<Task>;
  
  // Helper methods for OAuth user identification
  getUserIdByEmail(email: string): Promise<string | null>;
  getUserIdByTeamMemberEmail(email: string): Promise<string | null>;
  
  // Assignment calendar event tracking
  setAssignmentCalendarEventId(assignmentId: string, eventId: string): Promise<void>;
  clearAssignmentCalendarEventId(assignmentId: string): Promise<void>;
}

class Storage implements IStorage {
  async setAssignmentCalendarEventId(assignmentId: string, eventId: string): Promise<void> {
    await db
      .update(taskAssignments)
      .set({ 
        calendarEventId: eventId,
        updatedAt: new Date()
      })
      .where(eq(taskAssignments.id, assignmentId));
  }

  async clearAssignmentCalendarEventId(assignmentId: string): Promise<void> {
    await db
      .update(taskAssignments)
      .set({ 
        calendarEventId: null,
        updatedAt: new Date()
      })
      .where(eq(taskAssignments.id, assignmentId));
  }

  // Helper methods for OAuth user identification
  async getUserIdByEmail(email: string): Promise<string | null> {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    return user?.id || null;
  }

  async getUserIdByTeamMemberEmail(email: string): Promise<string | null> {
    const [teamMember] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.email, email));
    return teamMember?.id || null;
  }
}
```

### client/src/pages/my-tasks.tsx

```typescript
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { TeamMemberTasks } from '@/components/team-member-tasks';
import { CalendarSyncDialog } from '@/components/calendar-sync-dialog';
import { CalendarSettings } from '@/components/CalendarSettings';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, AlertCircle, Calendar } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export function MyTasksPage() {
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [location] = useLocation();
  const { toast } = useToast();

  // Check for calendar connection status from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const calendarStatus = urlParams.get('calendar');
    
    if (calendarStatus === 'connected') {
      toast({
        title: "Calendar Connected!",
        description: "Your Google Calendar has been successfully connected. You can now sync tasks.",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/my-tasks');
    } else if (calendarStatus === 'error') {
      toast({
        title: "Calendar Connection Failed",
        description: "There was an error connecting your Google Calendar. Please try again.",
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/my-tasks');
    }
  }, [location, toast]);

  // Get current user info
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  // Get team members to find the current user's team member record
  const { data: teamMembers = [], isLoading: teamLoading } = useQuery({
    queryKey: ["/api/team-members"],
    enabled: !!user?.email,
  });

  if (userLoading || teamLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center">
              <div className="animate-pulse">Loading your tasks...</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-400" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Required</h3>
              <p className="text-gray-600">Please log in to view your tasks.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Find current user's team member record for task assignments
  const currentTeamMember = teamMembers.find(tm => 
    tm.email.toLowerCase() === user.email.toLowerCase()
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <User className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
              <p className="text-gray-600">
                Welcome back, {user.firstName || 'User'}
              </p>
            </div>
          </div>
          
          <Button
            onClick={() => setShowCalendarDialog(true)}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            Calendar Sync
          </Button>
        </div>

        {/* Calendar Settings */}
        <CalendarSettings user={user} />

        {/* Team Member Tasks */}
        {currentTeamMember ? (
          <TeamMemberTasks 
            teamMember={currentTeamMember}
            showHeader={false}
          />
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-16 w-16 mx-auto mb-4 text-yellow-400" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Team Member Setup Required</h3>
              <p className="text-gray-600 mb-4">
                You need to be added as a team member to view and manage tasks.
              </p>
              <p className="text-sm text-gray-500">
                Contact your administrator to add you as a team member with email: {user.email}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Calendar Sync Dialog */}
        <CalendarSyncDialog 
          open={showCalendarDialog}
          onOpenChange={setShowCalendarDialog}
          user={user}
        />
      </div>
    </div>
  );
}
```

### client/src/components/CalendarSettings.tsx

```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CalendarSettingsProps {
  user: any;
}

export function CalendarSettings({ user }: CalendarSettingsProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  const handleConnectGoogle = () => {
    setIsConnecting(true);
    // Full page navigation to OAuth route with explicit origin
    window.location.assign(`${window.location.origin}/oauth/google/connect`);
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });

      if (response.ok) {
        toast({
          title: "Sync Complete",
          description: "Your tasks have been synced with Google Calendar.",
        });
      } else {
        throw new Error('Sync failed');
      }
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: "Failed to sync with Google Calendar. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Check if calendar is connected (would need real implementation)
  const isConnected = false; // placeholder for now

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Google Calendar Integration
        </CardTitle>
        <CardDescription>
          Sync your assigned tasks with Google Calendar for better scheduling.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Status:</span>
            {isConnected ? (
              <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                <Check className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary">
                Not Connected
              </Badge>
            )}
          </div>
        </div>

        {!isConnected ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your Google Calendar to automatically create calendar events for your assigned tasks.
            </p>
            <a 
              href="/oauth/google/connect" 
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full"
              rel="external"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Connect Google Calendar
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your calendar is connected. Tasks will automatically sync when assigned or updated.
            </p>
            <div className="flex gap-2">
              <Button 
                onClick={handleManualSync}
                disabled={isSyncing}
                variant="outline"
                size="sm"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Manual Sync
                  </>
                )}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  // Disconnect logic would go here
                  toast({
                    title: "Calendar Disconnected",
                    description: "Your Google Calendar has been disconnected.",
                  });
                }}
              >
                Disconnect
              </Button>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground border-t pt-3">
          <p><strong>How it works:</strong></p>
          <ul className="list-disc list-inside space-y-1">
            <li>Each assigned task creates a calendar event</li>
            <li>Task updates automatically sync to calendar</li>
            <li>Completed tasks are marked as done in calendar</li>
            <li>Individual team members control their own calendar sync</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
```

### migrations/001_calendar_patch.sql

```sql
-- OAuth tokens table for Google Calendar integration
CREATE TABLE IF NOT EXISTS oauth_tokens (
  user_id VARCHAR(255) PRIMARY KEY,
  access_token TEXT,
  refresh_token TEXT,
  expiry TIMESTAMP WITH TIME ZONE,
  scopes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add calendar event ID to task assignments for individual tracking
ALTER TABLE task_assignments 
ADD COLUMN IF NOT EXISTS calendar_event_id VARCHAR(255);

-- Index for better performance
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_id ON oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_calendar_event ON task_assignments(calendar_event_id);
```

## Environment Variables Required

```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret  
GOOGLE_REDIRECT_URI=https://your-domain.com/auth/google/callback

# Database
DATABASE_URL=your_postgresql_connection_string
```

## Key Features

1. **Session-Independent OAuth**: Uses Google profile email to match users in database
2. **Dual Path Support**: Works on both `/oauth` and `/api/oauth` paths  
3. **Express Routing Order**: OAuth routes mounted before SPA catch-all to prevent 404s
4. **Full Page Navigation**: Frontend uses direct links instead of React Router
5. **Error Handling**: Comprehensive logging and user-friendly error messages
6. **Token Persistence**: Saves OAuth tokens with proper refresh token handling
7. **Calendar Event Tracking**: Per-assignment calendar event ID storage for individual sync control

## Testing

- `/oauth/ping` → Returns "pong" to verify Express routing
- `/debug/express-routes` → Shows all mounted routes for debugging
- Console logs confirm route hits: `>> HIT /oauth/google/connect`, `>> HIT /oauth/google/callback`