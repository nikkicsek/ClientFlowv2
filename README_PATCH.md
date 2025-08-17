# Task Patch Kit (Per-Assignee Calendar Sync + OAuth Tokens)

This kit gives you a **safe, minimal set of files** you can drop into your Replit app to:
- Store Google OAuth tokens per user
- Create **per-assignee** Google Calendar events (not task-level)
- Wire calendar sync into task/assignment CRUD
- Avoid secrets in code (use Replit Secrets / env)

> Works with an Express/TypeScript backend using `googleapis` and Postgres (or compatible). Adjust paths if your folders differ.

---

## 1) Files in this kit

- `migrations/001_calendar_patch.sql` – DB changes (per-assignee event id + OAuth tokens table)
- `server/calendar/GoogleCalendarService.ts` – calendar service (create/update/delete + reconcile)
- `server/oauth/googleRoutes.ts` – `/oauth/google/connect` and `/oauth/google/callback`
- `server/hooks/taskCalendarHooks.ts` – helpers to call after task/assignment CRUD
- `.env.example` – the variables you set in Replit Secrets

## 2) Apply the DB migration

**Option A: psql / direct SQL**  
Copy/paste and run the SQL in your DB (or use your DB tool).

**Option B: manual**  
Add the columns/tables to your schema (Drizzle, Prisma, etc.) with equivalent types.

## 3) Add the service + routes

- Copy `server/calendar/GoogleCalendarService.ts` into your project (adjust imports).
- Copy `server/oauth/googleRoutes.ts` and register the router in your server:
  ```ts
  import { googleRouter } from './server/oauth/googleRoutes';
  app.use(googleRouter);
  ```

## 4) Hook calendar into CRUD

Where you **create/update/delete** tasks and **create/delete** assignments, call the helpers in `server/hooks/taskCalendarHooks.ts`:

```ts
import { onTaskCreatedOrUpdated, onTaskDeleted, onAssignmentCreated, onAssignmentDeleted } from './server/hooks/taskCalendarHooks';

// Example after creating a task:
const task = await storage.createTask(taskData);
await onTaskCreatedOrUpdated(task.id);

// Example after updating a task:
const task = await storage.updateTask(id, updates);
await onTaskCreatedOrUpdated(task.id);

// Example after deleting a task:
await storage.deleteTask(id);
await onTaskDeleted(id);

// Example after creating an assignment:
const assignment = await storage.createTaskAssignment(data);
await onAssignmentCreated(assignment.id);

// Example after deleting an assignment:
await storage.deleteTaskAssignment(id);
await onAssignmentDeleted(id);
```

**Why this matters:** Your current code does not call the calendar service during CRUD, so no events are created/updated/removed (see your export).

## 5) Secrets in Replit (no code changes)

In Replit → **Secrets**, set:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI` (e.g., `https://<your-repl-domain>/oauth/google/callback`)

## 6) Quick smoke test

1. Start the app and visit `GET /oauth/google/connect` in your browser → complete Google consent.
2. Create a task with a due date/time and **assign** it to yourself.
3. Check your Google Calendar for an event named like the task.
4. Update the task title/time → event updates.
5. Remove your assignment → event deletes.

If anything fails, check server logs for Google API errors (`401 invalid_grant`, `403 insufficientPermissions`, etc).

## 7) Notes
- Default duration is 60 minutes if you only provide a single timestamp.
- Timezone uses the user’s record when available (fallback to America/Vancouver).
- Events are stored **per assignment** (not on the task) so multi-assignee tasks work.

---

Made for Nikki — 2025-08-17.
