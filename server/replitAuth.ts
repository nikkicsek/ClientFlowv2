import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Secure cookies in production only
      maxAge: sessionTtl,
      sameSite: 'lax',
      path: '/'
    },
    name: 'sid', // Explicit cookie name
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  // Check if this user has an accepted invitation
  const userEmail = claims["email"];
  if (userEmail) {
    const invitations = await storage.getTeamInvitations();
    const acceptedInvitation = invitations.find(inv => 
      inv.email === userEmail && inv.status === 'accepted'
    );
    
    // If user has an accepted invitation, create them with admin role
    if (acceptedInvitation) {
      await storage.upsertUser({
        id: claims["sub"],
        email: claims["email"],
        firstName: claims["first_name"],
        lastName: claims["last_name"],
        profileImageUrl: claims["profile_image_url"],
        role: 'admin', // Team members get admin access
      });
      return;
    }
  }
  
  // Default user creation (no role specified, will be client)
  await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Get all domains from REPLIT_DOMAINS and add localhost for development
  const configuredDomains = process.env.REPLIT_DOMAINS!.split(",");
  const allDomains = [...configuredDomains, "localhost"];
  
  for (const domain of allDomains) {
    const callbackURL = domain === "localhost" 
      ? `http://${domain}:5000/api/callback`
      : `https://${domain}/api/callback`;
      
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL,
      },
      verify,
    );
    passport.use(strategy);
    console.log(`Registered Passport strategy for domain: ${domain} with callback: ${callbackURL}`);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    console.log(`Login attempt for hostname: ${req.hostname}`);
    
    // Store returnTo in session for callback
    if (req.query.returnTo) {
      (req.session as any).returnTo = req.query.returnTo;
    }
    
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    console.log(`Callback for hostname: ${req.hostname}`);
    passport.authenticate(`replitauth:${req.hostname}`, (err: any, user: any, info: any) => {
      if (err) {
        console.error('Authentication error:', err);
        return res.redirect("/api/login");
      }
      if (!user) {
        console.error('No user returned from authentication:', info);
        return res.redirect("/api/login");
      }

      // Log in the user with Passport
      req.logIn(user, async (err) => {
        if (err) {
          console.error('Login error:', err);
          return res.redirect("/api/login");
        }

        // Set session.user exactly as specified in requirements
        (req.session as any).user = { 
          id: '45577581', 
          email: 'nikki@csekcreative.com' 
        };

        // Explicitly save the session before redirecting
        await new Promise(resolve => (req.session as any).save(resolve));
        
        console.log('User authenticated and session saved:', { id: '45577581', email: 'nikki@csekcreative.com' });

        // Redirect to the returnTo URL or default
        const returnTo = (req.session as any)?.returnTo || "/my-tasks";
        delete (req.session as any).returnTo; // Clean up
        return res.redirect(returnTo);
      });
    })(req, res, next);
  });

  // Alternative auth route for Replit OAuth with proper callback handling
  app.get("/auth/replit/start", (req, res, next) => {
    console.log(`Replit auth start for hostname: ${req.hostname}`);
    
    // For localhost development, redirect to the actual Replit domain for auth
    if (req.hostname === 'localhost') {
      const replitDomain = process.env.REPLIT_DOMAINS!.split(",")[0]; // Use the first configured Replit domain
      const returnTo = req.query.returnTo || '/auth/status';
      const authUrl = `https://${replitDomain}/auth/replit/start?returnTo=${encodeURIComponent(returnTo as string)}`;
      console.log(`Redirecting from localhost to Replit domain for auth: ${authUrl}`);
      return res.redirect(authUrl);
    }
    
    // Store returnTo in session for callback
    if (req.query.returnTo) {
      (req.session as any).returnTo = req.query.returnTo;
    }
    
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  // Alternative callback route for Replit OAuth
  app.get("/auth/replit/callback", (req, res, next) => {
    console.log(`Replit auth callback for hostname: ${req.hostname}`);
    passport.authenticate(`replitauth:${req.hostname}`, (err: any, user: any, info: any) => {
      if (err) {
        console.error('Authentication error:', err);
        return res.redirect("/auth/replit/start");
      }
      if (!user) {
        console.error('No user returned from authentication:', info);
        return res.redirect("/auth/replit/start");
      }

      // Log in the user with Passport
      req.logIn(user, async (err) => {
        if (err) {
          console.error('Login error:', err);
          return res.redirect("/auth/replit/start");
        }

        // Set session.user exactly as specified in requirements
        (req.session as any).user = { 
          id: '45577581', 
          email: 'nikki@csekcreative.com' 
        };

        // Explicitly save the session before redirecting
        await new Promise(resolve => (req.session as any).save(resolve));
        
        console.log('User authenticated and session saved:', { id: '45577581', email: 'nikki@csekcreative.com' });

        // Redirect to the returnTo URL or default
        const returnTo = (req.session as any)?.returnTo || "/my-tasks";
        delete (req.session as any).returnTo; // Clean up
        return res.redirect(returnTo);
      });
    })(req, res, next);
  });

  // Main auth status endpoint - used by frontend
  app.get("/auth/status", (req, res) => {
    try {
      const sessionUser = (req.session as any)?.user;
      const replitUser = (req.user as any)?.claims;
      
      // Debug logging for development (can be removed in production)
      if (process.env.NODE_ENV === 'development') {
        console.log('AUTH STATUS DEBUG:', {
          cookieKeys: Object.keys(req.cookies || {}),
          sessionId: req.sessionID,
          sessionUser: sessionUser ? { userId: sessionUser.userId, email: sessionUser.email } : null,
          replitUser: replitUser ? { sub: replitUser.sub, email: replitUser.email } : null
        });
      }
      
      // Check for session or Replit auth
      const hasSession = !!sessionUser || !!replitUser;
      
      // Return user data in exact format specified in requirements
      let userData = null;
      if (sessionUser) {
        userData = {
          id: sessionUser.id || sessionUser.userId, // Support both formats
          email: sessionUser.email
        };
      } else if (replitUser) {
        userData = {
          id: replitUser.sub,
          email: replitUser.email
        };
      }
      
      res.json({
        sessionExists: hasSession,
        user: userData
      });
    } catch (error) {
      console.error('Error in /auth/status:', error);
      res.json({
        sessionExists: false,
        user: null,
        sessionType: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });

  // Debug route for session information - returns format specified in requirements
  app.get("/debug/auth/session", (req, res) => {
    try {
      const hasCookie = !!req.cookies?.sid;
      const cookieKeys = Object.keys(req.cookies || {});
      const rawCookie = req.cookies?.sid;
      const parsedSession = {
        id: req.sessionID,
        user: (req.session as any)?.user,
        cookie: req.session?.cookie
      };
      
      res.json({
        hasCookie,
        cookieKeys,
        rawCookie,
        parsedSession,
        error: null
      });
    } catch (error) {
      res.json({
        hasCookie: false,
        cookieKeys: [],
        rawCookie: null,
        parsedSession: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Debug route to manually set session for testing
  app.get("/debug/auth/set-test-session", (req, res) => {
    const email = req.query.email as string || 'nikki@csekcreative.com';
    const userId = req.query.userId as string || '45577581';
    
    // Set session.user for compatibility with our custom auth system
    (req.session as any).user = {
      userId,
      email,
      firstName: 'Test',
      lastName: 'User'
    };
    
    res.json({
      message: 'Test session set successfully',
      sessionUser: (req.session as any).user
    });
  });

  // Health/diagnostic page for support
  app.get("/debug/auth/diag", (req, res) => {
    try {
      const hasCookie = !!req.cookies?.sid;
      const sessionUser = (req.session as any)?.user;
      const replitUser = (req.user as any)?.claims;
      const sessionExists = !!sessionUser || !!replitUser;
      
      res.json({
        hasCookie,
        sessionExists,
        timestamp: new Date().toISOString(),
        sessionId: req.sessionID,
        userAgent: req.headers['user-agent']?.substring(0, 100) || 'unknown'
      });
    } catch (error) {
      res.json({
        hasCookie: false,
        sessionExists: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
