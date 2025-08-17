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
  console.log('>> HIT /oauth/google/connect');
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

// Also mount under /api path for compatibility
googleRouter.get('/api/oauth/google/connect', async (req: any, res) => {
  console.log('>> HIT /api/oauth/google/connect');
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
  console.log('>> HIT /oauth/google/callback', req.query);
  try {
    const client = oauth2();
    const { tokens } = await client.getToken(req.query.code as string);
    client.setCredentials(tokens);

    // Get user profile from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: profile } = await oauth2.userinfo.get();
    const email = profile.email;
    const googleSub = profile.id;

    if (!email) {
      console.error('OAuth callback failure: No email in Google profile', { query: req.query });
      return res.status(400).send('Unable to retrieve email from Google profile. Please try again.');
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

    // If not found in users, try team_members table
    if (!userId) {
      try {
        const teamResult = await db.query('SELECT id FROM team_members WHERE email = $1', [email]);
        if (teamResult.rows.length > 0) {
          // For team members, we'll use their team_member ID as the userId for tokens
          userId = teamResult.rows[0].id;
        }
      } catch (err) {
        console.error('Error querying team_members table:', err);
      }
    }

    if (!userId) {
      console.error('OAuth callback failure: Email not recognized', { email, query: req.query });
      return res.status(400).send(`Email ${email} not recognized in this workspace. Please contact your administrator.`);
    }

    const scopes = (tokens.scope as string) || 'https://www.googleapis.com/auth/calendar.events openid email profile';
    await saveTokens(db, userId, tokens, scopes);

    res.send('Google Calendar connected. You can close this window.');
  } catch (e: any) {
    console.error('OAuth callback failure', { query: req.query, err: e?.message });
    res.status(500).send('OAuth error occurred. Please try again or contact support.');
  }
});

// Also mount callback under /api path for compatibility
googleRouter.get('/api/oauth/google/callback', async (req: any, res) => {
  console.log('>> HIT /api/oauth/google/callback', req.query);
  try {
    const client = oauth2();
    const { tokens } = await client.getToken(req.query.code as string);
    client.setCredentials(tokens);

    // Get user profile from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: profile } = await oauth2.userinfo.get();
    const email = profile.email;
    const googleSub = profile.id;

    if (!email) {
      console.error('OAuth callback failure: No email in Google profile', { query: req.query });
      return res.status(400).send('Unable to retrieve email from Google profile. Please try again.');
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

    // If not found in users, try team_members table
    if (!userId) {
      try {
        const teamResult = await db.query('SELECT id FROM team_members WHERE email = $1', [email]);
        if (teamResult.rows.length > 0) {
          // For team members, we'll use their team_member ID as the userId for tokens
          userId = teamResult.rows[0].id;
        }
      } catch (err) {
        console.error('Error querying team_members table:', err);
      }
    }

    if (!userId) {
      console.error('OAuth callback failure: Email not recognized', { email, query: req.query });
      return res.status(400).send(`Email ${email} not recognized in this workspace. Please contact your administrator.`);
    }

    const scopes = (tokens.scope as string) || 'https://www.googleapis.com/auth/calendar.events openid email profile';
    await saveTokens(db, userId, tokens, scopes);

    res.send('Google Calendar connected. You can close this window.');
  } catch (e: any) {
    console.error('OAuth callback failure', { query: req.query, err: e?.message });
    res.status(500).send('OAuth error occurred. Please try again or contact support.');
  }
});

// Debug health route to confirm router is mounted
googleRouter.get('/debug/google-router', (req, res) => {
  res.json({ ok: true });
});
