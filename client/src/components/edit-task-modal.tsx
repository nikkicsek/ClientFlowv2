import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, Link as LinkIcon, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: any;
}

export function EditTaskModal({ isOpen, onClose, task }: EditTaskModalProps) {
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

  // Initialize form data when task changes
  useEffect(() => {
    if (task) {
      let dateValue = "";
      let timeValue = "";
      
      if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        if (!isNaN(dueDate.getTime())) {
          dateValue = dueDate.toISOString().split('T')[0];
          timeValue = dueDate.toISOString().split('T')[1].slice(0, 5);
        }
      }
      
      setFormData({
        title: task.title || "",
        description: task.description || "",
        status: task.status || "in_progress",
        priority: task.priority || "medium",
        dueDate: dateValue,
        dueTime: timeValue,
        googleDriveLink: task.googleDriveLink || "",
      });
    }
  }, [task]);

  const updateTaskMutation = useMutation({
    mutationFn: async (taskData: any) => {
      const response = await apiRequest("PUT", `/api/admin/tasks/${task.id}`, taskData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Task Updated",
        description: "Task has been updated successfully.",
      });
      onClose();
    },
    onError: (error) => {
      console.error("Update task error:", error);
      toast({
        title: "Update Failed",
        description: "Failed to update task. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

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

    console.log("Updating task with data:", taskData);
    updateTaskMutation.mutate(taskData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            Edit Task
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Task Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="Enter task title"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Enter task description"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value) => handleInputChange('status', value)}
              >
                <SelectTrigger>
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

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select 
                value={formData.priority} 
                onValueChange={(value) => handleInputChange('priority', value)}
              >
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
            <Label htmlFor="googleDriveLink" className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Google Drive Link
            </Label>
            <Input
              id="googleDriveLink"
              type="url"
              value={formData.googleDriveLink}
              onChange={(e) => handleInputChange('googleDriveLink', e.target.value)}
              placeholder="https://drive.google.com/..."
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={updateTaskMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateTaskMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateTaskMutation.isPending ? "Updating..." : "Update Task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}