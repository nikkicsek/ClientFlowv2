import type { Request, Response, NextFunction } from 'express';
import { db } from '../storage';

export type Identity = {
  userId: string;
  email: string;
  teamMemberId: string | null;
};

export async function resolveSessionIdentity(req: Request, res: Response, next: NextFunction) {
  try {
    // 1) Require session
    const sessUser = (req.session as any)?.user; // { id, email }
    if (!sessUser?.id || !sessUser?.email) {
      return res.status(401).json({ error: 'No session' });
    }

    const userId = String(sessUser.id);
    const email = String(sessUser.email).toLowerCase();

    // 2) Upsert users row
    const existingUser = await db.getUserById(userId);
    if (!existingUser) {
      await db.createUser({
        id: userId,
        email,
        firstName: 'User',
        lastName: 'User',
        role: 'client',
        profileImageUrl: null,
        companyName: null,
        organizationId: null,
        jobTitle: null,
        phone: null,
        address: null,
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiry: null,
        calendarSyncEnabled: false
      });
    } else if (existingUser.email !== email) {
      // Update email if changed
      await db.updateUser(userId, { email });
    }

    // 3) Link/find team_members by user_id OR email
    const allTeamMembers = await db.getTeamMembers();
    let teamMember = allTeamMembers.find(tm => tm.userId === userId || tm.email === email);

    // 4) If none, create/link
    if (!teamMember) {
      teamMember = await db.createTeamMember({
        name: `${sessUser.firstName || 'User'} ${sessUser.lastName || 'User'}`,
        email,
        role: 'Team Member',
        userId,
        organizationId: null
      });
    } else if (!teamMember.userId) {
      // Repair: backfill user_id if missing
      await db.updateTeamMember(teamMember.id, { userId, email });
    }

    // 5) Attach identity to request
    (req as any).identity = {
      userId,
      email,
      teamMemberId: teamMember?.id ?? null,
    } as Identity;

    return next();
  } catch (error) {
    console.error('Identity resolution error:', error);
    return res.status(500).json({ error: 'Identity resolution failed' });
  }
}