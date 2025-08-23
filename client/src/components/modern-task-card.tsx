import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Calendar, 
  Clock, 
  MoreHorizontal,
  CheckCircle2, 
  AlertCircle,
  Timer,
  ExternalLink,
  User
} from "lucide-react";
import { TaskCalendarSync } from "./task-calendar-sync";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ModernTaskCardProps {
  task: any;
  assignments?: any[];
  showProjectName?: boolean;
  onEdit?: (taskId: string) => void;
}

export function ModernTaskCard({ task, assignments = [], showProjectName = false, onEdit }: ModernTaskCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const statusConfig = {
    in_progress: { 
      label: "In Progress", 
      color: "bg-blue-100 text-blue-800 border-blue-200", 
      icon: Timer,
      dotColor: "bg-blue-500"
    },
    completed: { 
      label: "Completed", 
      color: "bg-green-100 text-green-800 border-green-200", 
      icon: CheckCircle2,
      dotColor: "bg-green-500"
    },
    needs_approval: { 
      label: "Review", 
      color: "bg-yellow-100 text-yellow-800 border-yellow-200", 
      icon: AlertCircle,
      dotColor: "bg-yellow-500"
    },
    outstanding: { 
      label: "Blocked", 
      color: "bg-red-100 text-red-800 border-red-200", 
      icon: AlertCircle,
      dotColor: "bg-red-500"
    },
    pending: { 
      label: "Pending", 
      color: "bg-gray-100 text-gray-700 border-gray-200", 
      icon: Clock,
      dotColor: "bg-gray-400"
    },
  };

  const priorityConfig = {
    low: { label: "Low", color: "text-gray-600", dotColor: "bg-gray-400" },
    medium: { label: "Medium", color: "text-blue-600", dotColor: "bg-blue-500" },
    high: { label: "High", color: "text-orange-600", dotColor: "bg-orange-500" },
    urgent: { label: "Urgent", color: "text-red-600", dotColor: "bg-red-500" },
  };

  const updateTaskMutation = useMutation({
    mutationFn: async (updates: { status?: string }) => {
      const response = await apiRequest("PUT", `/api/tasks/${task.id}`, updates);
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

  const formatDueDate = (dateString: string) => {
    if (!dateString) return null;
    
    // Handle different date formats from API
    let date;
    if (dateString.includes('T') && dateString.includes('Z')) {
      // ISO format from API: "2025-08-29T13:00:00.000Z"
      const dateStr = dateString.replace('Z', '');
      date = new Date(dateStr);
    } else if (dateString.includes(' ') && !dateString.includes('T')) {
      // PostgreSQL format: "2025-08-29 13:00:00"
      date = new Date(dateString.replace(' ', 'T'));
    } else {
      date = new Date(dateString);
    }
    
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return { text: "Today", urgent: true };
    if (diffDays === 1) return { text: "Tomorrow", urgent: true };
    if (diffDays === -1) return { text: "Yesterday", overdue: true };
    if (diffDays > 1 && diffDays <= 3) return { text: `${diffDays} days`, urgent: true };
    if (diffDays < -1) return { text: `${Math.abs(diffDays)} days overdue`, overdue: true };
    
    return { text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), normal: true };
  };

  const dueInfo = task.dueDate ? formatDueDate(task.dueDate) : null;

  return (
    <Card className="group hover:shadow-lg transition-all duration-200 border-0 shadow-sm bg-white">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              {/* Status Dot */}
              <div className={`w-2 h-2 rounded-full mt-2 ${currentStatus?.dotColor}`} />
              
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-1 group-hover:text-blue-600 transition-colors">
                  {task.title}
                </h3>
                
                {showProjectName && task.project?.name && (
                  <p className="text-xs text-gray-500 mb-1">
                    {task.project.name}
                  </p>
                )}
                
                {task.description && (
                  <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                    {task.description}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {task.googleDriveLink && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="h-7 w-7 p-0"
                >
                  <a href={task.googleDriveLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              )}
              
              {onEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(task.id)}
                  className="h-7 w-7 p-0"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Meta Information */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              {/* Priority */}
              <div className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${currentPriority?.dotColor}`} />
                <span className={`font-medium ${currentPriority?.color}`}>
                  {currentPriority?.label}
                </span>
              </div>

              {/* Due Date */}
              {dueInfo && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-gray-400" />
                  <span className={`${
                    dueInfo.overdue ? 'text-red-600 font-medium' :
                    dueInfo.urgent ? 'text-orange-600 font-medium' :
                    'text-gray-600'
                  }`}>
                    {dueInfo.text}
                  </span>
                  {task.dueDate && (
                    <span className="text-gray-500 ml-1">
                      {(() => {
                        // Handle different date formats from API
                        let date;
                        
                        if (task.dueDate.includes('T') && task.dueDate.includes('Z')) {
                          // ISO format from API: "2025-08-29T13:00:00.000Z"
                          // This is UTC, but we want to display the time as-is (not convert timezone)
                          const dateStr = task.dueDate.replace('Z', '');
                          date = new Date(dateStr);
                        } else if (task.dueDate.includes(' ') && !task.dueDate.includes('T')) {
                          // PostgreSQL format: "2025-08-29 13:00:00"
                          date = new Date(task.dueDate.replace(' ', 'T'));
                        } else {
                          date = new Date(task.dueDate);
                        }
                        
                        return date.toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          hour12: true 
                        });
                      })()}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Status & Quick Actions */}
            <div className="flex items-center gap-2">
              <TaskCalendarSync
                taskId={task.id}
                taskTitle={task.title}
                hasCalendarEvent={!!task.googleCalendarEventId}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              />
              
              <Select
                value={task.status}
                onValueChange={(status) => updateTaskMutation.mutate({ status })}
                disabled={updateTaskMutation.isPending}
              >
                <SelectTrigger className="h-6 w-auto border-0 bg-transparent text-xs px-2">
                  <Badge 
                    variant="secondary" 
                    className={`text-xs border ${currentStatus?.color}`}
                  >
                    {currentStatus?.label}
                  </Badge>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="needs_approval">Review</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="outstanding">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Team Assignments */}
          {assignments.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1">
                  {assignments.slice(0, 3).map((assignment, index) => (
                    <div
                      key={assignment.id}
                      className="relative"
                    >
                      <Avatar className="h-6 w-6 border-2 border-white">
                        <AvatarFallback className={`text-xs ${
                          assignment.isCompleted 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {assignment.teamMember?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      {assignment.isCompleted && (
                        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full flex items-center justify-center">
                          <CheckCircle2 className="h-2 w-2 text-white" />
                        </div>
                      )}
                    </div>
                  ))}
                  {assignments.length > 3 && (
                    <div className="h-6 w-6 bg-gray-100 rounded-full border-2 border-white flex items-center justify-center">
                      <span className="text-xs text-gray-600">+{assignments.length - 3}</span>
                    </div>
                  )}
                </div>
                
                <div className="text-xs text-gray-500">
                  {assignments.filter(a => a.isCompleted).length}/{assignments.length} complete
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
