import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarCheck, CalendarX, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TaskCalendarSyncProps {
  taskId: string;
  taskTitle: string;
  hasCalendarEvent?: boolean;
  className?: string;
}

export function TaskCalendarSync({ 
  taskId, 
  taskTitle, 
  hasCalendarEvent = false, 
  className = "" 
}: TaskCalendarSyncProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check if user has calendar sync available
  const { data: calendarStatus } = useQuery({
    queryKey: ["/api/user/calendar-status"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/tasks/${taskId}/sync-calendar`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-assignments"] });
      toast({
        title: "Task Synced",
        description: `"${taskTitle}" has been added to your Google Calendar`,
      });
    },
    onError: () => {
      toast({
        title: "Sync Failed",
        description: "Failed to sync task to Google Calendar",
        variant: "destructive",
      });
    },
  });

  const unsyncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/tasks/${taskId}/sync-calendar`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-assignments"] });
      toast({
        title: "Sync Removed",
        description: `"${taskTitle}" has been removed from your Google Calendar`,
      });
    },
    onError: () => {
      toast({
        title: "Remove Failed",
        description: "Failed to remove task from Google Calendar",
        variant: "destructive",
      });
    },
  });

  const manualSyncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/tasks/${taskId}/sync-calendar`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-assignments"] });
      toast({
        title: "Calendar Synced",
        description: `"${taskTitle}" calendar event updated successfully`,
      });
    },
    onError: () => {
      toast({
        title: "Sync Failed", 
        description: "Failed to sync task calendar",
        variant: "destructive",
      });
    },
  });

  // Don't show if calendar sync is not available
  if (!calendarStatus?.available) {
    return null;
  }

  const isLoading = syncMutation.isPending || unsyncMutation.isPending || manualSyncMutation.isPending;

  if (hasCalendarEvent) {
    return (
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => unsyncMutation.mutate()}
          disabled={isLoading}
          className={`text-green-600 hover:text-green-700 hover:bg-green-50 ${className}`}
          title="Remove from Google Calendar"
        >
          <CalendarCheck className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => manualSyncMutation.mutate()}
          disabled={isLoading}
          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          title="Sync to Google Calendar"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => syncMutation.mutate()}
        disabled={isLoading}
        className={`text-gray-600 hover:text-blue-600 hover:bg-blue-50 ${className}`}
        title="Add to Google Calendar"
      >
        <Calendar className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => manualSyncMutation.mutate()}
        disabled={isLoading}
        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
        title="Sync to Google Calendar"
      >
        <RefreshCw className="h-3 w-3" />
      </Button>
    </div>
  );
}