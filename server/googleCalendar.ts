import { google } from 'googleapis';
import { storage } from './storage';

export class GoogleCalendarService {
  private oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  // Generate OAuth2 authorization URL
  getAuthUrl(userId: string): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: userId, // Pass userId to identify user during callback
      prompt: 'consent' // Force consent to get refresh token
    });
  }

  // Handle OAuth2 callback and store tokens
  async handleCallback(code: string, userId: string): Promise<boolean> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      
      // Store tokens in database
      await storage.updateUserGoogleTokens(userId, {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null
      });

      return true;
    } catch (error) {
      console.error('Error handling Google OAuth callback:', error);
      return false;
    }
  }

  // Set up OAuth client with user's tokens
  private async setupOAuthClient(userId: string): Promise<boolean> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.googleAccessToken) {
        return false;
      }

      this.oauth2Client.setCredentials({
        access_token: user.googleAccessToken,
        refresh_token: user.googleRefreshToken,
        expiry_date: user.googleTokenExpiry?.getTime()
      });

      // Check if token needs refresh
      if (user.googleTokenExpiry && user.googleTokenExpiry < new Date()) {
        await this.refreshTokens(userId);
      }

      return true;
    } catch (error) {
      console.error('Error setting up OAuth client:', error);
      return false;
    }
  }

  // Refresh expired tokens
  private async refreshTokens(userId: string): Promise<void> {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      await storage.updateUserGoogleTokens(userId, {
        accessToken: credentials.access_token!,
        refreshToken: credentials.refresh_token || undefined,
        expiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : null
      });

      this.oauth2Client.setCredentials(credentials);
    } catch (error) {
      console.error('Error refreshing tokens:', error);
      throw error;
    }
  }

  // Create calendar event for a task
  async createTaskEvent(userId: string, task: any): Promise<string | null> {
    try {
      const isSetup = await this.setupOAuthClient(userId);
      if (!isSetup) {
        return null;
      }

      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const event = {
        summary: `Task: ${task.title}`,
        description: `${task.description || 'No description'}\n\nProject: ${task.projectName || 'Organization Task'}\nPriority: ${task.priority}\nStatus: ${task.status}`,
        start: {
          dateTime: task.dueDate ? new Date(task.dueDate).toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          timeZone: 'America/Vancouver',
        },
        end: {
          dateTime: task.dueDate 
            ? new Date(new Date(task.dueDate).getTime() + 60 * 60 * 1000).toISOString() // 1 hour duration
            : new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
          timeZone: 'America/Vancouver',
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

  // Update calendar event for a task
  async updateTaskEvent(userId: string, eventId: string, task: any): Promise<boolean> {
    try {
      const isSetup = await this.setupOAuthClient(userId);
      if (!isSetup) {
        return false;
      }

      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const event = {
        summary: `Task: ${task.title}`,
        description: `${task.description || 'No description'}\n\nProject: ${task.projectName || 'Organization Task'}\nPriority: ${task.priority}\nStatus: ${task.status}`,
        start: {
          dateTime: task.dueDate ? new Date(task.dueDate).toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          timeZone: 'America/Vancouver',
        },
        end: {
          dateTime: task.dueDate 
            ? new Date(new Date(task.dueDate).getTime() + 60 * 60 * 1000).toISOString()
            : new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
          timeZone: 'America/Vancouver',
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

  // Delete calendar event
  async deleteTaskEvent(userId: string, eventId: string): Promise<boolean> {
    try {
      const isSetup = await this.setupOAuthClient(userId);
      if (!isSetup) {
        return false;
      }

      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

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

  // Check if user has calendar sync enabled and tokens
  async isCalendarSyncAvailable(userId: string): Promise<boolean> {
    try {
      const user = await storage.getUser(userId);
      return !!(user?.calendarSyncEnabled && user?.googleAccessToken);
    } catch (error) {
      return false;
    }
  }

  // Revoke user's Google Calendar access
  async revokeAccess(userId: string): Promise<boolean> {
    try {
      const user = await storage.getUser(userId);
      if (user?.googleAccessToken) {
        this.oauth2Client.setCredentials({
          access_token: user.googleAccessToken
        });
        await this.oauth2Client.revokeCredentials();
      }

      // Clear tokens from database
      await storage.updateUserGoogleTokens(userId, {
        accessToken: null,
        refreshToken: null,
        expiryDate: null
      });

      await storage.updateUserCalendarSync(userId, false);

      return true;
    } catch (error) {
      console.error('Error revoking Google Calendar access:', error);
      return false;
    }
  }
}

export const googleCalendarService = new GoogleCalendarService();