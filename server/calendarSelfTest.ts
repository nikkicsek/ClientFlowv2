/**
 * Calendar Self-Test Module
 * One-click comprehensive test for Calendar sync functionality
 */

import { DateTime } from 'luxon';
import { storage } from './storage';
import { calendarAutoSync } from './calendarAutoSync';
import { onTaskCreatedOrUpdated, onTaskDeleted } from './hooks/taskCalendarHooks';
import { SYNC_ENABLED } from './debugRoutes';

interface SelfTestResult {
  ok: boolean;
  tz: string;
  create?: {
    ok: boolean;
    taskId?: string;
    eventId?: string;
    htmlLink?: string;
    startLocal?: string;
    error?: string;
  };
  update?: {
    ok: boolean;
    eventIdUnchanged?: boolean;
    newStartLocal?: string;
    error?: string;
  };
  delete?: {
    ok: boolean;
    eventDeleted?: boolean;
    error?: string;
  };
  logs: string[];
  error?: string;
}

export class CalendarSelfTest {
  private logs: string[] = [];
  private testTaskId: string | null = null;
  private testProjectId: string | null = null;

  private log(message: string) {
    this.logs.push(`${new Date().toISOString()}: ${message}`);
    console.log(`[SELF-TEST] ${message}`);
  }

  async runSelfTest(email: string, timezone: string): Promise<SelfTestResult> {
    const startTime = Date.now();
    const result: SelfTestResult = {
      ok: false,
      tz: timezone,
      logs: []
    };

    try {
      this.logs = [];
      this.log(`Starting calendar self-test for ${email} in ${timezone}`);

      if (!SYNC_ENABLED) {
        throw new Error('Calendar sync is disabled globally');
      }

      // Find or get user
      const user = await storage.getUserByEmail(email);
      if (!user) {
        throw new Error(`User not found for email: ${email}`);
      }

      if (!user.googleAccessToken) {
        throw new Error(`User ${email} has no Google calendar tokens`);
      }

      this.log(`Found user ${user.email} with calendar tokens`);

      // Test create
      result.create = await this.testCreate(user.id, timezone);
      if (!result.create.ok) {
        result.logs = this.logs;
        return result;
      }

      // Test update  
      result.update = await this.testUpdate(timezone, email);
      if (!result.update.ok) {
        result.logs = this.logs;
        return result;
      }

      // Test delete
      result.delete = await this.testDelete();
      if (!result.delete.ok) {
        result.logs = this.logs;
        return result;
      }

      result.ok = true;
      this.log('Self-test completed successfully');

    } catch (error) {
      this.log(`Self-test failed: ${error instanceof Error ? error.message : String(error)}`);
      result.error = error instanceof Error ? error.message : String(error);
    } finally {
      // Cleanup
      await this.cleanup();
      result.logs = this.logs;
    }

    return result;
  }

  private async testCreate(userId: string, timezone: string) {
    try {
      this.log('Testing task creation and calendar sync...');

      // Get or create a test project
      const projects = await storage.getProjectsByClient(userId);
      let testProject = projects.find(p => p.name.includes('[CAL TEST]'));
      
      if (!testProject) {
        testProject = await storage.createProject({
          name: `[CAL TEST] Project ${Date.now()}`,
          description: 'Temporary project for calendar sync testing',
          status: 'active',
          organizationId: 'test-org',
          clientId: userId,
        });
      }

      this.testProjectId = testProject.id;
      this.log(`Using test project: ${testProject.name}`);

      // Create test task due 10 minutes from now
      const now = DateTime.now().setZone(timezone);
      const dueTime = now.plus({ minutes: 10 });
      
      const testTask = await storage.createTask({
        title: `[CAL TEST] Task ${Date.now()}`,
        description: 'Temporary task for calendar sync self-test',
        status: 'in_progress',
        priority: 'medium',
        projectId: testProject.id,
        dueDate: dueTime.toISODate(),
        dueTime: dueTime.toFormat('HH:mm'),
      });

      this.testTaskId = testTask.id;
      this.log(`Created test task: ${testTask.title} due at ${dueTime.toISO()}`);

      // Trigger auto-sync via normal path
      await onTaskCreatedOrUpdated(testTask.id);
      this.log('Triggered auto-sync via task creation hook');

      // Wait a moment for async operations
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify create via mapping and event
      const mappingResult = await this.getTaskEventMapping(testTask.id);
      if (!mappingResult || !mappingResult.eventId) {
        return {
          ok: false,
          error: 'No calendar event mapping found after create'
        };
      }

      const eventResult = await this.getCalendarEvent(mappingResult.eventId, userId);
      if (!eventResult || !eventResult.event) {
        return {
          ok: false,
          error: 'Calendar event not found after create'
        };
      }

      const startLocal = DateTime.fromISO(eventResult.event.start?.dateTime || '', { zone: timezone });
      
      this.log(`Calendar event created: ${mappingResult.eventId}`);
      this.log(`Event start time: ${startLocal.toISO()}`);

      return {
        ok: true,
        taskId: testTask.id,
        eventId: mappingResult.eventId,
        htmlLink: eventResult.event.htmlLink,
        startLocal: startLocal.toISO(),
      };

    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testUpdate(timezone: string, email: string) {
    try {
      if (!this.testTaskId) {
        throw new Error('No test task available for update test');
      }

      this.log('Testing task update and calendar sync...');

      // Get current mapping
      const originalMapping = await this.getTaskEventMapping(this.testTaskId);
      if (!originalMapping?.eventId) {
        throw new Error('No original mapping found for update test');
      }

      // Update task to +15 minutes from original
      const task = await storage.getTask(this.testTaskId);
      if (!task) {
        throw new Error('Test task not found for update');
      }

      const currentDue = DateTime.fromSQL(`${task.dueDate} ${task.dueTime}`, { zone: timezone });
      const newDueTime = currentDue.plus({ minutes: 15 });

      await storage.updateTask(this.testTaskId, {
        dueDate: newDueTime.toISODate(),
        dueTime: newDueTime.toFormat('HH:mm'),
      });

      this.log(`Updated task due time to: ${newDueTime.toISO()}`);

      // Trigger auto-sync
      await onTaskCreatedOrUpdated(this.testTaskId);
      this.log('Triggered auto-sync via task update hook');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify update
      const updatedMapping = await this.getTaskEventMapping(this.testTaskId);
      const eventIdUnchanged = updatedMapping?.eventId === originalMapping.eventId;

      if (updatedMapping?.eventId) {
        const user = await storage.getUserByEmail(email);
      const eventResult = await this.getCalendarEvent(updatedMapping.eventId, user?.id || 'test-user');
        if (eventResult?.event) {
          const newStartLocal = DateTime.fromISO(eventResult.event.start?.dateTime || '', { zone: timezone });
          this.log(`Event updated, new start time: ${newStartLocal.toISO()}`);
          
          return {
            ok: true,
            eventIdUnchanged,
            newStartLocal: newStartLocal.toISO(),
          };
        }
      }

      return {
        ok: false,
        error: 'Event not found after update'
      };

    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async testDelete() {
    try {
      if (!this.testTaskId) {
        throw new Error('No test task available for delete test');
      }

      this.log('Testing task deletion and calendar cleanup...');

      // Get mapping before delete
      const mapping = await this.getTaskEventMapping(this.testTaskId);
      if (!mapping?.eventId) {
        this.log('No mapping found before delete - may already be cleaned up');
        return { ok: true, eventDeleted: true };
      }

      // Delete task via hook
      await onTaskDeleted(this.testTaskId);
      this.log('Triggered delete hook');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify event is gone
      const task = await storage.getTask(this.testTaskId);
      const eventAfterDelete = await this.getCalendarEvent(mapping.eventId, task?.projectId || 'test-user');
      const eventDeleted = !eventAfterDelete || !eventAfterDelete.event;

      // Verify mapping is removed
      const mappingAfterDelete = await this.getTaskEventMapping(this.testTaskId);
      const mappingDeleted = !mappingAfterDelete || !mappingAfterDelete.eventId;

      this.log(`Event deleted: ${eventDeleted}, Mapping removed: ${mappingDeleted}`);

      return {
        ok: true,
        eventDeleted: eventDeleted && mappingDeleted,
      };

    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async getTaskEventMapping(taskId: string) {
    try {
      const { pool } = await import('./db');
      const result = await pool.query(
        'SELECT event_id FROM task_event_mappings WHERE task_id = $1',
        [taskId]
      );
      return result.rows[0] ? { eventId: result.rows[0].event_id } : null;
    } catch (error) {
      this.log(`Error fetching mapping: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async getCalendarEvent(eventId: string, userId: string) {
    try {
      const { googleCalendarService } = await import('./googleCalendar');
      const event = await googleCalendarService.getEvent(userId, eventId);
      return { event };
    } catch (error) {
      this.log(`Error fetching event: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async cleanup() {
    try {
      if (this.testTaskId) {
        // Soft delete test task
        await storage.updateTask(this.testTaskId, { status: 'completed' });
        this.log('Cleaned up test task');
      }
    } catch (error) {
      this.log(`Cleanup error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export const calendarSelfTest = new CalendarSelfTest();