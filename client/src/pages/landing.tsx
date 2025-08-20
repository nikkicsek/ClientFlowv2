import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";
import { DebugAuthStatus } from "@/components/debug-auth-status";
import { AdminLoginHelper } from "@/components/admin-login-helper";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export default function Landing() {
  const { toast } = useToast();

  // Check for calendar connection status from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const calendarStatus = urlParams.get('calendar');
    
    if (calendarStatus === 'connected') {
      toast({
        title: "Calendar Connected!",
        description: "Your Google Calendar has been successfully connected. Sign in to manage your tasks.",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/');
    } else if (calendarStatus === 'error') {
      const reason = urlParams.get('reason');
      let description = "There was an error connecting your Google Calendar. Please try again after signing in.";
      if (reason === 'missing_params') {
        description = "Missing authorization parameters. Please try the calendar connection again.";
      } else if (reason === 'callback_failed') {
        description = "Calendar authorization failed. Please check your Google account permissions.";
      }
      toast({
        title: "Calendar Connection Failed",
        description,
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/');
    }
  }, [toast]);

  const handleSignIn = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-6">
        <Card className="w-full max-w-md mx-auto">
          <CardContent className="p-12">
            <div className="text-center mb-8">
              <div className="flex items-center justify-center mb-4">
                <BarChart3 className="h-8 w-8 text-blue-600 mr-2" />
                <h1 className="text-2xl font-bold text-gray-900">AgencyPro</h1>
              </div>
              <p className="text-gray-600">Sign in to access your project dashboard</p>
            </div>
            
            <Button 
              onClick={handleSignIn}
              className="w-100 mb-6 bg-blue-600 hover:bg-blue-700"
              size="lg"
            >
              Sign In
            </Button>
            
            <div className="text-center">
              <p className="text-sm text-gray-500">
                New client? Contact your account manager for access.
              </p>
            </div>
          </CardContent>
        </Card>
        
        <AdminLoginHelper />
      </div>
    </div>
  );
}
