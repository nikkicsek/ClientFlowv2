import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";
import { DebugAuthStatus } from "@/components/debug-auth-status";

export default function Landing() {
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
        
        <DebugAuthStatus />
      </div>
    </div>
  );
}
