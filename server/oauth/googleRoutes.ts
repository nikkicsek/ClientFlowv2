import { Router } from 'express';
import { google } from 'googleapis';
import { Pool } from 'pg';

export const googleRouter = Router();

function oauth2() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

async function saveTokens(db: Pool, userId: string, tokens: any, scopes: string) {
  const expiry = tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 55 * 60 * 1000);
  await db.query(`
    INSERT INTO oauth_tokens (user_id, access_token, refresh_token, expiry, scopes, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5, now(), now())
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
      expiry = EXCLUDED.expiry,
      scopes = EXCLUDED.scopes,
      updated_at = now()
  `, [userId, tokens.access_token, tokens.refresh_token || null, expiry, scopes]);
}

googleRouter.get('/oauth/google/connect', async (req: any, res) => {
  console.log('>> HIT', req.path, req.query);
  const client = oauth2();
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
  res.redirect(url);
});



googleRouter.get('/oauth/google/callback', async (req: any, res) => {
  console.log('>> HIT', req.path, req.query);
  try {
    const client = oauth2();
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

    // Find user ID by email in our database
    const db = req.app.get('db') as Pool;
    let userId: string | null = null;

    // Try users table first
    try {
      const userResult = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id;
      }
    } catch (err) {
      console.error('Error querying users table:', err);
    }

    // If not found in users, try to resolve via team_members.user_id
    if (!userId) {
      try {
        const teamResult = await db.query('SELECT user_id FROM team_members WHERE email = $1', [email]);
        if (teamResult.rows.length > 0 && teamResult.rows[0].user_id) {
          userId = teamResult.rows[0].user_id;
        }
      } catch (err) {
        console.error('Error querying team_members table:', err);
      }
    }

    if (!userId) {
      console.error('OAuth callback failure: Email not recognized', { email, query: req.query });
      const origin = `${req.protocol}://${req.headers.host}`;
      return res.redirect(303, `${origin}/my-tasks?calendar=error`);
    }

    const scopes = (tokens.scope as string) || 'https://www.googleapis.com/auth/calendar.events openid email profile';
    await saveTokens(db, userId, tokens, scopes);

    const origin = `${req.protocol}://${req.headers.host}`;
    return res.redirect(303, `${origin}/my-tasks?calendar=connected`);
  } catch (e: any) {
    console.error('OAuth callback failure', { query: req.query, err: e?.message });
    const origin = `${req.protocol}://${req.headers.host}`;
    return res.redirect(303, `${origin}/my-tasks?calendar=error`);
  }
});



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
googleRouter.get('/debug/oauth-info', (_req, res) => {
  res.json({
    envRedirect: process.env.GOOGLE_REDIRECT_URI,
    hasConnect: true,
    hasCallback: true,
    compatAuthAlias: true
  });
});

// Debug health route to confirm router is mounted
googleRouter.get('/debug/google-router', (req, res) => {
  res.json({ ok: true });
});
