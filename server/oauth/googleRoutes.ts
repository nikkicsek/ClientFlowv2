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
  const client = oauth2();
  const scope = ['https://www.googleapis.com/auth/calendar.events'];
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope,
  });
  res.redirect(url);
});

googleRouter.get('/oauth/google/callback', async (req: any, res) => {
  try {
    if (!req.user?.claims?.sub) return res.status(401).send('Not signed in');
    const userId = req.user.claims.sub;

    const client = oauth2();
    const { tokens } = await client.getToken(req.query.code as string);
    const scopes = (tokens.scope as string) || 'https://www.googleapis.com/auth/calendar.events';

    const db = req.app.get('db') as Pool;
    await saveTokens(db, userId, tokens, scopes);

    res.send('Google Calendar connected. You can close this window.');
  } catch (e: any) {
    console.error('OAuth callback error', e);
    res.status(500).send('OAuth error: ' + e.message);
  }
});

// Debug health route to confirm router is mounted
googleRouter.get('/debug/google-router', (req, res) => {
  res.json({ ok: true });
});
