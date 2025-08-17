import { Router } from 'express';
import { google } from 'googleapis';
import { Pool } from 'pg';
import { storage } from '../storage';

export const googleRouter = Router();

function oauth2(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || process.env.GOOGLE_REDIRECT_URI
  );
}

async function saveTokens(db: Pool, canonicalUserId: string, tokens: any, scopes: string) {
  const expiry = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 55 * 60 * 1000);
  
  // Only upsert by canonical userId - this is the source of truth
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
}

googleRouter.get('/oauth/google/connect', async (req: any, res) => {
  console.log('>> HIT', req.path, req.query);
  
  // Compute redirect at runtime (authoritative)
  const redirect = `${req.protocol}://${req.headers.host}/oauth/google/callback`;
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
    // Compute redirect at runtime (must match the value used in connect)
    const redirect = `${req.protocol}://${req.headers.host}/oauth/google/callback`;
    
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

    // If state contains ?as=<email>, resolve that email instead
    const state = req.query.state as string;
    if (state && state.startsWith('as=')) {
      const asEmail = decodeURIComponent(state.substring(3));
      targetEmail = asEmail;
      console.log('OAuth callback: Resolving impersonated email', { googleEmail: email, targetEmail: asEmail });
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

    const scopes = (tokens.scope as string) || 'https://www.googleapis.com/auth/calendar.events openid email profile';
    await saveTokens(db, canonicalUserId, tokens, scopes);

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

    // Establish user session after successful OAuth
    (req.session as any).user = {
      userId: canonicalUserId,
      email: targetEmail,
      teamMemberId
    };

    // Determine redirect location
    let redirectTo = '/my-tasks';
    if (state) {
      const stateParams = new URLSearchParams(state);
      if (stateParams.get('returnTo')) {
        redirectTo = stateParams.get('returnTo') as string;
      }
    }

    const origin = `${req.protocol}://${req.headers.host}`;
    return res.redirect(303, `${origin}${redirectTo}?calendar=connected`);
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

// Auth routes for session management
googleRouter.get('/auth/status', (req: any, res) => {
  const sessionUser = (req.session as any)?.user;
  
  res.json({
    sessionExists: !!sessionUser,
    user: sessionUser || null
  });
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
