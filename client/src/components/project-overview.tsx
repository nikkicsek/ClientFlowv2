import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Calendar, DollarSign, Target, Clock, CheckCircle, Upload, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Project, Task } from "@shared/schema";

export default function ProjectOverview() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
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
    },
  });

  const activeProject = projects?.[0]; // For now, show the first project

  const { data: tasks } = useQuery({
    queryKey: ["/api/projects", activeProject?.id, "tasks"],
    enabled: !!activeProject?.id,
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
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
    },
  });

  if (projectsLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500 mb-4">
          <Target className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No Active Projects</h3>
          <p>You don't have any active projects at the moment.</p>
        </div>
      </div>
    );
  }

  const completedTasks = tasks?.filter(task => task.status === 'completed').length || 0;
  const totalTasks = tasks?.length || 0;
  const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'in_progress': return 'secondary';
      case 'needs_approval': return 'destructive';
      case 'outstanding': return 'destructive';
      default: return 'secondary';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'in_progress': return 'In Progress';
      case 'needs_approval': return 'Needs Approval';
      case 'outstanding': return 'Outstanding';
      case 'needs_clarification': return 'Needs Clarification';
      default: return status;
    }
  };

  const recentActivities = [
    {
      title: "Project progress updated",
      timestamp: "2 hours ago",
      icon: CheckCircle,
      type: "success"
    },
    {
      title: "New files uploaded for review",
      timestamp: "1 day ago",
      icon: Upload,
      type: "info"
    }
  ];

  return (
    <div className="space-y-6">
      {/* Main Project Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {activeProject.name}
                  </h2>
                  <p className="text-gray-600 mb-6">
                    {activeProject.description}
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="flex items-center justify-center text-blue-600 mb-1">
                        <Calendar className="h-4 w-4 mr-1" />
                        <span className="font-semibold">
                          {activeProject.startDate 
                            ? new Date(activeProject.startDate).toLocaleDateString()
                            : 'Not set'
                          }
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">Start Date</p>
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-center text-green-600 mb-1">
                        <Target className="h-4 w-4 mr-1" />
                        <span className="font-semibold">
                          {activeProject.expectedCompletion
                            ? new Date(activeProject.expectedCompletion).toLocaleDateString()
                            : 'Not set'
                          }
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">Expected Completion</p>
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-center text-orange-600 mb-1">
                        <DollarSign className="h-4 w-4 mr-1" />
                        <span className="font-semibold">
                          {activeProject.budget 
                            ? `$${Number(activeProject.budget).toLocaleString()}`
                            : 'Not set'
                          }
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">Project Budget</p>
                    </div>
                  </div>
                </div>
                
                <div className="text-center lg:text-right">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r from-green-400 to-green-600 text-white font-bold text-lg mb-3">
                    {progressPercentage}%
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Overall Progress</p>
                    <p className="text-sm text-gray-500">
                      {completedTasks} of {totalTasks} tasks completed
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Quick Stats */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">{completedTasks}</div>
              <div className="text-sm text-gray-600 mb-3">Tasks Completed</div>
              <Progress value={progressPercentage} className="h-2" />
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-3xl font-bold text-orange-600 mb-2">
                {tasks?.filter(task => task.status === 'needs_approval').length || 0}
              </div>
              <div className="text-sm text-gray-600 mb-3">Pending Approvals</div>
              <Button variant="outline" size="sm" className="w-full">
                <Check className="h-4 w-4 mr-2" />
                Review
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recentActivities.map((activity, index) => {
              const Icon = activity.icon;
              return (
                <div key={index} className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                  <div className={cn(
                    "p-2 rounded-full",
                    activity.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{activity.title}</p>
                    <p className="text-sm text-gray-500">{activity.timestamp}</p>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Latest Tasks Preview */}
          {tasks && tasks.length > 0 && (
            <div className="mt-6">
              <h4 className="font-medium text-gray-900 mb-3">Latest Tasks</h4>
              <div className="space-y-2">
                {tasks.slice(0, 3).map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{task.title}</p>
                      <p className="text-sm text-gray-500">{task.description}</p>
                    </div>
                    <Badge variant={getStatusBadgeVariant(task.status)}>
                      {getStatusLabel(task.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
