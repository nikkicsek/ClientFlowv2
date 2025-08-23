# replit.md

## Overview
AgencyPro is a customizable client-facing project management dashboard web application for marketing agencies. It provides clients with a comprehensive view of their active projects, task progress, analytics, file sharing, and communication capabilities. The platform aims to offer features similar to Agency Analytics, focusing on client reporting and project transparency.

## User Preferences
Preferred communication style: Simple, everyday language.
UI preferences: Clean, functional interfaces without promotional or instructional content. Direct organization lists instead of benefits information. Streamlined navigation - eliminate redundant buttons and modal overlays in favor of direct tab access.

## System Architecture
AgencyPro is a full-stack TypeScript application featuring a React frontend and an Express backend.

### Frontend Architecture
- **Framework**: React with TypeScript (Vite build tool)
- **UI/UX**: Radix UI and shadcn/ui for consistent, accessible design, styled with Tailwind CSS (CSS variables for theming, light/dark modes).
- **State Management**: TanStack Query for server state and caching.
- **Routing**: Wouter for lightweight client-side routing.
- **Form Handling**: React Hook Form with Zod validation.

### Backend Architecture
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript (ES modules).
- **Database ORM**: Drizzle ORM for type-safe operations.
- **Database**: PostgreSQL (via Neon Database serverless connection).
- **Session Management**: express-session with PostgreSQL session store.
- **File Upload**: Multer middleware.

### Authentication System
- **Provider**: Replit OpenID Connect (OIDC) integration.
- **Strategy**: Passport.js with openid-client.
- **Session Storage**: PostgreSQL-backed sessions.
- **Authorization**: Role-based access control (admin vs. client).
- **Team Management**: Secure invitation system for agency team members (admin access).
- **Organization Management**: Business entity grouping for multiple client contacts.
- **Dev Authentication**: Supports non-Replit user authentication for development via email-based login.

### Data Storage
- **Primary Database (PostgreSQL)**: Stores Users (roles: admin/client), Organizations, Projects, Services, Tasks, Project Files, Analytics, Messages, KPIs, and Team Invitations.
- **File Storage**: Local filesystem with organized directory structure.
- **Session Storage**: PostgreSQL sessions table.

### API Design
- **Architecture**: RESTful API (`/api` prefix).
- **Communication**: JSON-based with proper CORS.
- **Error Handling**: Centralized error middleware.
- **File Handling**: Multipart form data for uploads.

### Real-time Features
- **Updates**: Polling-based updates via React Query.
- **Notifications**: Toast-based user feedback.
- **Live Data**: Automatic re-fetching on window focus/network reconnection.

### Core Features & Enhancements
- **Project/Organization Management**: Comprehensive project and organization management with various view options (tile/grid, list), direct editing, contact management, and project navigation.
- **Task Management**: Detailed task tracking linked to projects/services, with soft delete, restore, and comprehensive delete functionality. Includes an enhanced "Edit Task Modal" and assignment display.
- **Time Management**: Unified timezone handling using Luxon for robust UTC/local time conversions and accurate `due_at` computations.
- **Google Calendar Integration**: **FULLY AUTOMATIC SYNC SYSTEM OPERATIONAL (2025-08-20)**: Complete end-to-end automatic Google Calendar synchronization implemented with robust timezone handling, idempotent operations, and comprehensive debug capabilities. Key components: CalendarService class with Luxon-based time normalization (America/Vancouver), AutoCalendarSync hooks for task lifecycle events, dual token storage system (userId + teamMemberId), and comprehensive debug routes. **DATABASE**: New tables `google_tokens` and `calendar_event_mappings` for token management and event idempotency. **AUTO-SYNC HOOKS**: Task create/update/delete operations automatically trigger calendar sync via AutoCalendarSync class. **TIME NORMALIZATION**: All due_at timestamps computed using Luxon with proper DST handling. Calendar events created with correct local timezone specification. **SELF-TEST VERIFIED (2025-08-20)**: `/debug/sync/self-test?as=nikki@csekcreative.com` passes all tests - task creation, calendar sync, update sync, and deletion cleanup work perfectly. **DEBUG ROUTES OPERATIONAL**: Full suite of debug endpoints for testing, monitoring, and troubleshooting calendar sync operations.
- **Quote Upload System**: Automated quote-to-project conversion workflow.  
- **Role Management**: Defined roles like "GHL Lead" and "Strategist".
- **Debug System**: Robust debugging infrastructure with isolated routes, OAuth state preservation, and kill-switch capabilities for calendar sync. Multiple debug endpoints operational for individual task testing and bulk operations.

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL database.
- **@neondatabase/serverless**: For WebSocket-based connections to Neon.

### Authentication & Session Management
- **Replit's OIDC provider**: For user authentication.
- **PostgreSQL-backed session store**: For session persistence.

### UI & Styling
- **Radix UI**: Primitives for accessible components.
- **shadcn/ui**: Component collection for design system.
- **Lucide React**: For consistent iconography.
- **Tailwind CSS**: CSS framework with PostCSS.

### Development & Build Tools
- **Vite**: Build system for React/TypeScript.
- **ESBuild**: For production bundling.
- **Cartographer plugin**: For Replit-specific features.

### File Processing
- **Multer**: For multipart form processing.
- **@google-cloud/storage**: For Google Cloud Storage integration.
- **Uppy.js**: For advanced upload UI components.

### Utility Libraries
- **Luxon**: For robust date and time handling, including timezones.