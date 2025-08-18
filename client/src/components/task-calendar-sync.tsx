import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Calendar, ExternalLink, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface TaskCalendarSyncProps {
  taskId: string;
  className?: string;
}

interface SyncResult {
  ok: boolean;
  eventId?: string;
  htmlLink?: string;
  startLocalISO?: string;
  error?: string;
}

export function TaskCalendarSync({ taskId, className }: TaskCalendarSyncProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSyncNow = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", `/api/tasks/${taskId}/sync-calendar`);
      const result: SyncResult = await response.json();

      if (result.ok && result.htmlLink) {
        toast({
          title: "Calendar synced!",
          description: (
            <div className="flex items-center gap-2">
              <span>Event created successfully</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(result.htmlLink, '_blank')}
                className="h-6 text-xs"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Open in Google Calendar
              </Button>
            </div>
          ),
          duration: 5000,
        });
      } else {
        toast({
          title: "Sync failed",
          description: result.error || "Unable to sync with calendar",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Sync error",
        description: "Failed to communicate with calendar service",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSyncNow}
      disabled={isLoading}
      size="sm"
      variant="outline"
      className={className}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Calendar className="h-4 w-4 mr-2" />
      )}
      {isLoading ? "Syncing..." : "Sync Calendar"}
    </Button>
  );
}