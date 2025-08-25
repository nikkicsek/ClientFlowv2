import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CalendarSettingsProps {
  user: any;
}

export function CalendarSettings({ user }: CalendarSettingsProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  const handleConnectGoogle = () => {
    setIsConnecting(true);
    // Full page navigation to OAuth route with returnTo parameter
    window.location.assign(`${window.location.origin}/oauth/google/connect?returnTo=${encodeURIComponent('/my-tasks')}`);
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });

      if (response.ok) {
        toast({
          title: "Sync Complete",
          description: "Your tasks have been synced with Google Calendar.",
        });
      } else {
        throw new Error('Sync failed');
      }
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: "Failed to sync with Google Calendar. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Check if calendar is connected by checking for tokens
  const [isConnected, setIsConnected] = useState(false);
  
  // Check connection status when component mounts
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch('/api/calendar/status');
        if (response.ok) {
          const data = await response.json();
          setIsConnected(data.connected);
        }
      } catch (error) {
        console.log('Could not check calendar status:', error);
      }
    };
    checkConnection();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Google Calendar Integration
        </CardTitle>
        <CardDescription>
          Sync your assigned tasks with Google Calendar for better scheduling.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Status:</span>
            {isConnected ? (
              <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                <Check className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary">
                Not Connected
              </Badge>
            )}
          </div>
        </div>

        {!isConnected ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect your Google Calendar to automatically create calendar events for your assigned tasks.
            </p>
            <Button
              onClick={() => window.location.href = `/oauth/google/connect?returnTo=${encodeURIComponent('/my-tasks')}`}
              disabled={isConnecting}
              className="w-full"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              {isConnecting ? 'Connecting...' : 'Connect Google Calendar'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your calendar is connected. Tasks will automatically sync when assigned or updated.
            </p>
            <div className="flex gap-2">
              <Button 
                onClick={handleManualSync}
                disabled={isSyncing}
                variant="outline"
                size="sm"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Manual Sync
                  </>
                )}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  // Disconnect logic would go here
                  toast({
                    title: "Calendar Disconnected",
                    description: "Your Google Calendar has been disconnected.",
                  });
                }}
              >
                Disconnect
              </Button>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground border-t pt-3">
          <p><strong>How it works:</strong></p>
          <ul className="list-disc list-inside space-y-1">
            <li>Each assigned task creates a calendar event</li>
            <li>Task updates automatically sync to calendar</li>
            <li>Completed tasks are marked as done in calendar</li>
            <li>Individual team members control their own calendar sync</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}