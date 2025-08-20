import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Shield, Crown, LogIn, Database, Calendar, Users, Building2, CheckSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function AdminLoginHelper() {
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isCreatingData, setIsCreatingData] = useState(false);
  const { toast } = useToast();

  const { data: user, error: userError, refetch: refetchUser } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: organizations } = useQuery({
    queryKey: ["/api/admin/organizations"],
    enabled: (user as any)?.role === 'admin',
    retry: false,
  });

  const { data: projects } = useQuery({
    queryKey: ["/api/admin/projects"], 
    enabled: (user as any)?.role === 'admin',
    retry: false,
  });

  const { data: tasks } = useQuery({
    queryKey: ["/api/admin/tasks"],
    enabled: (user as any)?.role === 'admin', 
    retry: false,
  });

  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      await apiRequest("POST", "/api/auth/upgrade-to-admin");
      toast({
        title: "Success!",
        description: "Upgraded to admin. Refreshing...",
      });
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to upgrade",
        variant: "destructive",
      });
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleCreateTestData = async () => {
    setIsCreatingData(true);
    try {
      // Create test organization
      const org = await apiRequest("POST", "/api/admin/organizations", {
        name: "Test Agency Client",
        email: "test@testagency.com",
        phone: "555-0123"
      }) as any;

      // Create test project
      const project = await apiRequest("POST", "/api/admin/projects", {
        name: "Test Project - Website Redesign",
        description: "Complete website redesign and development project for testing",
        status: "active",
        organizationId: org.id,
        startDate: new Date().toISOString().split('T')[0]
      }) as any;

      // Create test tasks
      await apiRequest("POST", `/api/projects/${project.id}/tasks`, {
        title: "Design Homepage Mockup", 
        description: "Create initial homepage design mockup for client review",
        status: "in_progress",
        priority: "high",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 week from now
        dueTime: "2:00 PM"
      });

      await apiRequest("POST", `/api/projects/${project.id}/tasks`, {
        title: "Develop Contact Form",
        description: "Build responsive contact form with validation",
        status: "pending", 
        priority: "medium",
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 weeks from now
        dueTime: "4:30 PM"
      });

      toast({
        title: "Test Data Created!",
        description: "Created organization, project, and tasks for testing",
      });

      // Refresh data
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (error: any) {
      toast({
        title: "Error Creating Test Data", 
        description: error.message || "Failed to create test data",
        variant: "destructive",
      });
    } finally {
      setIsCreatingData(false);
    }
  };

  const isAuthenticated = !userError && user;
  const isAdmin = (user as any)?.role === 'admin';
  const hasData = (organizations as any)?.length > 0 || (projects as any)?.length > 0 || (tasks as any)?.length > 0;

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Admin Dashboard Setup Helper
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Authentication Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <h3 className="font-medium flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              Authentication Status
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Signed In:</span>
                <Badge variant={isAuthenticated ? "default" : "destructive"}>
                  {isAuthenticated ? "Yes" : "No"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Admin Role:</span>
                <Badge variant={isAdmin ? "default" : "secondary"}>
                  {isAdmin ? "Yes" : "No"}
                </Badge>
              </div>
              {user && (
                <div className="text-sm text-gray-600">
                  Signed in as: <strong>{(user as any).email}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Data Status
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Organizations:</span>
                <Badge variant="outline">{(organizations as any)?.length || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Projects:</span>
                <Badge variant="outline">{(projects as any)?.length || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Tasks:</span>
                <Badge variant="outline">{(tasks as any)?.length || 0}</Badge>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Action Buttons */}
        <div className="space-y-4">
          <h3 className="font-medium">Quick Actions</h3>
          <div className="flex flex-wrap gap-3">
            {!isAuthenticated ? (
              <Button onClick={handleLogin} className="flex items-center gap-2">
                <LogIn className="h-4 w-4" />
                Sign In with Replit
              </Button>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => refetchUser()}
                  size="sm"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Status
                </Button>
                {!isAdmin && (
                  <Button 
                    onClick={handleUpgrade}
                    disabled={isUpgrading}
                    className="flex items-center gap-2"
                  >
                    <Crown className="h-4 w-4" />
                    {isUpgrading ? "Upgrading..." : "Upgrade to Admin"}
                  </Button>
                )}
                {isAdmin && !hasData && (
                  <Button 
                    onClick={handleCreateTestData}
                    disabled={isCreatingData}
                    className="flex items-center gap-2"
                    variant="default"
                  >
                    <Database className="h-4 w-4" />
                    {isCreatingData ? "Creating..." : "Create Test Data"}
                  </Button>
                )}
                {isAdmin && (
                  <Button 
                    variant="outline"
                    onClick={() => window.location.href = "/"}
                    className="flex items-center gap-2"
                  >
                    <Shield className="h-4 w-4" />
                    Go to Admin Dashboard
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Feature Guide */}
        {isAdmin && (
          <>
            <Separator />
            <div className="space-y-3">
              <h3 className="font-medium">Test Features Available</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  <span>Create/Edit Organizations</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>Manage Projects</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4" />
                  <span>Create/Edit Tasks</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>Google Calendar Sync</span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}