import { Router } from 'express';

const router = Router();

// Auth status endpoint
router.get('/status', (req: any, res) => {
  try {
    const sessionUser = (req.session as any)?.user;
    const replitUser = req.user?.claims;
    
    const hasSession = Boolean(sessionUser || replitUser);
    
    let user = null;
    if (sessionUser) {
      user = {
        id: sessionUser.userId || sessionUser.id,
        email: sessionUser.email
      };
    } else if (replitUser) {
      user = {
        id: replitUser.sub,
        email: replitUser.email
      };
    }
    
    res.json({
      sessionExists: hasSession,
      user
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to check auth status' });
  }
});

export { router as authRouter };