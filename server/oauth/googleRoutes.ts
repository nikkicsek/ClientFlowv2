import { Router } from 'express';
import { google } from 'googleapis';
import { Pool } from 'pg';
import { storage } from '../storage';
import { CalendarService } from '../services/CalendarService';

export const googleRouter = Router();

function oauth2(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || process.env.GOOGLE_REDIRECT_URI
  );
}

async function saveTokens(db: Pool, canonicalUserId: string, tokens: any, scopes: string, teamMemberId?: string) {
  const expiry = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 55 * 60 * 1000);
  
  // Upsert by canonical userId only (table only has user_id column)
  await db.query(`
    INSERT INTO oauth_tokens (user_id, access_token, refresh_token, expiry, scopes, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
      expiry = EXCLUDED.expiry,
      scopes = EXCLUDED.scopes,
      updated_at = now()
  `, [canonicalUserId, tokens.access_token, tokens.refresh_token || null, expiry, scopes]);
  
  console.log(`Saved OAuth tokens for user_id: ${canonicalUserId}${teamMemberId ? ` (linked to team_member: ${teamMemberId})` : ''}`);
}

googleRouter.get('/oauth/google/connect', async (req: any, res) => {
  console.log('>> HIT', req.path, req.query);
  
  // Check if user has a valid Replit session first
  const sessionUser = (req.session as any)?.user;
  const replitUser = req.user?.claims;
  
  if (!sessionUser && !replitUser) {
    console.log('No session for Google OAuth - redirecting to Replit auth');
    const returnTo = req.query.returnTo || req.originalUrl || '/my-tasks';
    const origin = `${req.protocol}://${req.headers.host}`;
    return res.redirect(303, `${origin}/api/login?returnTo=${encodeURIComponent(returnTo as string)}`);
  }
  
  // Use environment-specified redirect URI to match Google OAuth configuration
  const redirect = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.headers.host}/auth/google/callback`;
  console.log('AUTH redirect_uri =', redirect);
  
  // Create OAuth2 client with computed redirect
  const client = oauth2(redirect);
  const scope = [
    'openid', 'email', 'profile',
    'https://www.googleapis.com/auth/calendar.events'
  ];
  
  // Preserve state including ?as=<email> for impersonation and returnTo
  let state = '';
  const stateParams = [];
  
  if (req.query.as) {
    stateParams.push(`as=${encodeURIComponent(req.query.as)}`);
  } else if (req.user?.claims?.sub || req.user?.id) {
    stateParams.push(`user=${encodeURIComponent((req.user?.claims?.sub as string) || (req.user?.id as string))}`);
  }
  
  // Preserve returnTo for redirect after login
  if (req.query.returnTo || (req.session as any)?.returnTo) {
    const returnTo = req.query.returnTo || (req.session as any).returnTo;
    stateParams.push(`returnTo=${encodeURIComponent(returnTo as string)}`);
  }
  
  state = stateParams.join('&');
  
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope,
    state,
  });
  res.redirect(url);
});



googleRouter.get('/oauth/google/callback', async (req: any, res) => {
  console.log('>> HIT', req.path, req.query);
  try {
    // Use environment-specified redirect URI to match Google OAuth configuration
    const redirect = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.headers.host}/auth/google/callback`;
    
    // Create OAuth2 client with the same computed redirect
    const client = oauth2(redirect);
    
    const { tokens } = await client.getToken(req.query.code as string);
    client.setCredentials(tokens);

    // Get user profile from Google
    const oauth2Api = google.oauth2({ version: 'v2', auth: client });
    const { data: profile } = await oauth2Api.userinfo.get();
    const email = profile.email;
    const googleSub = profile.id;

    if (!email) {
      console.error('OAuth callback failure: No email in Google profile', { query: req.query });
      const origin = `${req.protocol}://${req.headers.host}`;
      return res.redirect(303, `${origin}/my-tasks?calendar=error`);
    }

    // Resolve canonical user ID - always the same ID used for task assignments
    const db = req.app.get('db') as Pool;
    let canonicalUserId: string | null = null;
    let targetEmail = email;

    // Parse state parameters properly
    const state = req.query.state as string;
    const stateParams = new URLSearchParams(state || '');
    
    // If state contains as=<email>, resolve that email instead
    if (stateParams.get('as')) {
      targetEmail = stateParams.get('as') as string;
      console.log('OAuth callback: Resolving impersonated email', { googleEmail: email, targetEmail });
    }

    // Always resolve canonical user ID from the target email
    try {
      const userResult = await db.query('SELECT id FROM users WHERE email = $1', [targetEmail]);
      if (userResult.rows.length > 0) {
        canonicalUserId = userResult.rows[0].id;
      }
    } catch (err) {
      console.error('Error querying users table:', err);
    }

    // If not found in users, try to resolve via team_members.user_id
    if (!canonicalUserId) {
      try {
        const teamResult = await db.query('SELECT user_id FROM team_members WHERE email = $1', [targetEmail]);
        if (teamResult.rows.length > 0 && teamResult.rows[0].user_id) {
          canonicalUserId = teamResult.rows[0].user_id;
        }
      } catch (err) {
        console.error('Error querying team_members table:', err);
      }
    }

    if (!canonicalUserId) {
      console.error('OAuth callback failure: Email not recognized', { email, targetEmail, query: req.query, state });
      const origin = `${req.protocol}://${req.headers.host}`;
      return res.redirect(303, `${origin}/my-tasks?calendar=error`);
    }

    // Look up team member ID for the resolved user
    let teamMemberId = null;
    try {
      const teamResult = await db.query('SELECT id FROM team_members WHERE email = $1', [targetEmail]);
      if (teamResult.rows.length > 0) {
        teamMemberId = teamResult.rows[0].id;
      }
    } catch (err) {
      console.error('Error querying team_members for session:', err);
    }

    // Check if this is team member authentication from debug route
    const teamMemberStateParams = new URLSearchParams(state || '');
    const isTeamMemberAuth = teamMemberStateParams.get('team_member_auth') === 'true';
    const teamMemberIdFromState = teamMemberStateParams.get('team_member_id');
    const teamMemberEmailFromState = teamMemberStateParams.get('email');
    
    if (isTeamMemberAuth && teamMemberIdFromState && teamMemberEmailFromState) {
      // Store tokens specifically for team member
      try {
        const expiry = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 55 * 60 * 1000);
        const scopes = 'https://www.googleapis.com/auth/calendar.events openid email profile';
        
        await db.query(`
          INSERT INTO google_tokens (owner_type, owner_id, email, access_token, refresh_token, scope, expiry_date, created_at, updated_at)
          VALUES ('team_member', $1, $2, $3, $4, $5, $6, now(), now())
          ON CONFLICT (owner_type, owner_id) DO UPDATE SET
            access_token = EXCLUDED.access_token,
            refresh_token = COALESCE(EXCLUDED.refresh_token, google_tokens.refresh_token),
            scope = EXCLUDED.scope,
            expiry_date = EXCLUDED.expiry_date,
            updated_at = now()
        `, [teamMemberIdFromState, decodeURIComponent(teamMemberEmailFromState), tokens.access_token, tokens.refresh_token || null, scopes, expiry]);
        
        console.log(`Successfully stored Google Calendar tokens for team member ${teamMemberIdFromState} (${decodeURIComponent(teamMemberEmailFromState)})`);
        
        // Redirect to success page
        const origin = `${req.protocol}://${req.headers.host}`;
        return res.redirect(303, `${origin}/debug/team-member-success?email=${teamMemberEmailFromState}&connected=true`);
        
      } catch (error) {
        console.error('Error storing team member tokens:', error);
        const origin = `${req.protocol}://${req.headers.host}`;
        return res.redirect(303, `${origin}/debug/team-member-success?email=${teamMemberEmailFromState}&error=token_storage_failed`);
      }
    }

    const scopes = (tokens.scope as string) || 'https://www.googleapis.com/auth/calendar.events openid email profile';
    await saveTokens(db, canonicalUserId, tokens, scopes, teamMemberId);

    // Establish user session after successful OAuth
    (req.session as any).user = {
      userId: canonicalUserId,
      email: targetEmail,
      teamMemberId
    };

    // Determine redirect location - preserve exact returnTo URL
    let redirectTo = '/my-tasks';
    let addCalendarFlag = true;
    
    if (state) {
      const stateParams = new URLSearchParams(state);
      if (stateParams.get('returnTo')) {
        redirectTo = stateParams.get('returnTo') as string;
        // Don't add calendar=connected to debug/test URLs
        if (redirectTo.includes('/debug/') || redirectTo.includes('?')) {
          addCalendarFlag = false;
        }
      }
    }

    const origin = `${req.protocol}://${req.headers.host}`;
    
    if (addCalendarFlag) {
      // Add calendar=connected only if returnTo doesn't have query params already
      const separator = redirectTo.includes('?') ? '&' : '?';
      return res.redirect(303, `${origin}${redirectTo}${separator}calendar=connected`);
    } else {
      // Preserve exact returnTo URL without modification
      return res.redirect(303, `${origin}${redirectTo}`);
    }
  } catch (e: any) {
    const redirect = `${req.protocol}://${req.headers.host}/oauth/google/callback`;
    console.error('OAuth callback failure', { 
      query: req.query, 
      err: e?.message,
      computedRedirect: redirect,
      envRedirect: process.env.GOOGLE_REDIRECT_URI 
    });
    const origin = `${req.protocol}://${req.headers.host}`;
    return res.redirect(303, `${origin}/my-tasks?calendar=error`);
  }
});

// Auth routes for session management - REMOVED, handled by main app in replitAuth.ts

// Auth status page (HTML) - shows login button when no session
googleRouter.get('/auth/status/page', (req: any, res) => {
  const sessionUser = (req.session as any)?.user;
  const replitUser = req.user?.claims;
  const hasSession = !!sessionUser || !!replitUser;
  
  const origin = `${req.protocol}://${req.headers.host}`;
  
  if (hasSession) {
    const user = sessionUser || { userId: replitUser.sub, email: replitUser.email };
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Auth Status - AgencyPro</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
          .status { padding: 20px; border-radius: 8px; margin: 20px 0; }
          .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
          .info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
          .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 10px 5px; }
          .button:hover { background: #0056b3; }
          .green { background: #28a745; }
          .green:hover { background: #1e7e34; }
        </style>
      </head>
      <body>
        <h1>Authentication Status</h1>
        <div class="status success">
          <h3>✅ Authenticated</h3>
          <p><strong>User ID:</strong> ${user.userId}</p>
          <p><strong>Email:</strong> ${user.email}</p>
          <p><strong>Session Type:</strong> ${sessionUser ? 'Custom Session' : 'Replit Session'}</p>
        </div>
        
        <div class="status info">
          <h3>🔗 Quick Actions</h3>
          <a href="${origin}/oauth/google/connect?returnTo=/auth/status/page" class="button green">Connect Google Calendar</a>
          <a href="${origin}/debug/calendar-status?as=${user.email}" class="button">Check Calendar Status</a>
          <a href="${origin}/debug/sync/self-test?as=${user.email}&tz=America/Vancouver" class="button">Run Self-Test</a>
          <a href="${origin}/my-tasks" class="button">Go to My Tasks</a>
        </div>
        
        <div style="margin-top: 30px;">
          <h3>Testing Checklist:</h3>
          <p>1. <a href="${origin}/auth/status">/auth/status</a> → sessionExists:true ✅</p>
          <p>2. <a href="${origin}/debug/calendar-status?as=${user.email}">/debug/calendar-status?as=${user.email}</a> → hasTokens:true (after Google connect)</p>
          <p>3. <a href="${origin}/debug/sync/self-test?as=${user.email}&tz=America/Vancouver">/debug/sync/self-test?as=${user.email}&tz=America/Vancouver</a> → ok:true (after Google connect)</p>
        </div>
      </body>
      </html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Auth Status - AgencyPro</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
          .status { padding: 20px; border-radius: 8px; margin: 20px 0; }
          .error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
          .button { display: inline-block; padding: 15px 30px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 10px; font-size: 16px; }
          .button:hover { background: #0056b3; }
          .replit { background: #f26207; }
          .replit:hover { background: #d4530c; }
          .dev { background: #6c757d; }
          .dev:hover { background: #545b62; }
        </style>
      </head>
      <body>
        <h1>Authentication Required</h1>
        <div class="status error">
          <h3>❌ Not Authenticated</h3>
          <p>You need to sign in to access this application.</p>
        </div>
        
        <div>
          <a href="${origin}/api/login?returnTo=/auth/status/page" class="button replit">🔐 Sign in with Replit</a>
          <br>
          ${process.env.NODE_ENV !== 'production' ? `<a href="${origin}/debug/session/impersonate?email=nikki@csekcreative.com" class="button dev">🧪 Dev Session (nikki@csekcreative.com)</a>` : ''}
        </div>
        
        <div style="margin-top: 30px; text-align: left;">
          <h3>After signing in, you can:</h3>
          <ul>
            <li>Connect your Google Calendar</li>
            <li>Access your tasks and projects</li>
            <li>Run the calendar sync self-test</li>
          </ul>
        </div>
      </body>
      </html>
    `);
  }
});

googleRouter.get('/auth/logout', (req: any, res) => {
  // Clear session
  req.session.destroy((err: any) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    // Clear the session cookie
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

googleRouter.get('/auth/login', (req: any, res) => {
  // Store returnTo in session for after OAuth callback
  if (req.query.returnTo) {
    (req.session as any).returnTo = req.query.returnTo;
  }
  
  // Redirect to OAuth connect
  const returnToParam = req.query.returnTo ? `&returnTo=${encodeURIComponent(req.query.returnTo as string)}` : '';
  res.redirect(`/oauth/google/connect?_t=${Date.now()}${returnToParam}`);
});

// Alias for backward compatibility
googleRouter.get('/auth/google/callback', (req, res, next) => {
  // Forward to the main OAuth callback
  req.url = '/oauth/google/callback';
  next();
}, googleRouter);



// Hard test route to confirm Express routing
googleRouter.get('/oauth/ping', (req, res) => {
  console.log('>> HIT', req.path, req.query);
  res.type('text').send('pong');
});

// COMPATIBILITY ALIASES - redirect wrong paths to correct ones
googleRouter.get('/auth/google/callback', (req, res) => {
  console.log('>> HIT COMPAT /auth/google/callback - redirecting to /oauth/google/callback');
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(307, '/oauth/google/callback' + qs);
});

googleRouter.get('/api/auth/google/callback', (req, res) => {
  console.log('>> HIT COMPAT /api/auth/google/callback - redirecting to /api/oauth/google/callback');
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(307, '/api/oauth/google/callback' + qs);
});

// Debug endpoint for OAuth info
googleRouter.get('/debug/oauth-info', (req, res) => {
  res.json({
    envRedirect: process.env.GOOGLE_REDIRECT_URI || null,
    computedRedirect: `${req.protocol}://${req.headers.host}/oauth/google/callback`,
    hasConnect: true,
    hasCallback: true,
    compatAuthAlias: true
  });
});

// Debug endpoint for OAuth auth URL
googleRouter.get('/debug/oauth-authurl', (req, res) => {
  // Compute redirect at runtime (same as connect handler)
  const redirect = `${req.protocol}://${req.headers.host}/oauth/google/callback`;
  
  // Create OAuth2 client with computed redirect
  const client = oauth2(redirect);
  const scope = [
    'openid', 'email', 'profile',
    'https://www.googleapis.com/auth/calendar.events'
  ];
  const state = (req.user?.claims?.sub as string) || (req.user?.id as string) || '';
  
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope,
    state,
  });
  
  res.json({ url, redirect });
});

// Debug health route to confirm router is mounted
googleRouter.get('/debug/google-router', (req, res) => {
  res.json({ ok: true });
});
