import { google } from 'googleapis';
import { storage } from '../storage'; // adjust import path
import { Pool } from 'pg'; // or your DB client

// Minimal token store using oauth_tokens table
async function getUserTokens(userId: string, db: Pool) {
  const { rows } = await db.query('SELECT * FROM oauth_tokens WHERE user_id=$1', [userId]);
  return rows[0];
}
async function saveUserTokens(userId: string, tokens: any, scopes: string, db: Pool) {
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

export class GoogleCalendarService {
  private db: Pool;

  constructor(db: Pool) {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
      console.warn('Google Calendar disabled - missing GOOGLE_* env');
    }
    this.db = db;
  }

  private async oauthClientFor(userId: string) {
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    const tokenRow = await getUserTokens(userId, this.db);
    if (!tokenRow) throw new Error('No tokens for user; connect Google in Calendar Settings.');
    client.setCredentials({
      access_token: tokenRow.access_token,
      refresh_token: tokenRow.refresh_token,
      expiry_date: new Date(tokenRow.expiry).getTime(),
    });
    client.on('tokens', async (tokens) => {
      // Google may rotate tokens; save fresh ones
      await saveUserTokens(userId, tokens, tokenRow.scopes, this.db);
    });
    return google.calendar({ version: 'v3', auth: client });
  }

  private getUserTimezone(user: any): string {
    return user?.timezone || 'America/Vancouver';
  }

  private computeTimes(task: any): { startISO: string, endISO: string } {
    // Accepts ISO strings or Date-able values; default 60min
    const start = task.dueDate ? new Date(task.dueDate) : new Date();
    const end = new Date(start.getTime() + (task.durationMin ? task.durationMin : 60) * 60 * 1000);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }

  async upsertForAssignment(assignmentId: string) {
    // load assignment + task + user
    const assignment = await storage.getTaskAssignmentById(assignmentId);
    if (!assignment) throw new Error('assignment not found');

    const task = await storage.getTask(assignment.taskId);
    const user = await storage.getUserByTeamMemberId(assignment.teamMemberId); // resolve the "user" record for OAuth
    
    const calendar = await this.oauthClientFor(user.id);
    const tz = this.getUserTimezone(user);
    const { startISO, endISO } = this.computeTimes(task);

    const eventBody: any = {
      summary: task.title,
      description: (task.description || '') + (task.googleDriveLink ? `\n\nDrive: ${task.googleDriveLink}` : ''),
      start: { dateTime: startISO, timeZone: tz },
      end:   { dateTime: endISO,   timeZone: tz },
      reminders: { useDefault: true },
    };

    const calendarId = assignment.calendarId || 'primary';
    if (!assignment.calendarEventId) {
      const res = await calendar.events.insert({ calendarId, requestBody: eventBody });
      const eventId = res?.data?.id;
      if (eventId) await storage.setAssignmentCalendarEventId(assignmentId, eventId);
      return eventId;
    } else {
      await calendar.events.update({
        calendarId,
        eventId: assignment.calendarEventId,
        requestBody: eventBody,
      });
      return assignment.calendarEventId;
    }
  }

  async deleteForAssignment(assignmentId: string) {
    const assignment = await storage.getTaskAssignmentById(assignmentId);
    if (!assignment?.calendarEventId) return;
    const user = await storage.getUserByTeamMemberId(assignment.teamMemberId);
    const calendar = await this.oauthClientFor(user.id);
    const calendarId = assignment.calendarId || 'primary';
    await calendar.events.delete({ calendarId, eventId: assignment.calendarEventId });
    await storage.clearAssignmentCalendarEventId(assignmentId);
  }

  // Reconcile a task (create/update for all assignees)
  async reconcileTask(taskId: string) {
    const assignments = await storage.getTaskAssignments(taskId);
    for (const a of assignments) {
      try { await this.upsertForAssignment(a.id); } catch (e) { console.error('Calendar upsert error', e); }
    }
  }
}
