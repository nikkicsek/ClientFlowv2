import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Home, 
  CheckSquare, 
  BarChart3, 
  Folder, 
  MessageSquare, 
  LogOut,
  BarChart,
  Upload
} from "lucide-react";
import type { User } from "@shared/schema";

interface SidebarProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
  collapsed: boolean;
  user: User;
}

const navigation = [
  { id: "overview", label: "Project Overview", icon: Home },
  { id: "tasks", label: "Tasks & Services", icon: CheckSquare },
  { id: "analytics", label: "Analytics & Reports", icon: BarChart3 },
  { id: "files", label: "Project Files", icon: Folder },
  { id: "updates", label: "Updates & Messages", icon: MessageSquare },
  { id: "quotes", label: "Quote Upload", icon: Upload },
];

export default function Sidebar({ activeSection, setActiveSection, collapsed, user }: SidebarProps) {
  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <div className={cn(
      "fixed top-0 left-0 h-screen bg-gradient-to-b from-blue-600 to-blue-700 text-white transition-transform duration-300 z-50",
      "w-72",
      collapsed && "-translate-x-full md:translate-x-0"
    )}>
      <div className="p-6">
        <div className="flex items-center gap-2 mb-2">
          <BarChart className="h-8 w-8" />
          <h2 className="text-xl font-bold">AgencyPro</h2>
        </div>
        <p className="text-blue-100 text-sm">Client Dashboard</p>
      </div>

      <nav className="px-4 space-y-2">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          
          return (
            <Button
              key={item.id}
              variant="ghost"
              className={cn(
                "w-full justify-start text-white hover:bg-white/10 transition-colors",
                isActive && "bg-white/10"
              )}
              onClick={() => setActiveSection(item.id)}
            >
              <Icon className="h-5 w-5 mr-3" />
              {item.label}
            </Button>
          );
        })}
      </nav>

      <div className="absolute bottom-0 left-0 right-0 p-6">
        <div className="text-blue-100 mb-4">
          <p className="font-medium text-white">{user.firstName} {user.lastName}</p>
          <p className="text-sm">{user.companyName}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full text-white border-white/20 hover:bg-white/10"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
