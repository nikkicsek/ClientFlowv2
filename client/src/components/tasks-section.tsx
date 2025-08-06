import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Palette, Code, Megaphone, BarChart3, Filter } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Task } from "@shared/schema";

export default function TasksSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: projects } = useQuery({
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

  const activeProject = projects?.[0];

  const { data: tasks, isLoading } = useQuery({
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

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

  const getTasksByCategory = (category: string) => {
    if (!tasks) return [];
    return tasks.filter(task => task.service?.category === category);
  };

  const getAllTasks = () => tasks || [];
  const getNeedsActionTasks = () => {
    if (!tasks) return [];
    return tasks.filter(task => 
      task.status === 'needs_approval' || 
      task.status === 'outstanding' || 
      task.status === 'needs_clarification'
    );
  };

  const taskCategories = [
    {
      id: 'design',
      title: 'Design & Branding',
      icon: Palette,
      tasks: getTasksByCategory('design')
    },
    {
      id: 'development',
      title: 'Development & SEO',
      icon: Code,
      tasks: getTasksByCategory('development')
    },
    {
      id: 'marketing',
      title: 'Marketing & Content',
      icon: Megaphone,
      tasks: getTasksByCategory('marketing')
    },
    {
      id: 'analytics',
      title: 'Analytics & Strategy',
      icon: BarChart3,
      tasks: getTasksByCategory('analytics')
    }
  ];

  const TaskCard = ({ task }: { task: Task }) => (
    <div className={`p-4 border-l-4 rounded-lg bg-white shadow-sm mb-3 ${
      task.status === 'completed' ? 'border-l-green-500' :
      task.status === 'in_progress' ? 'border-l-blue-500' :
      task.status === 'needs_approval' ? 'border-l-orange-500' :
      'border-l-red-500'
    }`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 mb-1">{task.title}</h4>
          <p className="text-sm text-gray-600 mb-2">{task.description}</p>
          {task.dueDate && (
            <p className="text-xs text-gray-500">
              Due: {new Date(task.dueDate).toLocaleDateString()}
            </p>
          )}
        </div>
        <Badge variant={getStatusBadgeVariant(task.status)}>
          {getStatusLabel(task.status)}
        </Badge>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tasks & Services</h2>
          <p className="text-gray-600">Track progress across all project deliverables</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="all">All Tasks</TabsTrigger>
          <TabsTrigger value="action">Needs Action</TabsTrigger>
        </TabsList>
        
        <TabsContent value="all" className="space-y-6">
          {!tasks || tasks.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-gray-500">
                  <Code className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No Tasks Available</h3>
                  <p>Tasks will appear here once your project begins.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {taskCategories.map((category) => {
                const Icon = category.icon;
                return (
                  <Card key={category.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-blue-600">
                        <Icon className="h-5 w-5" />
                        {category.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {category.tasks.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">No tasks in this category</p>
                      ) : (
                        <div className="space-y-3">
                          {category.tasks.map((task) => (
                            <TaskCard key={task.id} task={task} />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="action" className="space-y-6">
          {getNeedsActionTasks().length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="text-gray-500">
                  <BarChart3 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">No Action Required</h3>
                  <p>All tasks are progressing smoothly!</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Tasks Requiring Your Attention</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {getNeedsActionTasks().map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
