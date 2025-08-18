import { storage } from './storage';
import { pool } from './db';
import { google } from 'googleapis';
import { DateTime } from 'luxon';

// Emergency kill-switch for calendar sync
export let SYNC_ENABLED = process.env.CALENDAR_SYNC_ENABLED !== 'false';
export function setSyncEnabled(v: boolean) { 
  SYNC_ENABLED = v;
  console.log('Auto calendar sync', v ? 'ENABLED' : 'DISABLED');
}

interface CalendarSyncResult {
  ok: boolean;
  eventId?: string;
  htmlLink?: string;
  startLocalISO?: string;
  error?: string;
}

class CalendarAutoSync {
  private oauth2Client: any;

  constructor() {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.warn('Calendar auto-sync disabled - missing OAuth credentials');
      return;
    }

    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  // Main entry point: Auto-sync after task create/update
  async syncTaskIfEligible(taskId: string, actingUserId: string): Promise<CalendarSyncResult> {
    if (!SYNC_ENABLED) {
      console.log('Auto-sync disabled - skipping task', taskId);
      return { ok: false, error: 'Sync disabled' };
    }

    try {
      const task = await storage.getTask(taskId);
      if (!task) {
        return { ok: false, error: 'Task not found' };
      }

      // Check if task has due_at
      if (!task.dueAt) {
        console.log('Auto-sync skipped - no due_at for task', taskId);
        return { ok: false, error: 'No due date' };
      }

      // Get user and check for calendar tokens
      const user = await storage.getUser(actingUserId);
      if (!user || !user.googleAccessToken) {
        console.log('Auto-sync skipped - no calendar tokens for user', actingUserId);
        return { ok: false, error: 'No calendar tokens' };
      }

      // Perform idempotent upsert
      return await this.upsertTaskEvent(taskId, actingUserId);
    } catch (error) {
      console.error('Auto-sync error for task', taskId, error);
      return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Idempotent & resilient upsert logic
  async upsertTaskEvent(taskId: string, userId: string): Promise<CalendarSyncResult> {
    try {
      const task = await storage.getTask(taskId);
      const user = await storage.getUser(userId);
      
      if (!task || !user || !task.dueAt) {
        return { ok: false, error: 'Invalid task/user/due_at' };
      }

      // Set up authenticated calendar client
      const calendar = await this.getAuthenticatedCalendar(user);
      if (!calendar) {
        return { ok: false, error: 'Calendar authentication failed' };
      }

      // Compute start/end times in user timezone
      const userTz = process.env.APP_TIMEZONE || "America/Vancouver";
      const start = DateTime.fromISO(task.dueAt.toISOString(), { zone: 'utc' }).setZone(userTz);
      const end = start.plus({ minutes: 60 });

      // Check if existing mapping exists
      const existingMapping = await this.getTaskEventMapping(taskId, userId);
      
      const eventPayload = {
        summary: task.title,
        description: this.buildEventDescription(task),
        start: {
          dateTime: start.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
          timeZone: userTz,
        },
        end: {
          dateTime: end.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
          timeZone: userTz,
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 60 },
          ],
        },
      };

      let eventId: string;
      let htmlLink: string;

      if (existingMapping) {
        // Try to update existing event
        try {
          const updateResponse = await calendar.events.update({
            calendarId: 'primary',
            eventId: existingMapping.eventId,
            requestBody: eventPayload,
          });

          eventId = updateResponse.data.id!;
          htmlLink = updateResponse.data.htmlLink!;
          
          // Update mapping timestamp
          await this.updateTaskEventMapping(existingMapping.id);
          
          console.log('Calendar event updated:', { taskId, userId, eventId });
        } catch (updateError: any) {
          // If 404 or invalid ID, create new event and replace mapping
          if (updateError.code === 404 || updateError.message?.includes('notFound')) {
            console.log('Event not found, creating new one:', { taskId, userId, oldEventId: existingMapping.eventId });
            
            const createResponse = await calendar.events.insert({
              calendarId: 'primary',
              requestBody: eventPayload,
            });

            eventId = createResponse.data.id!;
            htmlLink = createResponse.data.htmlLink!;

            // Replace mapping with new event ID
            await this.replaceTaskEventMapping(taskId, userId, eventId);
            
            console.log('Calendar event recreated:', { taskId, userId, eventId });
          } else {
            throw updateError;
          }
        }
      } else {
        // Create new event and mapping
        const createResponse = await calendar.events.insert({
          calendarId: 'primary',
          requestBody: eventPayload,
        });

        eventId = createResponse.data.id!;
        htmlLink = createResponse.data.htmlLink!;

        // Save new mapping
        await this.createTaskEventMapping(taskId, userId, eventId);
        
        console.log('Calendar event created:', { taskId, userId, eventId });
      }

      return {
        ok: true,
        eventId,
        htmlLink,
        startLocalISO: start.toISO(),
      };

    } catch (error) {
      console.error('Upsert error:', error);
      return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // Delete event and mapping on task deletion
  async deleteTaskEvent(taskId: string, userId: string): Promise<boolean> {
    try {
      const mapping = await this.getTaskEventMapping(taskId, userId);
      if (!mapping) {
        console.log('No mapping found for task deletion:', { taskId, userId });
        return true; // Already deleted or never existed
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return false;
      }

      const calendar = await this.getAuthenticatedCalendar(user);
      if (calendar) {
        try {
          await calendar.events.delete({
            calendarId: 'primary',
            eventId: mapping.eventId,
          });
          console.log('Calendar event deleted:', { taskId, userId, eventId: mapping.eventId });
        } catch (deleteError: any) {
          // If event doesn't exist, that's fine
          if (deleteError.code !== 404) {
            console.warn('Failed to delete calendar event:', deleteError);
          }
        }
      }

      // Remove mapping
      await this.deleteTaskEventMapping(taskId, userId);
      return true;
    } catch (error) {
      console.error('Delete event error:', error);
      return false;
    }
  }

  // Helper: Build event description
  private buildEventDescription(task: any): string {
    const parts = [];
    
    if (task.description) {
      parts.push(task.description);
    }
    
    parts.push(`Status: ${task.status || 'in_progress'}`);
    parts.push(`Priority: ${task.priority || 'medium'}`);
    
    if (task.googleDriveLink) {
      parts.push(`Drive Link: ${task.googleDriveLink}`);
    }
    
    // Add link back to task (placeholder for now)
    parts.push(`Task Link: /tasks/${task.id}`);
    
    return parts.join('\n\n');
  }

  // Helper: Get authenticated calendar client
  private async getAuthenticatedCalendar(user: any) {
    try {
      if (!this.oauth2Client) {
        return null;
      }

      // Set user tokens
      this.oauth2Client.setCredentials({
        access_token: user.googleAccessToken,
        refresh_token: user.googleRefreshToken,
        expiry_date: user.googleTokenExpiry?.getTime(),
      });

      // Check if token needs refresh
      if (user.googleTokenExpiry && new Date() >= user.googleTokenExpiry) {
        console.log('Refreshing expired token for user:', user.id);
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        
        // Update stored tokens
        await storage.updateUser(user.id, {
          googleAccessToken: credentials.access_token,
          googleRefreshToken: credentials.refresh_token,
          googleTokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        });

        this.oauth2Client.setCredentials(credentials);
      }

      return google.calendar({ version: 'v3', auth: this.oauth2Client });
    } catch (error) {
      console.error('Calendar auth error:', error);
      return null;
    }
  }

  // Database helpers for task-event mappings
  private async getTaskEventMapping(taskId: string, userId: string) {
    const result = await pool.query(
      'SELECT * FROM task_event_mappings WHERE task_id = $1 AND user_id = $2',
      [taskId, userId]
    );
    return result.rows[0] || null;
  }

  private async createTaskEventMapping(taskId: string, userId: string, eventId: string) {
    await pool.query(
      'INSERT INTO task_event_mappings (task_id, user_id, event_id) VALUES ($1, $2, $3)',
      [taskId, userId, eventId]
    );
  }

  private async updateTaskEventMapping(mappingId: string) {
    await pool.query(
      'UPDATE task_event_mappings SET updated_at = NOW() WHERE id = $1',
      [mappingId]
    );
  }

  private async replaceTaskEventMapping(taskId: string, userId: string, newEventId: string) {
    await pool.query(
      'UPDATE task_event_mappings SET event_id = $1, updated_at = NOW() WHERE task_id = $2 AND user_id = $3',
      [newEventId, taskId, userId]
    );
  }

  private async deleteTaskEventMapping(taskId: string, userId: string) {
    await pool.query(
      'DELETE FROM task_event_mappings WHERE task_id = $1 AND user_id = $2',
      [taskId, userId]
    );
  }

  // Debug methods
  async getEventFromGoogle(eventId: string, userId: string) {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return { found: false, error: 'User not found' };
      }

      const calendar = await this.getAuthenticatedCalendar(user);
      if (!calendar) {
        return { found: false, error: 'Calendar auth failed' };
      }

      const response = await calendar.events.get({
        calendarId: 'primary',
        eventId: eventId,
      });

      return {
        found: true,
        start: response.data.start,
        end: response.data.end,
        timeZone: response.data.start?.timeZone,
        htmlLink: response.data.htmlLink,
        summary: response.data.summary,
      };
    } catch (error: any) {
      return {
        found: false,
        error: error.message || 'Unknown error',
        code: error.code,
      };
    }
  }

  async getComputedPayload(taskId: string, userId: string) {
    try {
      const task = await storage.getTask(taskId);
      if (!task || !task.dueAt) {
        return { error: 'Task not found or no due_at' };
      }

      const userTz = process.env.APP_TIMEZONE || "America/Vancouver";
      const start = DateTime.fromISO(task.dueAt.toISOString(), { zone: 'utc' }).setZone(userTz);
      const end = start.plus({ minutes: 60 });

      return {
        taskId,
        userId,
        userTimezone: userTz,
        start: {
          dateTime: start.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
          timeZone: userTz,
          iso: start.toISO(),
        },
        end: {
          dateTime: end.toFormat("yyyy-MM-dd'T'HH:mm:ss"),
          timeZone: userTz,
          iso: end.toISO(),
        },
        summary: task.title,
        description: this.buildEventDescription(task),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

export const calendarAutoSync = new CalendarAutoSync();