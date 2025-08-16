import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Users, X } from 'lucide-react';
import type { Service, TeamMember } from '@shared/schema';

interface CreateOrganizationTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  organizationId: string;
  organizationName: string;
  services: Service[];
}

export default function CreateOrganizationTaskModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  organizationId, 
  organizationName,
  services 
}: CreateOrganizationTaskModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "in_progress",
    priority: "medium",
    dueDate: "",
  });
  
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);

  // Fetch team members for assignment
  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
    enabled: isOpen,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", `/api/organizations/${organizationId}/tasks`, data);
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
      
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", organizationId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-assignments"] });
      
      onSuccess();
      setFormData({
        title: "",
        description: "",
        status: "in_progress",
        priority: "medium",
        dueDate: "",
      });
      setSelectedTeamMembers([]);
      toast({
        title: "Organization Task Created",
        description: `Task created for ${organizationName}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message || "Unable to create organization task. Please try again.",
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

    const taskData = {
      title: formData.title,
      description: formData.description || null,
      status: formData.status,
      priority: formData.priority,
      dueDate: formData.dueDate || null,
    };

    createTaskMutation.mutate(taskData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Organization Task - {organizationName}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Task Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="e.g., Get contract signed, Obtain GA4 access"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Detailed description of the administrative task"
              rows={3}
            />
          </div>

          {/* Team Member Assignment */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Assign Team Members
            </Label>
            <div className="space-y-2">
              <Select
                value=""
                onValueChange={(memberId) => {
                  if (memberId && !selectedTeamMembers.includes(memberId)) {
                    setSelectedTeamMembers([...selectedTeamMembers, memberId]);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Add team member" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers
                    .filter((member) => !selectedTeamMembers.includes(member.id))
                    .map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name} ({member.role})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              
              {selectedTeamMembers.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedTeamMembers.map((memberId) => {
                    const member = teamMembers.find((m) => m.id === memberId);
                    if (!member) return null;
                    return (
                      <Badge key={member.id} variant="secondary" className="flex items-center gap-1">
                        {member.name}
                        <X
                          className="w-3 h-3 cursor-pointer hover:text-red-500"
                          onClick={() => setSelectedTeamMembers(prev => prev.filter(id => id !== memberId))}
                        />
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="needs_approval">Needs Approval</SelectItem>
                  <SelectItem value="outstanding">Outstanding</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueDate">Due Date</Label>
            <Input
              id="dueDate"
              type="date"
              value={formData.dueDate}
              onChange={(e) => handleInputChange('dueDate', e.target.value)}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTaskMutation.isPending}>
              {createTaskMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}