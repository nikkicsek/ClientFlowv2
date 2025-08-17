import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Shield, Crown } from "lucide-react";

interface AdminUpgradeButtonProps {
  userRole?: string;
}

export function AdminUpgradeButton({ userRole }: AdminUpgradeButtonProps) {
  const [isUpgrading, setIsUpgrading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleUpgrade = async () => {
    setIsUpgrading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/upgrade-to-admin");
      
      // Refresh user data
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      
      toast({
        title: "Success!",
        description: "You now have admin access. The page will refresh.",
      });
      
      // Refresh the page to update the UI
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to upgrade to admin",
        variant: "destructive",
      });
    } finally {
      setIsUpgrading(false);
    }
  };

  // Don't show if already admin
  if (userRole === 'admin') {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Crown className="h-8 w-8 text-green-600" />
            <Badge variant="default" className="bg-green-600">Admin Access</Badge>
          </div>
          <h3 className="text-lg font-semibold text-green-800 mb-2">Admin Dashboard Active</h3>
          <p className="text-green-700">You have full access to all admin features</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          Get Admin Access
        </CardTitle>
        <CardDescription>
          Upgrade your account to access the full admin dashboard with team management, 
          project creation, and all administrative features.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            <p><strong>Current Role:</strong> <Badge variant="secondary">{userRole || 'Client'}</Badge></p>
            <p><strong>After Upgrade:</strong> <Badge variant="default" className="bg-blue-600">Admin</Badge></p>
          </div>
          
          <Button 
            onClick={handleUpgrade}
            disabled={isUpgrading}
            className="w-full"
          >
            {isUpgrading ? "Upgrading..." : "Upgrade to Admin Access"}
          </Button>
          
          <div className="text-xs text-gray-500">
            <p><strong>Admin Features Include:</strong></p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Full project and task management</li>
              <li>Team member invitations and management</li>
              <li>Client account management</li>
              <li>Service category management</li>
              <li>Analytics and reporting access</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}