# Authentication System Package for Review

## Current Issue
- User is stuck in login loop after fixing session management
- React Query causing infinite `/api/auth/user` requests (hundreds per second)
- Need ChatGPT review to identify root cause and provide stable fix

## Task System Status
- **Session Management**: FIXED ✅
  - Proper cookie handling with 'sid' name
  - Session save/restore working correctly
  - Debug endpoints returning expected data
- **Google Calendar Integration**: WORKING ✅  
  - OAuth tokens available
  - Calendar sync fully operational
  - Self-test passing with task CRUD operations
- **Current Blocker**: Frontend authentication loop preventing normal usage

## Key Files for Review

### Authentication Core
1. `server/replitAuth.ts` - Main auth setup, session config, OIDC integration
2. `server/middleware/auth.ts` - Auth middleware and user resolution
3. `client/src/hooks/useAuth.ts` - Frontend auth hook (SUSPECTED ISSUE SOURCE)
4. `client/src/lib/queryClient.ts` - React Query configuration

### Task/Calendar Integration  
5. `server/routes.ts` - API routes including task management
6. `server/googleCalendar.ts` - Google Calendar service integration
7. `server/calendarAutoSync.ts` - Automatic calendar sync hooks
8. `shared/schema.ts` - Database schema and types

### Configuration
9. `server/index.ts` - App setup and middleware mounting
10. `vite.config.ts` - Frontend build configuration

## Specific Questions for ChatGPT

1. **Why is React Query causing infinite requests to `/api/auth/user`?**
   - Latest fix: Changed queryFn to return null on 401, added refetch controls
   - Still looping despite `retry: false` and refetch disabled

2. **Is the useAuth hook logic causing dependency loops?**
   - Two queries: `/auth/status` → `/api/auth/user` 
   - Conditional enabling based on session existence

3. **Are there race conditions in the authentication flow?**
   - Session exists but user query may be failing/retrying
   - Frontend may be re-mounting components

4. **Recommended fix for stable authentication without loops?**
   - Should queries be consolidated?
   - Better error handling strategy?
   - Different React Query configuration?

## Expected Outcome
- Stop infinite `/api/auth/user` requests
- Maintain working session management 
- Preserve Google Calendar integration
- Stable login/logout flow for user

## Priority
URGENT - User is frustrated with regression in working functionality