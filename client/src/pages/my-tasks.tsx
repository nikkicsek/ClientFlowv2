import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { TeamMemberTasks } from '@/components/team-member-tasks';
import { CalendarSyncDialog } from '@/components/calendar-sync-dialog';
import { CalendarSettings } from '@/components/CalendarSettings';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, AlertCircle, Calendar, LogIn } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export function MyTasksPage() {
  const [showCalendarDialog, setShowCalendarDialog] = useState(false);
  const [location] = useLocation();
  const { toast } = useToast();

  // Check session status
  const { data: authStatus, isLoading: authLoading } = useQuery({
    queryKey: ["/auth/status"],
    retry: false
  });

  // Check for calendar connection status from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const calendarStatus = urlParams.get('calendar');
    
    if (calendarStatus === 'connected') {
      toast({
        title: "Calendar Connected!",
        description: "Your Google Calendar has been successfully connected. You can now sync tasks.",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/my-tasks');
    } else if (calendarStatus === 'error') {
      toast({
        title: "Calendar Connection Failed",
        description: "There was an error connecting your Google Calendar. Please try again.",
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/my-tasks');
    }
  }, [location, toast]);

  // Get current user info only if session exists
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    enabled: (authStatus as any)?.sessionExists
  });

  // Get team members to find the current user's team member record
  const { data: teamMembers = [], isLoading: teamLoading } = useQuery({
    queryKey: ["/api/team-members"],
    enabled: !!(user as any)?.email,
  });

  if (authLoading || ((authStatus as any)?.sessionExists && userLoading) || teamLoading) {
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

  // Show login state if no session
  if (!(authStatus as any)?.sessionExists) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center">
              <LogIn className="h-16 w-16 mx-auto mb-4 text-blue-500" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Sign In Required</h3>
              <p className="text-gray-600 mb-6">Sign in with Google to view your tasks and manage your calendar sync.</p>
              <Button 
                onClick={() => window.location.href = `/auth/login?returnTo=${encodeURIComponent('/my-tasks')}`}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Sign in with Google
              </Button>
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
              <h3 className="text-lg font-medium text-gray-900 mb-2">Authentication Error</h3>
              <p className="text-gray-600">There was an error loading your account. Please try signing in again.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Find the team member record matching the current user's email
  const currentTeamMember = (teamMembers as any[]).find((member: any) => member.email === (user as any)?.email);

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
                Logged in as: {(user as any)?.email}
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
        
        <div className="grid gap-6">
          <CalendarSettings user={user} />
          <TeamMemberTasks 
            teamMemberId={currentTeamMember.id} 
            teamMemberName={currentTeamMember.name}
          />
        </div>
        
        <CalendarSyncDialog
          isOpen={showCalendarDialog}
          onClose={() => setShowCalendarDialog(false)}
        />
      </div>
    </div>
  );
}