import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Users, Crown, Eye } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export function DashboardToggle() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  
  const isAdmin = user?.role === 'admin';
  const isOnAdminDashboard = location === '/' || location === '/admin';
  const isOnClientView = location === '/client-view';

  if (!isAdmin) {
    return null; // Only show toggle for admin users
  }

  return (
    <Card className="w-full max-w-md mx-auto mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Settings className="h-4 w-4" />
          Dashboard View
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button
            variant={isOnAdminDashboard ? "default" : "outline"}
            size="sm"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 flex-1"
          >
            <Crown className="h-4 w-4" />
            Agency Dashboard
            {isOnAdminDashboard && <Badge variant="secondary" className="ml-1">Active</Badge>}
          </Button>
          <Button
            variant={isOnClientView ? "default" : "outline"}
            size="sm"
            onClick={() => navigate('/client-view')}
            className="flex items-center gap-2 flex-1"
          >
            <Eye className="h-4 w-4" />
            Client View
            {isOnClientView && <Badge variant="secondary" className="ml-1">Active</Badge>}
          </Button>
        </div>
        <div className="text-xs text-gray-500 mt-2 text-center">
          Toggle between agency management and client experience views
        </div>
      </CardContent>
    </Card>
  );
}