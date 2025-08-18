import { Express } from 'express';
import { DateTime } from 'luxon';
import { pool } from './db';

// Simple test route for calendar upsert
export function registerSimpleTestRoute(app: Express) {
  app.get('/debug/test-upsert', async (req, res) => {
    const taskId = req.query.taskId as string;
    const impersonateAs = req.query.as as string;
    
    try {
      console.log(`[SIMPLE] Testing upsert for task ${taskId}, user ${impersonateAs}`);
      
      // 1. Load task
      const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
      if (taskResult.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      const task = taskResult.rows[0];
      
      // 2. Load task assignment
      const assignmentResult = await pool.query('SELECT team_member_id FROM task_assignments WHERE task_id = $1', [taskId]);
      if (assignmentResult.rows.length === 0) {
        return res.status(400).json({ error: 'Task has no assignment' });
      }
      const teamMemberId = assignmentResult.rows[0].team_member_id;
      
      // 3. Load team member
      const teamMemberResult = await pool.query('SELECT * FROM team_members WHERE id = $1', [teamMemberId]);
      if (teamMemberResult.rows.length === 0) {
        return res.status(400).json({ error: 'Team member not found' });
      }
      const teamMember = teamMemberResult.rows[0];
      
      // 4. Load user by email match
      const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [teamMember.email]);
      if (userResult.rows.length === 0) {
        return res.status(400).json({ error: 'User not found for team member email', teamMemberEmail: teamMember.email });
      }
      const user = userResult.rows[0];
      
      // 5. Load OAuth tokens
      const tokenResult = await pool.query('SELECT * FROM oauth_tokens WHERE user_id = $1', [user.id]);
      if (tokenResult.rows.length === 0) {
        return res.status(400).json({ error: 'No OAuth tokens for user', userId: user.id });
      }
      
      // 6. Check for existing event mapping
      const eventResult = await pool.query('SELECT event_id FROM task_google_events WHERE task_id = $1 AND user_id = $2', [taskId, user.id]);
      
      res.json({
        ok: true,
        task: { id: task.id, title: task.title, due_at: task.due_at },
        teamMember: { id: teamMember.id, email: teamMember.email },
        user: { id: user.id, email: user.email },
        hasTokens: true,
        existingEvent: eventResult.rows.length > 0 ? eventResult.rows[0].event_id : null
      });
      
    } catch (error: any) {
      console.error('[SIMPLE] Test failed:', error);
      res.status(500).json({ error: error.message });
    }
  });
}