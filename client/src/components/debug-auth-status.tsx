import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { User, Shield, LogIn, Crown } from "lucide-react";
import { useState } from "react";

export function DebugAuthStatus() {
  const [isUpgrading, setIsUpgrading] = useState(false);
  const { toast } = useToast();
  
  const { data: user, error: userError, refetch: refetchUser } = useQuery({
    queryKey: ["/api/auth/user"],
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

  const isAuthenticated = !userError && user;
  const isAdmin = user?.role === 'admin';

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Authentication Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Authentication Status */}
          <div className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              Authentication
            </h3>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status:</span>
                <Badge variant={isAuthenticated ? "default" : "destructive"}>
                  {isAuthenticated ? "Authenticated" : "Not Authenticated"}
                </Badge>
              </div>
              {userError && (
                <div className="text-xs text-red-600">
                  Error: {(userError as any)?.message || "Authentication failed"}
                </div>
              )}
            </div>
          </div>

          {/* User Info */}
          <div className="space-y-2">
            <h3 className="font-medium flex items-center gap-2">
              <Crown className="h-4 w-4" />
              User Info
            </h3>
            <div className="space-y-1">
              {user ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Role:</span>
                    <Badge variant={isAdmin ? "default" : "secondary"}>
                      {user.role || "client"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Email:</span>
                    <span className="text-sm">{user.email}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Name:</span>
                    <span className="text-sm">{user.firstName} {user.lastName}</span>
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-500">No user data available</div>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t pt-4">
          <div className="flex flex-wrap gap-2">
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
                <Button 
                  variant="outline"
                  onClick={() => window.location.href = "/api/logout"}
                  size="sm"
                >
                  Sign Out
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Debug Info */}
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700">Debug Info</summary>
          <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-auto">
            {JSON.stringify({ 
              user, 
              userError: userError ? (userError as any).message : null,
              isAuthenticated,
              isAdmin 
            }, null, 2)}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}