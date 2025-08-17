import { Router } from 'express';
import { storage } from '../storage';
import { nanoid } from 'nanoid';

// Extend Express session to include user
declare module 'express-session' {
  interface SessionData {
    user?: {
      userId: string;
      email: string;
      teamMemberId: string;
    };
  }
}

const router = Router();

// Dev login route - GET /auth/dev/login?email=<email>
router.get('/dev/login', async (req, res) => {
  try {
    const email = req.query.email as string;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }

    // Find or create user by email
    let user = await storage.getUserByEmail(email);
    
    if (!user) {
      // Create new user
      const userData = {
        id: nanoid(),
        email,
        firstName: email.split('@')[0], // Use part before @ as default first name
        lastName: null,
        role: 'client' as const,
        profileImageUrl: null,
        companyName: null,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: new Date(),
        twoFactorEnabled: false,
        emailVerified: true,
        loginCount: 1,
        calendarSyncEnabled: false
      };
      
      user = await storage.createUser(userData);
    }

    // Find or create team member record
    let teamMember = await storage.getTeamMemberByEmail(email);
    
    if (!teamMember) {
      // Create team member record
      const teamMemberData = {
        id: nanoid(),
        name: user.firstName || email.split('@')[0],
        email: user.email!,
        role: 'client' as const,
        createdAt: new Date(),
        userId: user.id
      };
      
      teamMember = await storage.createTeamMember(teamMemberData);
    }

    // Set session
    req.session.user = {
      userId: user.id,
      email: user.email!,
      teamMemberId: teamMember.id
    };

    console.log(`Dev login successful for ${email}, session:`, req.session.user);

    // Redirect to my-tasks
    res.redirect('/my-tasks');
    
  } catch (error) {
    console.error('Dev login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout route - POST /auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    
    // Clear the session cookie
    res.clearCookie('sid');
    res.redirect('/');
  });
});

export { router as devAuthRouter };