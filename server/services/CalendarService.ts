import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { DateTime } from 'luxon';
import { pool } from '../db';

const ZONE = 'America/Vancouver';

interface TokenRecord {
  owner_type: string;
  owner_id: string;
  email: string;
  access_token: string;
  refresh_token: string;
  expiry_date: Date | null;
  scope: string;
}

interface CalendarMapping {
  id: string;
  task_id: string;
  user_id: string;
  event_id: string;
  calendar_id: string;
}

export class CalendarService {
  private static getOAuth2Client(): OAuth2Client {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  // Get OAuth client for a specific user with token resolution
  static async getOAuthClientFor(userId: string, teamMemberId?: string): Promise<{ client: OAuth2Client; email: string }> {
    let tokens: TokenRecord | null = null;
    
    // Try userId first
    if (userId) {
      const userResult = await pool.query(
        'SELECT * FROM google_tokens WHERE owner_type = $1 AND owner_id = $2',
        ['userId', userId]
      );
      tokens = userResult.rows[0] || null;
    }
    
    // Fallback to teamMemberId
    if (!tokens && teamMemberId) {
      const teamResult = await pool.query(
        'SELECT * FROM google_tokens WHERE owner_type = $1 AND owner_id = $2',
        ['teamMemberId', teamMemberId]
      );
      tokens = teamResult.rows[0] || null;
    }
    
    if (!tokens) {
      throw new Error(`Missing Google OAuth tokens for userId: ${userId}, teamMemberId: ${teamMemberId}`);
    }
    
    const oauth2Client = this.getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date?.getTime() || undefined
    });
    
    // Handle token refresh
    oauth2Client.on('tokens', async (newTokens) => {
      console.log('Refreshing OAuth tokens for', tokens?.email);
      await pool.query(
        'UPDATE google_tokens SET access_token = $1, expiry_date = $2, updated_at = CURRENT_TIMESTAMP WHERE owner_type = $3 AND owner_id = $4',
        [
          newTokens.access_token,
          newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
          tokens?.owner_type,
          tokens?.owner_id
        ]
      );
    });
    
    return { client: oauth2Client, email: tokens.email };
  }

  // Store tokens for both userId and teamMemberId
  static async storeTokens(userId: string, teamMemberId: string, email: string, tokens: any): Promise<void> {
    const expiryDate = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
    
    // Store by userId
    await pool.query(`
      INSERT INTO google_tokens (owner_type, owner_id, email, access_token, refresh_token, scope, token_type, expiry_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (owner_type, owner_id) DO UPDATE SET
        email = EXCLUDED.email,
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        scope = EXCLUDED.scope,
        token_type = EXCLUDED.token_type,
        expiry_date = EXCLUDED.expiry_date,
        updated_at = CURRENT_TIMESTAMP
    `, ['userId', userId, email, tokens.access_token, tokens.refresh_token, tokens.scope, tokens.token_type, expiryDate]);
    
    // Store by teamMemberId for compatibility
    await pool.query(`
      INSERT INTO google_tokens (owner_type, owner_id, email, access_token, refresh_token, scope, token_type, expiry_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (owner_type, owner_id) DO UPDATE SET
        email = EXCLUDED.email,
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        scope = EXCLUDED.scope,
        token_type = EXCLUDED.token_type,
        expiry_date = EXCLUDED.expiry_date,
        updated_at = CURRENT_TIMESTAMP
    `, ['teamMemberId', teamMemberId, email, tokens.access_token, tokens.refresh_token, tokens.scope, tokens.token_type, expiryDate]);
    
    console.log(`Stored Google tokens for userId: ${userId}, teamMemberId: ${teamMemberId}, email: ${email}`);
  }

  // Compute due_at timestamp using Luxon
  static computeDueAt(due_date: string, due_time?: string): string {
    if (due_date && due_time) {
      const dtLocal = DateTime.fromISO(`${due_date}T${due_time}`, { zone: ZONE });
      return dtLocal.toUTC().toISO()!;
    } else if (due_date) {
      return DateTime.fromISO(due_date, { zone: ZONE }).startOf('day').toUTC().toISO()!;
    }
    throw new Error('due_date is required');
  }

  // Build Google Calendar event payload
  static buildEventPayload(task: any): calendar_v3.Schema$Event {
    const { title, description, due_date, due_time } = task;
    const eventTitle = title || 'Untitled Task';
    
    if (due_time) {
      // Timed event
      const dtLocal = DateTime.fromISO(`${due_date}T${due_time}`, { zone: ZONE });
      const endTime = dtLocal.plus({ minutes: 60 });
      
      return {
        summary: eventTitle,
        description: description || '',
        start: {
          dateTime: dtLocal.toISO(),
          timeZone: ZONE
        },
        end: {
          dateTime: endTime.toISO(),
          timeZone: ZONE
        }
      };
    } else {
      // All-day event
      const endDate = DateTime.fromISO(due_date).plus({ days: 1 }).toISODate();
      
      return {
        summary: eventTitle,
        description: description || '',
        start: {
          date: due_date
        },
        end: {
          date: endDate
        }
      };
    }
  }

  // Upsert task event with idempotency
  static async upsertTaskEvent(taskId: string, userId: string, teamMemberId?: string): Promise<{ eventId: string; htmlLink: string; isUpdate: boolean }> {
    console.log(`[CALENDAR] Upserting event for taskId: ${taskId}, userId: ${userId}, teamMemberId: ${teamMemberId}`);
    
    // Get task data
    const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (taskResult.rows.length === 0) {
      throw new Error(`Task not found: ${taskId}`);
    }
    const task = taskResult.rows[0];
    
    // Get OAuth client
    const { client, email } = await this.getOAuthClientFor(userId, teamMemberId);
    const calendar = google.calendar({ version: 'v3', auth: client });
    
    // Check for existing mapping
    const mappingResult = await pool.query(
      'SELECT * FROM calendar_event_mappings WHERE task_id = $1 AND user_id = $2',
      [taskId, userId]
    );
    
    const eventPayload = this.buildEventPayload(task);
    
    if (mappingResult.rows.length > 0) {
      // Update existing event
      const mapping = mappingResult.rows[0];
      console.log(`[CALENDAR] Updating existing event: ${mapping.event_id}`);
      
      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId: mapping.event_id,
        requestBody: eventPayload
      });
      
      const event = response.data;
      console.log(`[CALENDAR] Event updated successfully: ${event.id}, start: ${event.start?.dateTime || event.start?.date}`);
      
      return {
        eventId: event.id!,
        htmlLink: event.htmlLink!,
        isUpdate: true
      };
    } else {
      // Create new event
      console.log(`[CALENDAR] Creating new event for task: ${task.title}`);
      
      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: eventPayload
      });
      
      const event = response.data;
      
      // Store mapping
      await pool.query(`
        INSERT INTO calendar_event_mappings (task_id, user_id, event_id, calendar_id)
        VALUES ($1, $2, $3, $4)
      `, [taskId, userId, event.id, 'primary']);
      
      console.log(`[CALENDAR] Event created successfully: ${event.id}, mapping stored`);
      
      return {
        eventId: event.id!,
        htmlLink: event.htmlLink!,
        isUpdate: false
      };
    }
  }

  // Delete task event and remove mapping
  static async deleteTaskEvent(taskId: string, userId: string): Promise<{ deleted: boolean }> {
    console.log(`[CALENDAR] Deleting event for taskId: ${taskId}, userId: ${userId}`);
    
    const mappingResult = await pool.query(
      'SELECT * FROM calendar_event_mappings WHERE task_id = $1 AND user_id = $2',
      [taskId, userId]
    );
    
    if (mappingResult.rows.length === 0) {
      console.log(`[CALENDAR] No mapping found for task: ${taskId}, user: ${userId}`);
      return { deleted: false };
    }
    
    const mapping = mappingResult.rows[0];
    
    try {
      // Get OAuth client
      const { client } = await this.getOAuthClientFor(userId);
      const calendar = google.calendar({ version: 'v3', auth: client });
      
      // Delete event
      await calendar.events.delete({
        calendarId: 'primary',
        eventId: mapping.event_id
      });
      
      console.log(`[CALENDAR] Event deleted: ${mapping.event_id}`);
    } catch (error: any) {
      console.warn(`[CALENDAR] Failed to delete event ${mapping.event_id}:`, error.message);
    }
    
    // Remove mapping
    await pool.query(
      'DELETE FROM calendar_event_mappings WHERE id = $1',
      [mapping.id]
    );
    
    console.log(`[CALENDAR] Mapping removed for task: ${taskId}`);
    return { deleted: true };
  }

  // Get event details
  static async getEventDetails(eventId: string, userId: string, teamMemberId?: string): Promise<any> {
    const { client } = await this.getOAuthClientFor(userId, teamMemberId);
    const calendar = google.calendar({ version: 'v3', auth: client });
    
    const response = await calendar.events.get({
      calendarId: 'primary',
      eventId
    });
    
    return response.data;
  }

  // Get mapping for task
  static async getTaskMapping(taskId: string, userId: string): Promise<CalendarMapping | null> {
    const result = await pool.query(
      'SELECT * FROM calendar_event_mappings WHERE task_id = $1 AND user_id = $2',
      [taskId, userId]
    );
    
    return result.rows[0] || null;
  }

  // Get all mappings for task (multiple users)
  static async getTaskMappings(taskId: string): Promise<CalendarMapping[]> {
    const result = await pool.query(
      'SELECT * FROM calendar_event_mappings WHERE task_id = $1',
      [taskId]
    );
    
    return result.rows;
  }
}