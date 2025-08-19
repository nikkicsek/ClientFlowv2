import { db } from '../storage';
import type { Identity } from '../middleware/identity';

export async function getMyTasks(identity: Identity) {
  const { teamMemberId, userId, email } = identity;

  // Prefer teamMemberId, fallback to userId, then email
  if (teamMemberId) {
    const tasks = await db.getTasksByTeamMember(teamMemberId);
    if (tasks.length) return tasks;
  }

  // Fallback: get all tasks and filter by assignee email or user context
  const allTasks = await db.getTasks();
  return allTasks.filter(task => {
    // Check if task is assigned to this user by email or team member ID
    if (task.teamMemberId === teamMemberId) return true;
    if (task.assignees && task.assignees.includes(email)) return true;
    return false;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}