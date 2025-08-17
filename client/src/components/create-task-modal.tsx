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


interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
}

export default function CreateTaskModal({ isOpen, onClose, onSuccess, projectId }: CreateTaskModalProps) {
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

  // Fetch team members for assignment
  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
    enabled: isOpen,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/projects/${projectId}/tasks`, data);
      return response.json();
    },
    onSuccess: async (newTask) => {
      // Assign selected team members to the task
      if (selectedTeamMembers.length > 0) {
        for (const memberId of selectedTeamMembers) {
          try {
            await apiRequest("POST", "/api/task-assignments", {
              taskId: newTask.id,
              teamMemberId: memberId,
            });
          } catch (error) {
            console.error("Error assigning team member:", error);
          }
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-assignments"] });
      
      onSuccess();
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
      toast({
        title: "Task Created",
        description: "Project task created successfully",
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
        title: "Creation Failed",
        description: "Unable to create task. Please try again.",
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

    // Combine date and time for due date if both are provided
    let dueDateTime = null;
    if (formData.dueDate) {
      if (formData.dueTime) {
        dueDateTime = `${formData.dueDate}T${formData.dueTime}:00`;
      } else {
        dueDateTime = `${formData.dueDate}T09:00:00`; // Default to 9 AM if no time specified
      }
    }

    const taskData = {
      title: formData.title,
      description: formData.description || null,
      status: formData.status,
      priority: formData.priority,
      dueDate: dueDateTime,
      googleDriveLink: formData.googleDriveLink || null,
    };

    console.log("Creating task with data:", taskData);
    createTaskMutation.mutate(taskData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Task</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
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
              <SelectContent>
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
              <SelectContent>
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
                type="time"
                value={formData.dueTime}
                onChange={(e) => handleInputChange('dueTime', e.target.value)}
                placeholder="09:00"
              />
              <p className="text-xs text-gray-500">Time for Google Calendar sync</p>
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

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={createTaskMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {createTaskMutation.isPending ? 'Creating...' : 'Create Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}