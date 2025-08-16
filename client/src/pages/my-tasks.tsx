import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { TeamMemberTasks } from '@/components/team-member-tasks';
import { CalendarSyncDialog } from '@/components/calendar-sync-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, AlertCircle, Calendar } from 'lucide-react';

export function MyTasksPage() {
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);

  // Get current user info
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  // Get team members to find the current user's team member record
  const { data: teamMembers = [], isLoading: teamLoading } = useQuery({
    queryKey: ["/api/team-members"],
    enabled: !!user?.email,
  });

  if (userLoading || teamLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center">
              <div className="animate-pulse">Loading your tasks...</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-400" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Required</h3>
              <p className="text-gray-600">Please log in to view your tasks.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Find the team member record matching the current user's email
  const currentTeamMember = teamMembers.find((member: any) => member.email === user.email);

  if (!currentTeamMember) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center">
              <User className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Team Member Not Found</h3>
              <p className="text-gray-600">
                You are not currently registered as a team member. Contact your admin to be added to the team.
              </p>
              <div className="mt-4 text-sm text-gray-500">
                Logged in as: {user.email}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Tasks</h1>
          <Button
            onClick={() => setShowCalendarDialog(true)}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            Calendar Sync
          </Button>
        </div>
        <TeamMemberTasks 
          teamMemberId={currentTeamMember.id} 
          teamMemberName={currentTeamMember.name}
        />
        
        <CalendarSyncDialog
          isOpen={showCalendarDialog}
          onClose={() => setShowCalendarDialog(false)}
        />
      </div>
    </div>
  );
}