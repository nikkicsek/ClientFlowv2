import { google } from 'googleapis';
import { storage } from './storage';

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
        throw new Error('Google Calendar service not initialized');
      }

      const { tokens } = await this.oauth2Client.getAccessToken(code);
      
      if (!tokens.access_token) {
        throw new Error('No access token received');
      }

      // Store tokens in database
      await storage.updateUserGoogleTokens(userId, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null
      });

      return true;
    } catch (error) {
      console.error('Error handling Google OAuth callback:', error);
      return false;
    }
  }

  private async getAuthenticatedClient(userId: string) {
    if (!this.oauth2Client) {
      throw new Error('Google Calendar service not initialized');
    }

    const user = await storage.getUser(userId);
    if (!user?.googleAccessToken) {
      throw new Error('User has no Google Calendar access token');
    }

    this.oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
      expiry_date: user.googleTokenExpiry?.getTime()
    });

    // Check if token needs refresh
    if (user.googleTokenExpiry && user.googleTokenExpiry < new Date()) {
      try {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        
        // Update stored tokens
        await storage.updateUserGoogleTokens(userId, {
          accessToken: credentials.access_token || user.googleAccessToken,
          refreshToken: credentials.refresh_token || user.googleRefreshToken,
          expiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : user.googleTokenExpiry
        });

        this.oauth2Client.setCredentials(credentials);
      } catch (error) {
        console.error('Error refreshing Google token:', error);
        throw new Error('Failed to refresh Google Calendar access token');
      }
    }

    return google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  async createTaskEvent(userId: string, task: any): Promise<string | null> {
    try {
      const calendar = await this.getAuthenticatedClient(userId);
      
      // Handle PostgreSQL timestamp format properly
      let startDate;
      if (task.dueDate) {
        if (task.dueDate.includes(' ') && !task.dueDate.includes('T')) {
          // PostgreSQL format: "2025-08-29 13:00:00" - treat as local time
          startDate = new Date(task.dueDate.replace(' ', 'T'));
        } else {
          startDate = new Date(task.dueDate);
        }
      } else {
        startDate = new Date();
      }
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour duration

      const event = {
        summary: task.title,
        description: `${task.description || ''}\n\n${task.projectName ? `Project: ${task.projectName}` : 'Organization Task'}\nStatus: ${task.status}\nPriority: ${task.priority || 'medium'}${task.googleDriveLink ? `\nDrive Link: ${task.googleDriveLink}` : ''}`,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: 'America/Los_Angeles',
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'America/Los_Angeles',
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

  async updateTaskEvent(userId: string, eventId: string, task: any): Promise<boolean> {
    try {
      const calendar = await this.getAuthenticatedClient(userId);
      
      // Handle PostgreSQL timestamp format properly
      let startDate;
      if (task.dueDate) {
        if (task.dueDate.includes(' ') && !task.dueDate.includes('T')) {
          // PostgreSQL format: "2025-08-29 13:00:00" - treat as local time
          startDate = new Date(task.dueDate.replace(' ', 'T'));
        } else {
          startDate = new Date(task.dueDate);
        }
      } else {
        startDate = new Date();
      }
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

      const event = {
        summary: task.title,
        description: `${task.description || ''}\n\n${task.projectName ? `Project: ${task.projectName}` : 'Organization Task'}\nStatus: ${task.status}\nPriority: ${task.priority || 'medium'}${task.googleDriveLink ? `\nDrive Link: ${task.googleDriveLink}` : ''}`,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: 'America/Los_Angeles',
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'America/Los_Angeles',
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

  async deleteTaskEvent(userId: string, eventId: string): Promise<boolean> {
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