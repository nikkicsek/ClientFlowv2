import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { Users, X, Calendar, Clock } from "lucide-react";
import type { TeamMember } from "@shared/schema";
import { getUserTimezone } from "@/utils/timeFormatting";
import { extractTaskDateTime, adaptFormDataToAPI, isValidTimeFormat } from "@/utils/dateTimeUtils";


interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId?: string;
  organizationId?: string;
  mode?: 'create' | 'edit';
  task?: any;
  onTaskUpdated?: () => void;
}

export default function CreateTaskModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  projectId, 
  organizationId, 
  mode = 'create', 
  task, 
  onTaskUpdated 
}: CreateTaskModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "in_progress",
    priority: "medium",
    dueDate: "",
    dueTime: "",
    googleDriveLink: "",
  });
  
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);

  // Initialize form with task data in edit mode - proper due_at handling
  useState(() => {
    if (mode === 'edit' && task) {
      const { dueDate, dueTime } = extractTaskDateTime(task);
      
      setFormData({
        title: task.title || "",
        description: task.description || "",
        status: task.status || "in_progress",
        priority: task.priority || "medium",
        dueDate,
        dueTime,
        googleDriveLink: task.googleDriveLink || "",
      });
      setSelectedTeamMembers(task.assigneeUserIds || []);
    }
  });

  // Fetch team members for assignment
  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
    enabled: isOpen,
  });

  const taskMutation = useMutation({
    mutationFn: async (formData: any) => {
      // Adapt form data to API shape and add additional fields
      const apiData = adaptFormDataToAPI(formData);
      const payload = {
        ...apiData,
        assigneeUserIds: selectedTeamMembers,
        timezone: getUserTimezone() // Include user's timezone for server-side time computation
      };
      
      if (mode === 'edit' && task) {
        const response = await apiRequest("PUT", `/api/tasks/${task.id}`, payload);
        return response.json();
      } else {
        const endpoint = projectId 
          ? `/api/projects/${projectId}/tasks`
          : `/api/organizations/${organizationId}/tasks`;
        const response = await apiRequest("POST", endpoint, { ...payload, selectedTeamMembers });
        return response.json();
      }
    },
    onSuccess: async (result) => {
      // Invalidate relevant queries
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      }
      if (organizationId) {
        queryClient.invalidateQueries({ queryKey: ["/api/organizations", organizationId, "tasks"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      
      // Call appropriate callback
      if (mode === 'edit' && onTaskUpdated) {
        onTaskUpdated();
      } else {
        onSuccess();
      }
      
      // Reset form only in create mode
      if (mode === 'create') {
        setFormData({
          title: "",
          description: "",
          status: "in_progress",
          priority: "medium",
          dueDate: "",
          dueTime: "",
          googleDriveLink: "",
        });
        setSelectedTeamMembers([]);
      }
      
      toast({
        title: mode === 'edit' ? "Task Updated" : "Task Created",
        description: mode === 'edit' ? "Task updated successfully" : "Task created successfully",
      });
    },
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
      toast({
        title: mode === 'edit' ? "Update Failed" : "Creation Failed",
        description: mode === 'edit' ? "Unable to update task. Please try again." : "Unable to create task. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title) {
      toast({
        title: "Missing Information",
        description: "Please enter a task title.",
        variant: "destructive",
      });
      return;
    }

    // Validate time format if provided
    if (formData.dueTime && !isValidTimeFormat(formData.dueTime)) {
      toast({
        title: "Invalid Time Format",
        description: "Please use a valid time format like '9:30 PM' or '21:30'.",
        variant: "destructive",
      });
      return;
    }

    console.log(`${mode === 'edit' ? 'Updating' : 'Creating'} task with data:`, formData);
    taskMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{mode === 'edit' ? 'Edit Task' : 'Add New Task'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="space-y-4 overflow-y-auto flex-1 pr-2 pb-4">
          <div className="space-y-2">
            <Label htmlFor="title">Task Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="e.g., Design homepage mockup"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Detailed description of the task"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50">
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="needs_approval">Needs Approval</SelectItem>
                <SelectItem value="outstanding">Outstanding</SelectItem>
                <SelectItem value="needs_clarification">Needs Clarification</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50">
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Team Member Assignment */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Assign Team Members
            </Label>
            
            {/* Team Member Selection */}
            <div className="space-y-2">
              <Select onValueChange={(memberId) => {
                if (memberId && !selectedTeamMembers.includes(memberId)) {
                  setSelectedTeamMembers(prev => [...prev, memberId]);
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team member to assign" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers
                    .filter(member => !selectedTeamMembers.includes(member.id))
                    .map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name} ({member.role})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Selected Team Members */}
            {selectedTeamMembers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedTeamMembers.map((memberId) => {
                  const member = teamMembers.find(m => m.id === memberId);
                  if (!member) return null;
                  
                  return (
                    <Badge
                      key={memberId}
                      variant="secondary"
                      className="flex items-center gap-1 pr-1"
                    >
                      {member.name}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => setSelectedTeamMembers(prev => prev.filter(id => id !== memberId))}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Due Date
              </Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => handleInputChange('dueDate', e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="dueTime" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Due Time
              </Label>
              <Input
                id="dueTime"
                type="text"
                value={formData.dueTime}
                onChange={(e) => handleInputChange('dueTime', e.target.value)}
                placeholder="9:30 PM, 21:30, or 9 PM"
                className={!formData.dueTime || isValidTimeFormat(formData.dueTime) ? "" : "border-red-500"}
              />
              <p className="text-xs text-gray-500">
                Accepts formats like "9:30 PM", "21:30", or "9 PM"
              </p>
              {formData.dueTime && !isValidTimeFormat(formData.dueTime) && (
                <p className="text-xs text-red-500">
                  Invalid time format. Try "9:30 PM" or "21:30"
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="googleDriveLink">Google Drive Link</Label>
            <Input
              id="googleDriveLink"
              value={formData.googleDriveLink}
              onChange={(e) => handleInputChange('googleDriveLink', e.target.value)}
              placeholder="https://drive.google.com/file/d/..."
            />
          </div>

          </div>
          
          <div className="shrink-0 bg-white border-t pt-4 mt-4 flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={taskMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {taskMutation.isPending 
                ? (mode === 'edit' ? 'Updating...' : 'Creating...')
                : (mode === 'edit' ? 'Update Task' : 'Create Task')
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}