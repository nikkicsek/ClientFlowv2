import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar, Settings, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface CalendarSyncDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CalendarSyncDialog({ isOpen, onClose }: CalendarSyncDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: calendarStatus, isLoading } = useQuery({
    queryKey: ["/api/user/calendar-status"],
    enabled: isOpen,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/auth/google/calendar");
      const data = await response.json();
      return data.authUrl;
    },
    onSuccess: (authUrl) => {
      window.open(authUrl, "_blank");
      onClose();
      toast({
        title: "Calendar Authorization",
        description: "Complete the authorization in the new window, then refresh this page.",
      });
    },
    onError: () => {
      toast({
        title: "Connection Failed",
        description: "Failed to start Google Calendar authorization",
        variant: "destructive",
      });
    },
  });

  const toggleSyncMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("POST", "/api/user/calendar-sync", { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/calendar-status"] });
      toast({
        title: "Settings Updated",
        description: "Calendar sync preference updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update calendar sync settings",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/user/calendar-access");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/calendar-status"] });
      toast({
        title: "Disconnected",
        description: "Google Calendar access has been revoked",
      });
    },
    onError: () => {
      toast({
        title: "Disconnect Failed",
        description: "Failed to disconnect Google Calendar",
        variant: "destructive",
      });
    },
  });

  const getStatusDisplay = () => {
    if (isLoading) return { text: "Loading...", color: "text-gray-500", icon: Settings };
    if (!calendarStatus?.hasTokens) return { text: "Not Connected", color: "text-red-600", icon: AlertCircle };
    if (calendarStatus?.enabled) return { text: "Active", color: "text-green-600", icon: CheckCircle2 };
    return { text: "Connected but Disabled", color: "text-yellow-600", icon: AlertCircle };
  };

  const status = getStatusDisplay();
  const StatusIcon = status.icon;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold">
                Google Calendar Integration
              </DialogTitle>
              <DialogDescription className="mt-1">
                Sync your assigned tasks to your Google Calendar
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Connection Status */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <StatusIcon className={`h-5 w-5 ${status.color}`} />
              <div>
                <p className="font-medium text-gray-900">Connection Status</p>
                <p className={`text-sm ${status.color}`}>{status.text}</p>
              </div>
            </div>
          </div>

          {/* Connection Controls */}
          {!calendarStatus?.hasTokens ? (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Connect Your Calendar</h4>
                <p className="text-sm text-blue-800 mb-3">
                  Connect your Google Calendar to automatically sync assigned tasks as calendar events.
                </p>
                <ul className="text-sm text-blue-800 space-y-1 mb-4">
                  <li>• Tasks will appear with due dates and descriptions</li>
                  <li>• Automatic reminders 24 hours and 1 hour before</li>
                  <li>• Updates sync when task details change</li>
                </ul>
              </div>
              
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="w-full"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                {connectMutation.isPending ? "Connecting..." : "Connect Google Calendar"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Sync Toggle */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label htmlFor="sync-enabled" className="font-medium">
                    Calendar Sync
                  </Label>
                  <p className="text-sm text-gray-600 mt-1">
                    Automatically sync new task assignments to calendar
                  </p>
                </div>
                <Switch
                  id="sync-enabled"
                  checked={calendarStatus?.enabled || false}
                  onCheckedChange={(enabled) => toggleSyncMutation.mutate(enabled)}
                  disabled={toggleSyncMutation.isPending}
                />
              </div>

              {/* Usage Info */}
              {calendarStatus?.enabled && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-800">
                    <CheckCircle2 className="h-4 w-4 inline mr-2" />
                    New task assignments will automatically appear in your Google Calendar.
                    You can manually sync existing tasks from the task details.
                  </p>
                </div>
              )}

              {/* Disconnect Option */}
              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect Calendar"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}