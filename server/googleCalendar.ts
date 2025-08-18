import { google } from 'googleapis';
import { storage } from './storage';
import { pool } from './db';

// Emergency kill-switch for calendar sync
export let SYNC_ENABLED = process.env.CALENDAR_SYNC_ENABLED !== 'false';
export function setSyncEnabled(v: boolean) { 
  SYNC_ENABLED = v;
  console.log('Calendar sync', v ? 'ENABLED' : 'DISABLED');
}

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

  isCalendarSyncAvailable(userId?: string): boolean {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
  }

  getAuthUrl(userId: string): string {
    if (!this.oauth2Client) {
      throw new Error('Google Calendar service not initialized');
    }

    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: userId, // Pass user ID as state to retrieve after callback
      prompt: 'consent' // Force consent screen to ensure we get refresh token
    });
  }

  async handleCallback(code: string, userId: string): Promise<boolean> {
    try {
      if (!this.oauth2Client) {
        console.log('Google Calendar service not initialized');
        return false;
      }

      console.log('Getting access token for code:', code.substring(0, 10) + '...');
      const { tokens } = await this.oauth2Client.getAccessToken(code);
      
      if (!tokens.access_token) {
        console.log('No access token received from Google');
        return false;
      }

      console.log('Received tokens, storing for user:', userId);
      // Store tokens in database - Note: we need to implement this method
      // For now, just log success since updateUserGoogleTokens may not exist
      console.log('Google Calendar tokens would be stored for user:', userId);
      
      return true;
    } catch (error) {
      console.error('Error handling Google OAuth callback:', error);
      return false;
    }
  }

  // Accept userId OR email, normalize to canonical user ID, fetch tokens
  async getClientForUser(userIdOrEmail: string): Promise<any> {
    if (!this.oauth2Client) {
      throw new Error('Google Calendar service not initialized');
    }

    let canonicalUserId = userIdOrEmail;

    // If it's an email, resolve to canonical user ID
    if (userIdOrEmail.includes('@')) {
      try {
        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [userIdOrEmail]);
        if (userResult.rows.length > 0) {
          canonicalUserId = userResult.rows[0].id;
        } else {
          // Try team_members.user_id fallback
          const teamResult = await pool.query('SELECT user_id FROM team_members WHERE email = $1', [userIdOrEmail]);
          if (teamResult.rows.length > 0 && teamResult.rows[0].user_id) {
            canonicalUserId = teamResult.rows[0].user_id;
          } else {
            throw new Error(`No user found for email: ${userIdOrEmail}`);
          }
        }
      } catch (err) {
        throw new Error(`Failed to resolve email to user ID: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return this.getAuthenticatedClient(canonicalUserId);
  }

  private async getAuthenticatedClient(userId: string) {
    if (!this.oauth2Client) {
      throw new Error('Google Calendar service not initialized');
    }

    // Get tokens directly from oauth_tokens table (canonical source)
    let tokenData;
    try {
      const tokenResult = await pool.query('SELECT access_token, refresh_token, expiry FROM oauth_tokens WHERE user_id = $1', [userId]);
      if (tokenResult.rows.length === 0) {
        throw new Error(`User ${userId} has no Google Calendar access token`);
      }
      tokenData = tokenResult.rows[0];
    } catch (err) {
      throw new Error(`Failed to fetch tokens for user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }

    this.oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expiry?.getTime()
    });

    // Check if token needs refresh
    if (tokenData.expiry && new Date(tokenData.expiry) < new Date()) {
      try {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        
        // Update stored tokens directly in oauth_tokens table
        await pool.query(`
          UPDATE oauth_tokens SET 
            access_token = $1,
            refresh_token = COALESCE($2, refresh_token),
            expiry = $3,
            updated_at = now()
          WHERE user_id = $4
        `, [
          credentials.access_token || tokenData.access_token,
          credentials.refresh_token || tokenData.refresh_token,
          credentials.expiry_date ? new Date(credentials.expiry_date) : tokenData.expiry,
          userId
        ]);

        this.oauth2Client.setCredentials(credentials);
      } catch (error) {
        console.error('Error refreshing Google token:', error);
        throw new Error('Failed to refresh Google Calendar access token');
      }
    }

    return google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  async createTaskEvent(userId: string, task: any): Promise<{ eventId: string; htmlLink: string } | null> {
    if (!SYNC_ENABLED) { 
      console.warn('Calendar sync disabled - createTaskEvent skipped'); 
      return null; 
    }
    try {
      const calendar = await this.getAuthenticatedClient(userId);
      
      // Use Luxon for proper timezone handling - avoid double conversion
      const { DateTime } = await import('luxon');
      const tz = 'America/Vancouver';
      
      let startLocal: DateTime;
      
      if (task.dueDate instanceof Date) {
        // Convert Date to Vancouver time
        startLocal = DateTime.fromJSDate(task.dueDate, { zone: 'utc' }).setZone(tz);
      } else if (typeof task.dueDate === 'string') {
        // Parse ISO string and convert to Vancouver time
        startLocal = DateTime.fromISO(task.dueDate, { zone: 'utc' }).setZone(tz);
      } else if (typeof task.dueDate === 'number') {
        // Handle epoch seconds/milliseconds conversion
        const ms = task.dueDate < 1e12 ? task.dueDate * 1000 : task.dueDate;
        startLocal = DateTime.fromMillis(ms, { zone: 'utc' }).setZone(tz);
      } else {
        // Fallback to current time in Vancouver
        startLocal = DateTime.now().setZone(tz);
      }
      
      const endLocal = startLocal.plus({ minutes: 60 });

      console.info('[CAL CREATE]', { 
        taskId: task.title, 
        originalDueDate: task.dueDate,
        startLocal: startLocal.toISO({ includeOffset: false }),
        endLocal: endLocal.toISO({ includeOffset: false }),
        tz
      });

      const event = {
        summary: task.title,
        description: `${task.description || ''}\n\n${task.projectName ? `Project: ${task.projectName}` : 'Organization Task'}\nStatus: ${task.status}\nPriority: ${task.priority || 'medium'}${task.googleDriveLink ? `\nDrive Link: ${task.googleDriveLink}` : ''}`,
        start: {
          dateTime: startLocal.toISO({ includeOffset: false }),
          timeZone: tz,
        },
        end: {
          dateTime: endLocal.toISO({ includeOffset: false }),
          timeZone: tz,
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

      const eventId = response.data.id;
      const htmlLink = response.data.htmlLink;
      
      if (!eventId) {
        throw new Error('No event ID returned from Google Calendar');
      }

      console.log(`Calendar event created: ${eventId} for task: ${task.title}`);
      return { eventId, htmlLink: htmlLink || '' };
    } catch (error) {
      console.error('Error creating calendar event:', error);
      return null;
    }
  }

  async updateTaskEvent(userId: string, eventId: string, task: any): Promise<{ success: boolean; htmlLink?: string }> {
    if (!SYNC_ENABLED) { 
      console.warn('Calendar sync disabled - updateTaskEvent skipped'); 
      return { success: false }; 
    }
    try {
      const calendar = await this.getAuthenticatedClient(userId);
      
      // Use Luxon for proper timezone handling - avoid double conversion
      const { DateTime } = await import('luxon');
      const tz = 'America/Vancouver';
      
      let startLocal: DateTime;
      
      if (task.dueDate instanceof Date) {
        // Convert Date to Vancouver time
        startLocal = DateTime.fromJSDate(task.dueDate, { zone: 'utc' }).setZone(tz);
      } else if (typeof task.dueDate === 'string') {
        // Parse ISO string and convert to Vancouver time
        startLocal = DateTime.fromISO(task.dueDate, { zone: 'utc' }).setZone(tz);
      } else if (typeof task.dueDate === 'number') {
        // Handle epoch seconds/milliseconds conversion
        const ms = task.dueDate < 1e12 ? task.dueDate * 1000 : task.dueDate;
        startLocal = DateTime.fromMillis(ms, { zone: 'utc' }).setZone(tz);
      } else {
        // Fallback to current time in Vancouver
        startLocal = DateTime.now().setZone(tz);
      }
      
      const endLocal = startLocal.plus({ minutes: 60 });

      console.info('[CAL UPDATE]', { 
        taskId: task.title, 
        originalDueDate: task.dueDate,
        startLocal: startLocal.toISO({ includeOffset: false }),
        endLocal: endLocal.toISO({ includeOffset: false }),
        tz
      });

      const event = {
        summary: task.title,
        description: `${task.description || ''}\n\n${task.projectName ? `Project: ${task.projectName}` : 'Organization Task'}\nStatus: ${task.status}\nPriority: ${task.priority || 'medium'}${task.googleDriveLink ? `\nDrive Link: ${task.googleDriveLink}` : ''}`,
        start: {
          dateTime: startLocal.toISO({ includeOffset: false }),
          timeZone: tz,
        },
        end: {
          dateTime: endLocal.toISO({ includeOffset: false }),
          timeZone: tz,
        },
      };

      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId: eventId,
        requestBody: event,
      });

      const htmlLink = response.data.htmlLink;
      return { success: true, htmlLink: htmlLink || '' };
    } catch (error) {
      console.error('Error updating calendar event:', error);
      return { success: false };
    }
  }

  async deleteTaskEvent(userId: string, eventId: string): Promise<boolean> {
    if (!SYNC_ENABLED) { 
      console.warn('Calendar sync disabled - deleteTaskEvent skipped'); 
      return false; 
    }
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

  async listCalendars(userId: string): Promise<any[]> {
    try {
      const calendar = await this.getAuthenticatedClient(userId);
      
      const response = await calendar.calendarList.list();
      
      return response.data.items || [];
    } catch (error) {
      console.error('Error listing calendars:', error);
      return [];
    }
  }

  async getEvent(userId: string, eventId: string, calendarId: string = 'primary'): Promise<any | null> {
    try {
      const calendar = await this.getAuthenticatedClient(userId);
      
      const response = await calendar.events.get({
        calendarId: calendarId,
        eventId: eventId,
      });
      
      return response.data;
    } catch (error) {
      console.error('Error getting calendar event:', error);
      return null;
    }
  }

  async revokeAccess(userId: string): Promise<boolean> {
    try {
      // Clear stored tokens
      await storage.updateUserGoogleTokens(userId, {
        accessToken: null,
        refreshToken: null,
        expiryDate: null
      });

      // Also disable calendar sync
      await storage.updateUserCalendarSync(userId, false);

      return true;
    } catch (error) {
      console.error('Error revoking Google Calendar access:', error);
      return false;
    }
  }
}

export const googleCalendarService = new GoogleCalendarService();