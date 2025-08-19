import { Request, Response, NextFunction } from 'express';

// Enhanced auth middleware that checks session first, then falls back to Replit auth
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionUser = (req.session as any)?.user;
  
  // If we have a session user, attach it to req.user for compatibility
  if (sessionUser) {
    req.user = {
      claims: {
        sub: sessionUser.userId,
        email: sessionUser.email
      },
      sessionUser: sessionUser
    };
    return next();
  }

  // Fallback to Replit auth for local development/preview
  if (req.user?.claims?.sub) {
    return next();
  }

  // No authentication found
  return res.status(401).json({ message: 'Unauthorized' });
}

// Get current user with session preference
export function getCurrentUser(req: Request): { userId: string; email: string; teamMemberId?: string } | null {
  const sessionUser = (req.session as any)?.user;
  
  if (sessionUser) {
    return {
      userId: sessionUser.userId,
      email: sessionUser.email,
      teamMemberId: sessionUser.teamMemberId
    };
  }

  // Fallback to Replit auth
  if (req.user?.claims?.sub) {
    return {
      userId: req.user.claims.sub,
      email: req.user.claims.email || ''
    };
  }

  return null;
}