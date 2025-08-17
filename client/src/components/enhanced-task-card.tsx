import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Calendar, 
  Clock, 
  User, 
  AlertTriangle, 
  CheckCircle2, 
  PlayCircle,
  PauseCircle,
  ExternalLink,
  Edit3
} from "lucide-react";
import { TaskCalendarSync } from "./task-calendar-sync";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface EnhancedTaskCardProps {
  task: any;
  assignments?: any[];
  showProjectName?: boolean;
  onEdit?: (taskId: string) => void;
}

export function EnhancedTaskCard({ task, assignments = [], showProjectName = false, onEdit }: EnhancedTaskCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const statusConfig = {
    in_progress: { label: "In Progress", color: "bg-blue-500", icon: PlayCircle },
    completed: { label: "Completed", color: "bg-green-500", icon: CheckCircle2 },
    needs_approval: { label: "Needs Approval", color: "bg-yellow-500", icon: PauseCircle },
    outstanding: { label: "Outstanding", color: "bg-red-500", icon: AlertTriangle },
    pending: { label: "Pending", color: "bg-gray-500", icon: Clock },
  };

  const priorityConfig = {
    low: { label: "Low", color: "border-green-200 text-green-700" },
    medium: { label: "Medium", color: "border-yellow-200 text-yellow-700" },
    high: { label: "High", color: "border-orange-200 text-orange-700" },
    urgent: { label: "URGENT", color: "border-red-200 text-red-700 bg-red-50" },
  };

  const updateTaskMutation = useMutation({
    mutationFn: async (updates: { status?: string }) => {
      const response = await apiRequest("PUT", `/api/admin/tasks/${task.id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-assignments"] });
      toast({
        title: "Task Updated",
        description: "Task status updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Update Failed",
        description: "Failed to update task status",
        variant: "destructive",
      });
    },
  });

  const currentStatus = statusConfig[task.status as keyof typeof statusConfig];
  const currentPriority = priorityConfig[task.priority as keyof typeof priorityConfig];
  const StatusIcon = currentStatus?.icon || PlayCircle;

  const formatDate = (dateString: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    if (diffDays > 1) return `In ${diffDays} days`;
    if (diffDays < -1) return `${Math.abs(diffDays)} days ago`;
    
    return date.toLocaleDateString();
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <Card className="hover:shadow-md transition-all duration-200 border-l-4" style={{ borderLeftColor: currentStatus?.color.replace('bg-', '') || '#6b7280' }}>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header Row */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <StatusIcon className={`h-4 w-4 ${currentStatus?.color.replace('bg-', 'text-')} flex-shrink-0`} />
                <h3 className="font-medium text-gray-900 truncate">{task.title}</h3>
                {currentPriority && (
                  <Badge variant="outline" className={`text-xs ${currentPriority.color} flex-shrink-0`}>
                    {currentPriority.label}
                  </Badge>
                )}
              </div>
              
              {task.description && (
                <p className="text-sm text-gray-600 line-clamp-2">{task.description}</p>
              )}
            </div>
            
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(task.id)}
                className="flex-shrink-0 ml-2"
                title="Edit Task"
              >
                <Edit3 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Details Row */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              {/* Due Date */}
              {task.dueDate && (
                <div className="flex items-center gap-1 text-gray-600">
                  <Calendar className="h-3 w-3" />
                  <span className={`${new Date(task.dueDate) < new Date() ? 'text-red-600 font-medium' : ''}`}>
                    {formatDate(task.dueDate)}
                  </span>
                  {task.dueDate.includes('T') && (
                    <span className="text-gray-500">
                      {new Date(task.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              )}

              {/* Google Drive Link */}
              {task.googleDriveLink && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="p-1 h-auto text-blue-600"
                >
                  <a href={task.googleDriveLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              )}
            </div>

            {/* Status Control */}
            <div className="flex items-center gap-2">
              <Select
                value={task.status}
                onValueChange={(status) => updateTaskMutation.mutate({ status })}
                disabled={updateTaskMutation.isPending}
              >
                <SelectTrigger className="w-auto h-7 text-xs border-0 bg-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="needs_approval">Needs Approval</SelectItem>
                  <SelectItem value="outstanding">Outstanding</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assignments Row */}
          {assignments.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <User className="h-3 w-3 text-gray-500" />
                <div className="flex items-center gap-1">
                  {assignments.slice(0, 3).map((assignment, index) => (
                    <div
                      key={assignment.id}
                      className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                        assignment.isCompleted 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      <span>{assignment.teamMember?.name}</span>
                      {assignment.isCompleted && (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                    </div>
                  ))}
                  {assignments.length > 3 && (
                    <span className="text-xs text-gray-500">+{assignments.length - 3} more</span>
                  )}
                </div>
              </div>

              {/* Calendar Sync */}
              <TaskCalendarSync
                taskId={task.id}
                taskTitle={task.title}
                hasCalendarEvent={!!task.googleCalendarEventId}
                className="flex-shrink-0"
              />
            </div>
          )}

          {showProjectName && task.projectName && (
            <div className="pt-2 border-t border-gray-100">
              <span className="text-xs text-gray-500">Project: {task.projectName}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}