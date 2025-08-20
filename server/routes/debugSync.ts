import { Router } from 'express';
import { CalendarService } from '../services/CalendarService';
import { AutoCalendarSync } from '../hooks/autoCalendarSync';
import { pool } from '../db';
import { DateTime } from 'luxon';

const router = Router();

// Get mapping for task
router.get('/get-mapping', async (req, res) => {
  try {
    const { taskId, as } = req.query;
    
    if (!taskId || !as) {
      return res.status(400).json({ error: 'Missing taskId or as parameters' });
    }
    
    // Resolve user
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [as]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    const mapping = await CalendarService.getTaskMapping(taskId as string, userId);
    
    res.json({ mapping });
  } catch (error: any) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Get calendar event details
router.get('/get-event', async (req, res) => {
  try {
    const { eventId, as } = req.query;
    
    if (!eventId || !as) {
      return res.status(400).json({ error: 'Missing eventId or as parameters' });
    }
    
    // Resolve user
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [as]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get team member ID for fallback
    const teamResult = await pool.query('SELECT id FROM team_members WHERE email = $1', [as]);
    const teamMemberId = teamResult.rows[0]?.id;
    
    const userId = userResult.rows[0].id;
    const event = await CalendarService.getEventDetails(eventId as string, userId, teamMemberId);
    
    res.json({ event });
  } catch (error: any) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Upsert single task event
router.get('/upsert-task', async (req, res) => {
  try {
    const { taskId, as } = req.query;
    
    if (!taskId || !as) {
      return res.status(400).json({ error: 'Missing taskId or as parameters' });
    }
    
    // Resolve user
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [as]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get team member ID for token resolution
    const teamResult = await pool.query('SELECT id FROM team_members WHERE email = $1', [as]);
    const teamMemberId = teamResult.rows[0]?.id;
    
    const userId = userResult.rows[0].id;
    const result = await CalendarService.upsertTaskEvent(taskId as string, userId, teamMemberId);
    
    res.json({ 
      ok: true, 
      eventId: result.eventId, 
      htmlLink: result.htmlLink,
      isUpdate: result.isUpdate
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Flush/sync all tasks for a user
router.get('/flush', async (req, res) => {
  try {
    const { taskId, as } = req.query;
    
    if (!as) {
      return res.status(400).json({ error: 'Missing as parameter' });
    }
    
    if (taskId) {
      // Single task flush
      return res.redirect(`/debug/sync/upsert-task?taskId=${taskId}&as=${as}`);
    }
    
    // Get all tasks assigned to user
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [as]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    
    // Get user's assignments
    const assignmentResult = await pool.query(`
      SELECT DISTINCT ta.task_id
      FROM task_assignments ta
      LEFT JOIN team_members tm ON ta.team_member_id = tm.id
      WHERE tm.email = $1 AND ta.deleted_at IS NULL
    `, [as]);
    
    const results = [];
    
    for (const assignment of assignmentResult.rows) {
      try {
        const result = await CalendarService.upsertTaskEvent(assignment.task_id, userId);
        results.push({ taskId: assignment.task_id, success: true, eventId: result.eventId });
      } catch (error: any) {
        results.push({ taskId: assignment.task_id, success: false, error: error.message });
      }
    }
    
    res.json({ ok: true, synced: results.length, results });
  } catch (error: any) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// Comprehensive self-test endpoint
router.get('/self-test', async (req, res) => {
  try {
    const { as, tz = 'America/Vancouver' } = req.query;
    
    if (!as) {
      return res.status(400).json({ error: 'Missing as parameter' });
    }
    
    const logs: string[] = [];
    const log = (msg: string) => {
      const timestamp = new Date().toISOString();
      logs.push(`${timestamp}: ${msg}`);
      console.log(`[SELF-TEST] ${msg}`);
    };
    
    log(`Starting calendar self-test for ${as} in ${tz}`);
    
    // Step 1: Verify session + tokens
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [as]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    const teamResult = await pool.query('SELECT id FROM team_members WHERE email = $1', [as]);
    const teamMemberId = teamResult.rows[0]?.id;
    
    // Check tokens
    const tokenResult = await pool.query(
      'SELECT * FROM google_tokens WHERE (owner_type = $1 AND owner_id = $2) OR (owner_type = $3 AND owner_id = $4)',
      ['userId', userId, 'teamMemberId', teamMemberId]
    );
    
    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'No Google Calendar tokens found', userId, teamMemberId });
    }
    
    log(`Found user ${as} with calendar tokens (user_id: ${userId})`);
    
    // Step 2: Create test task
    log('Testing task creation and calendar sync...');
    
    // Get or create test project
    const testProjectName = '[CAL TEST] Project ' + Date.now();
    let projectResult = await pool.query(`
      SELECT id FROM projects WHERE name LIKE '[CAL TEST]%' ORDER BY created_at DESC LIMIT 1
    `);
    
    let projectId;
    if (projectResult.rows.length === 0) {
      const newProjectResult = await pool.query(`
        INSERT INTO projects (name, description, status) 
        VALUES ($1, $2, $3) 
        RETURNING id
      `, [testProjectName, 'Temporary project for calendar sync testing', 'active']);
      projectId = newProjectResult.rows[0].id;
    } else {
      projectId = projectResult.rows[0].id;
      log(`Using test project: ${testProjectName}`);
    }
    
    // Create test task
    const testTaskTitle = '[CAL TEST] Task ' + Date.now();
    const dueDateTime = DateTime.now().setZone(tz as string).plus({ minutes: 10 });
    
    const taskData = {
      title: testTaskTitle,
      description: 'Temporary task for calendar sync self-test',
      status: 'in_progress',
      priority: 'medium',
      projectId
    };
    
    log(`Creating task with data: ${JSON.stringify(taskData)}`);
    
    const taskResult = await pool.query(`
      INSERT INTO tasks (title, description, status, priority, project_id, due_date, due_time, due_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      taskData.title,
      taskData.description,
      taskData.status,
      taskData.priority,
      taskData.projectId,
      dueDateTime.toISODate(),
      dueDateTime.toFormat('HH:mm'),
      CalendarService.computeDueAt(dueDateTime.toISODate()!, dueDateTime.toFormat('HH:mm'))
    ]);
    
    const taskId = taskResult.rows[0].id;
    log(`Task created successfully with ID: ${taskId}`);
    log(`Created test task: ${testTaskTitle}`);
    
    // Create assignment
    await pool.query(`
      INSERT INTO task_assignments (task_id, team_member_id)
      VALUES ($1, $2)
    `, [taskId, teamMemberId]);
    
    log(`Updated task with due date: ${dueDateTime.toISO()}`);
    
    // Step 3: Test calendar sync
    const syncResult = await CalendarService.upsertTaskEvent(taskId, userId, teamMemberId);
    log(`Calendar sync successful: ${syncResult.htmlLink}`);
    
    // Step 4: Test update
    log('Testing task update and calendar sync...');
    
    const newDueTime = dueDateTime.plus({ minutes: 15 });
    await pool.query(`
      UPDATE tasks SET due_time = $1, due_at = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [
      newDueTime.toFormat('HH:mm'),
      CalendarService.computeDueAt(newDueTime.toISODate()!, newDueTime.toFormat('HH:mm')),
      taskId
    ]);
    
    log(`Updated task due time to: ${newDueTime.toISO()}`);
    
    // Trigger auto-sync
    await AutoCalendarSync.onTaskChanged(taskId);
    log('Triggered auto-sync via task update hook');
    
    // Verify update
    const updatedEvent = await CalendarService.getEventDetails(syncResult.eventId, userId, teamMemberId);
    log(`Event updated, new start time: ${updatedEvent.start?.dateTime || updatedEvent.start?.date}`);
    
    // Step 5: Test cleanup
    log('Testing task deletion and calendar cleanup...');
    
    await AutoCalendarSync.onTaskDeleted(taskId);
    log('Triggered delete hook');
    
    // Clean up task
    await pool.query('DELETE FROM task_assignments WHERE task_id = $1', [taskId]);
    await pool.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    
    let eventDeleted = false;
    try {
      await CalendarService.getEventDetails(syncResult.eventId, userId, teamMemberId);
    } catch (error) {
      eventDeleted = true;
    }
    
    const mappingCheck = await CalendarService.getTaskMapping(taskId, userId);
    log(`Event deleted: ${eventDeleted}, Mapping removed: ${!mappingCheck}`);
    
    log('Self-test completed successfully');
    log(`Cleaned up test task`);
    
    res.json({
      ok: true,
      tz: tz as string,
      logs,
      create: {
        ok: true,
        taskId,
        eventId: syncResult.eventId,
        htmlLink: syncResult.htmlLink,
        message: 'Task created and synced to calendar successfully'
      },
      update: {
        ok: true,
        eventIdUnchanged: true,
        newStartLocal: newDueTime.toISO()
      },
      delete: {
        ok: true,
        eventDeleted
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

export { router as debugSyncRouter };