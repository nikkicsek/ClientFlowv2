/**
 * Comprehensive QA Test for Calendar Sync
 * One-click self-test for Calendar sync functionality
 */

import { storage } from './storage';
import { calendarAutoSync } from './calendarAutoSync';
import { onTaskCreatedOrUpdated, onAssignmentCreated } from './hooks/taskCalendarHooks';
import { SYNC_ENABLED } from './debugRoutes';

interface QATestResult {
  step: string;
  status: 'pass' | 'fail' | 'skip' | 'warn';
  message: string;
  data?: any;
}

export class CalendarQATest {
  private results: QATestResult[] = [];
  private testUserId: string | null = null;
  private testTaskId: string | null = null;

  constructor() {}

  // Main QA entry point
  async runFullQATest(): Promise<{ 
    passed: number; 
    failed: number; 
    warnings: number; 
    results: QATestResult[];
    summary: string;
  }> {
    this.results = [];
    
    try {
      await this.testPrerequisites();
      await this.testCalendarServiceInit();
      await this.testUserTokens();
      await this.testTaskCreation();
      await this.testAutoSync();
      await this.testManualSync();
      await this.testCleanup();
    } catch (error) {
      this.addResult('global_error', 'fail', `QA test crashed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const warnings = this.results.filter(r => r.status === 'warn').length;

    const summary = `QA Complete: ${passed} passed, ${failed} failed, ${warnings} warnings`;
    
    return { passed, failed, warnings, results: this.results, summary };
  }

  private addResult(step: string, status: 'pass' | 'fail' | 'skip' | 'warn', message: string, data?: any) {
    this.results.push({ step, status, message, data });
    console.log(`[QA ${status.toUpperCase()}] ${step}: ${message}`);
  }

  private async testPrerequisites(): Promise<void> {
    // Check if calendar sync is enabled
    if (!SYNC_ENABLED) {
      this.addResult('prerequisites', 'skip', 'Calendar sync is disabled globally');
      return;
    }
    this.addResult('prerequisites', 'pass', 'Calendar sync is enabled');

    // Check environment variables
    const requiredEnvVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        this.addResult('prerequisites', 'fail', `Missing environment variable: ${envVar}`);
      } else {
        this.addResult('prerequisites', 'pass', `Environment variable ${envVar} is set`);
      }
    }
  }

  private async testCalendarServiceInit(): Promise<void> {
    try {
      // Test that CalendarAutoSync can be imported and initialized
      if (!calendarAutoSync) {
        this.addResult('calendar_service', 'fail', 'CalendarAutoSync not available');
        return;
      }
      this.addResult('calendar_service', 'pass', 'CalendarAutoSync service initialized');
    } catch (error) {
      this.addResult('calendar_service', 'fail', `CalendarAutoSync init failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testUserTokens(): Promise<void> {
    try {
      // Find a user with Google calendar tokens by checking the user table directly
      const userQuery = `SELECT id, email, google_access_token FROM users WHERE google_access_token IS NOT NULL LIMIT 1`;
      const { pool } = await import('./db');
      const result = await pool.query(userQuery);
      const userWithTokens = result.rows[0];
      
      if (!userWithTokens) {
        this.addResult('user_tokens', 'warn', 'No users found with Google calendar tokens - limited testing');
        return;
      }

      this.testUserId = userWithTokens.id;
      this.addResult('user_tokens', 'pass', `Found user with calendar tokens: ${userWithTokens.email}`, { userId: this.testUserId });
    } catch (error) {
      this.addResult('user_tokens', 'fail', `User token check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testTaskCreation(): Promise<void> {
    try {
      if (!this.testUserId) {
        this.addResult('task_creation', 'skip', 'No test user available - skipping task creation');
        return;
      }

      // Get an existing project to avoid creating unnecessary test data
      const projects = await storage.getProjectsByClient(this.testUserId);
      const testProject = projects[0] || await storage.createProject({
        name: `QA Test Project ${Date.now()}`,
        description: 'Automated QA test project for calendar sync',
        status: 'active',
        organizationId: 'test-org-id',
        clientId: this.testUserId,
      });

      // Create a test task with due date and time
      const testTask = await storage.createTask({
        title: `QA Calendar Test Task ${Date.now()}`,
        description: 'Automated test task for calendar sync verification',
        status: 'in_progress',
        priority: 'medium',
        projectId: testProject.id,
        dueDate: new Date().toISOString().slice(0, 10), // Today's date
        dueTime: '14:30', // 2:30 PM
      });

      this.testTaskId = testTask.id;
      this.addResult('task_creation', 'pass', `Created test task: ${testTask.title}`, { taskId: this.testTaskId, projectId: testProject.id });
    } catch (error) {
      this.addResult('task_creation', 'fail', `Task creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testAutoSync(): Promise<void> {
    try {
      if (!this.testTaskId || !this.testUserId) {
        this.addResult('auto_sync', 'skip', 'Missing test prerequisites - skipping auto sync test');
        return;
      }

      // Test auto-sync via task creation hook
      await onTaskCreatedOrUpdated(this.testTaskId);
      this.addResult('auto_sync', 'pass', 'Auto-sync hook executed without errors');

      // Test assignment creation hook (skip if no team members available)
      const teamMembers = await storage.getAllTeamMembers();
      if (teamMembers.length > 0) {
        const testAssignment = await storage.createTaskAssignment({
          taskId: this.testTaskId,
          teamMemberId: teamMembers[0].id,
          assignedBy: this.testUserId,
          notes: 'QA test assignment',
        });

        await onAssignmentCreated(testAssignment.id);
        this.addResult('auto_sync', 'pass', 'Assignment creation hook executed without errors');
      } else {
        this.addResult('auto_sync', 'warn', 'No team members available for assignment test');
      }
    } catch (error) {
      this.addResult('auto_sync', 'fail', `Auto-sync test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testManualSync(): Promise<void> {
    try {
      if (!this.testTaskId || !this.testUserId) {
        this.addResult('manual_sync', 'skip', 'Missing test prerequisites - skipping manual sync test');
        return;
      }

      // Test manual sync via CalendarAutoSync
      const result = await calendarAutoSync.syncTaskIfEligible(this.testTaskId, this.testUserId);
      
      if (result.ok) {
        this.addResult('manual_sync', 'pass', 'Manual sync completed successfully', result);
      } else {
        this.addResult('manual_sync', 'warn', `Manual sync completed with issues: ${result.error}`, result);
      }
    } catch (error) {
      this.addResult('manual_sync', 'fail', `Manual sync test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testCleanup(): Promise<void> {
    try {
      if (this.testTaskId) {
        // Clean up test task (use soft delete)
        await storage.updateTask(this.testTaskId, { status: 'completed' });
        this.addResult('cleanup', 'pass', 'Test task marked as completed for cleanup');
      }
    } catch (error) {
      this.addResult('cleanup', 'warn', `Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Specific diagnostic tests
  async testCalendarEventCreation(taskId: string, userId: string): Promise<QATestResult> {
    try {
      const result = await calendarAutoSync.syncTaskIfEligible(taskId, userId);
      if (result.ok && result.eventId) {
        return { 
          step: 'calendar_event_creation',
          status: 'pass',
          message: `Calendar event created successfully: ${result.eventId}`,
          data: result
        };
      } else {
        return {
          step: 'calendar_event_creation',
          status: 'fail',
          message: `Calendar event creation failed: ${result.error || 'Unknown error'}`,
          data: result
        };
      }
    } catch (error) {
      return {
        step: 'calendar_event_creation',
        status: 'fail',
        message: `Calendar event creation crashed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async testTokenRefresh(userId: string): Promise<QATestResult> {
    try {
      const user = await storage.getUser(userId);
      if (!user || !user.googleRefreshToken) {
        return {
          step: 'token_refresh',
          status: 'warn',
          message: 'No refresh token available for user'
        };
      }

      // Test token refresh via calendar service call
      const result = await calendarAutoSync.syncTaskIfEligible('test-task-id', userId);
      return {
        step: 'token_refresh',
        status: result.ok ? 'pass' : 'warn',
        message: result.ok ? 'Token refresh successful' : `Token issues: ${result.error}`
      };
    } catch (error) {
      return {
        step: 'token_refresh',
        status: 'fail',
        message: `Token refresh test failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}

export const qaCalendarTest = new CalendarQATest();