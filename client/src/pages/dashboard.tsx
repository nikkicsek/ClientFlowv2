import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/sidebar";
import ProjectOverview from "@/components/project-overview";
import TasksSection from "@/components/tasks-section";
import AnalyticsSection from "@/components/analytics-section";
import FilesSection from "@/components/files-section";
import UpdatesSection from "@/components/updates-section";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

export default function Dashboard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const renderActiveSection = () => {
    switch (activeSection) {
      case "overview":
        return <ProjectOverview />;
      case "tasks":
        return <TasksSection />;
      case "analytics":
        return <AnalyticsSection />;
      case "files":
        return <FilesSection />;
      case "updates":
        return <UpdatesSection />;
      default:
        return <ProjectOverview />;
    }
  };

  const getSectionTitle = () => {
    const titles = {
      overview: "Project Overview",
      tasks: "Tasks & Services",
      analytics: "Analytics & Reports",
      files: "Project Files",
      updates: "Updates & Messages",
    };
    return titles[activeSection as keyof typeof titles] || "Dashboard";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        collapsed={sidebarCollapsed}
        user={user}
      />
      
      <div className={`transition-all duration-300 ${sidebarCollapsed ? "ml-0" : "ml-72"}`}>
        {/* Top Navigation */}
        <nav className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSidebar}
                className="md:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-semibold text-gray-900">
                {getSectionTitle()}
              </h1>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm text-gray-500">Last updated: Today, 2:30 PM</p>
              </div>
              <div className="flex items-center gap-2">
                <img
                  src={user.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.firstName || 'U')}&background=1976d2&color=fff`}
                  alt="Profile"
                  className="w-8 h-8 rounded-full object-cover"
                />
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{user.companyName}</p>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="p-6">
          {renderActiveSection()}
        </main>
      </div>
    </div>
  );
}
