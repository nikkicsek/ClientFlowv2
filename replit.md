# replit.md

## Overview

AgencyPro is a customizable client-facing project management dashboard web application designed for marketing agencies. The platform provides clients with a comprehensive view of their active projects, task progress, analytics, file sharing, and communication capabilities. Built as a full-stack TypeScript application with a React frontend and Express backend, it offers features similar to Agency Analytics for client reporting and project transparency.

## User Preferences

Preferred communication style: Simple, everyday language.
UI preferences: Clean, functional interfaces without promotional or instructional content. Direct organization lists instead of benefits information.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Radix UI components with shadcn/ui for consistent, accessible design
- **Styling**: Tailwind CSS with CSS variables for theming (supports light/dark modes)
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation through @hookform/resolvers

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Database**: PostgreSQL via Neon Database serverless connection
- **Session Management**: express-session with PostgreSQL session store
- **File Upload**: Multer middleware for handling multipart form data

### Authentication System
- **Provider**: Replit OpenID Connect (OIDC) integration
- **Strategy**: Passport.js with openid-client strategy
- **Session Storage**: PostgreSQL-backed sessions with connect-pg-simple
- **Authorization**: Role-based access control (admin vs client roles)
- **Team Management**: Secure invitation system for agency team members with full admin access
- **Organization Management**: Business entity grouping for multiple client contacts

### Data Storage
- **Primary Database**: PostgreSQL with the following core entities:
  - Users (with role-based permissions: admin/client)
  - Organizations (business entities for grouping multiple client contacts)
  - Projects (with client assignments, organization links, and progress tracking)
  - Services (categorized offerings like web design, marketing, etc.)
  - Tasks (linked to projects and services with status tracking)
  - Project Files (with approval workflows and categorization)
  - Analytics (metrics and performance data)
  - Messages (project communication and updates)
  - KPIs (Key Performance Indicators with multi-platform integration)
  - Team Invitations (secure invitation system for agency staff)
- **File Storage**: Local filesystem with organized directory structure
- **Session Storage**: PostgreSQL sessions table for auth persistence

### API Design
- **Architecture**: RESTful API with consistent `/api` prefix
- **Error Handling**: Centralized error middleware with proper HTTP status codes
- **Request/Response**: JSON-based communication with proper CORS handling
- **File Handling**: Multipart form data for file uploads with size limits

### Real-time Features
- **Updates**: Polling-based updates through React Query's refetch intervals
- **Notifications**: Toast-based user feedback system
- **Live Data**: Automatic re-fetching on window focus and network reconnection

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL database with connection pooling
- **Connection**: @neondatabase/serverless for WebSocket-based connections

### Authentication & Session Management
- **OpenID Connect**: Replit's OIDC provider for user authentication
- **Session Store**: PostgreSQL-backed session persistence

### UI & Styling
- **Component Library**: Radix UI primitives for accessible components
- **Design System**: shadcn/ui component collection
- **Icons**: Lucide React for consistent iconography
- **CSS Framework**: Tailwind CSS with PostCSS processing

### Development & Build Tools
- **Build System**: Vite with React plugin and TypeScript support
- **Code Quality**: ESBuild for production bundling
- **Development**: Hot module replacement and error overlay integration
- **Replit Integration**: Cartographer plugin for Replit-specific features

### File Processing
- **Upload Handling**: Multer for multipart form processing
- **Cloud Storage**: Google Cloud Storage integration (@google-cloud/storage)
- **File Management**: Uppy.js components for advanced upload UI

### Recent Updates (August 2025)
- **Quote Upload System**: Fully operational automated quote-to-project conversion workflow
- **Team Management**: Added "GHL Lead" (orange) and "Strategist" (indigo) roles with proper styling
- **Organization Management**: Streamlined UI removing instructional content, added alphabetical sorting
- **Navigation Enhancement**: Fixed Organizations button to navigate directly to Business Organizations tab
- **View Options**: Added tile/grid and list view toggle for business organizations and projects display with list view as default
- **Direct Organization Editing**: Added hover-to-edit functionality on organization cards in both tile and list views
- **Organization Contact Management**: Added direct contact assignment/removal from organization cards with dedicated modal
- **Organization Project Navigation**: Added project count display and direct navigation to projects from organization cards
- **Organization Update API**: Implemented PUT endpoint for updating organization details without extra navigation steps
- **Project Status Management**: Added dropdown status selector directly on project tiles/list items with pending status option
- **Drag-and-Drop Reordering**: Implemented project reordering within organizations using @dnd-kit with display_order field
- **Enhanced Project Views**: Added both grid and list view options for projects with comprehensive list view including Google Drive links
- **Navigation Streamlined**: Removed "All Projects" tab for organization-based project management approach to handle hundreds of concurrent projects efficiently
- **Agency Tasks Modal**: Replaced fake team workload data with practical Quick Actions (Add Task, Manage Team, Edit Project)
- **Task Delete System**: Implemented comprehensive delete functionality for both project and organization tasks with confirmation dialogs
- **Soft Delete & Restore**: Added soft delete system that moves tasks to deleted items with restore capability for accidental deletions
- **Feature Parity**: Achieved complete feature parity between organization and project task creation (Google Drive links, proper scrolling, streamlined forms)
- **Google Calendar Integration**: Fully implemented Google Calendar OAuth integration for task synchronization with individual calendar management, automatic event creation, and manual sync capabilities

### Potential Integrations
- **Analytics Platforms**: Designed to integrate with marketing tools and analytics services
- **Reporting**: PDF generation capabilities for client reports
- **Cloud Storage**: Expandable to AWS S3 or other cloud storage providers