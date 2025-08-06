# replit.md

## Overview

AgencyPro is a customizable client-facing project management dashboard web application designed for marketing agencies. The platform provides clients with a comprehensive view of their active projects, task progress, analytics, file sharing, and communication capabilities. Built as a full-stack TypeScript application with a React frontend and Express backend, it offers features similar to Agency Analytics for client reporting and project transparency.

## User Preferences

Preferred communication style: Simple, everyday language.

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

### Data Storage
- **Primary Database**: PostgreSQL with the following core entities:
  - Users (with role-based permissions)
  - Projects (with client assignments and progress tracking)
  - Services (categorized offerings like web design, marketing, etc.)
  - Tasks (linked to projects and services with status tracking)
  - Project Files (with approval workflows and categorization)
  - Analytics (metrics and performance data)
  - Messages (project communication and updates)
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

### Potential Integrations
- **Analytics Platforms**: Designed to integrate with marketing tools and analytics services
- **Reporting**: PDF generation capabilities for client reports
- **Cloud Storage**: Expandable to AWS S3 or other cloud storage providers