import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, Shield, Calendar, FileText, BarChart3, Settings, Mail } from "lucide-react";

export function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [devEmail, setDevEmail] = useState("");
  const [isDevLoading, setIsDevLoading] = useState(false);

  const handleLogin = () => {
    setIsLoading(true);
    window.location.href = "/auth/login?returnTo=/my-tasks";
  };

  const handleDevLogin = () => {
    if (!devEmail) return;
    setIsDevLoading(true);
    window.location.href = `/auth/dev/login?email=${encodeURIComponent(devEmail)}`;
  };

  const features = [
    { icon: Users, title: "Team Management", description: "Invite and manage agency team members" },
    { icon: FileText, title: "Project Tracking", description: "Comprehensive project and task management" },
    { icon: Calendar, title: "Calendar Sync", description: "Google Calendar integration for deadlines" },
    { icon: BarChart3, title: "Analytics", description: "Client reporting and performance metrics" },
    { icon: Shield, title: "Client Portal", description: "Secure client access to their projects" },
    { icon: Settings, title: "Workflow Automation", description: "Automated task creation and notifications" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center">
        {/* Left Side - Features */}
        <div className="space-y-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              AgencyPro
            </h1>
            <p className="text-xl text-gray-600 mb-6">
              Comprehensive project management platform designed for marketing agencies
            </p>
            <div className="flex gap-2 mb-8">
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                Team Collaboration
              </Badge>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Client Portal
              </Badge>
              <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                Analytics
              </Badge>
            </div>
          </div>

          <div className="grid gap-4">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-white/50 rounded-lg">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <feature.icon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side - Login Card */}
        <div className="flex justify-center">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Welcome Back</CardTitle>
              <CardDescription>
                Sign in to access your agency dashboard
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={handleLogin}
                disabled={isLoading}
                className="w-full h-12"
                size="lg"
              >
                {isLoading ? "Signing in..." : "Sign in with Google"}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700">Dev Email Login</label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="Enter email address"
                    value={devEmail}
                    onChange={(e) => setDevEmail(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleDevLogin();
                      }
                    }}
                  />
                  <Button 
                    onClick={handleDevLogin}
                    disabled={isDevLoading || !devEmail}
                    size="sm"
                    variant="outline"
                    className="px-3"
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  For non-Replit users: enter any email to create a dev account
                </p>
              </div>
              
              <div className="text-center text-sm text-gray-500">
                <p>New team member?</p>
                <p>Contact your agency admin for an invitation</p>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <div className="text-xs text-gray-400 text-center space-y-1">
                  <p><strong>Admin Access:</strong> Full dashboard, team management, all projects</p>
                  <p><strong>Client Access:</strong> View assigned projects and tasks only</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}