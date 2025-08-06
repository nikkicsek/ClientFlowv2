import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Calendar, DollarSign, Target, TrendingUp } from "lucide-react";

interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
}

export default function EditProjectModal({ isOpen, onClose, project }: EditProjectModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    budget: "",
    startDate: "",
    expectedCompletion: "",
    status: "active",
    progress: 0,
  });

  // Populate form when project changes
  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || "",
        description: project.description || "",
        budget: project.budget ? project.budget.toString() : "",
        startDate: project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : "",
        expectedCompletion: project.expectedCompletion ? new Date(project.expectedCompletion).toISOString().split('T')[0] : "",
        status: project.status || "active",
        progress: project.progress || 0,
      });
    }
  }, [project]);

  const updateProjectMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PUT", `/api/admin/projects/${project.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Project Updated",
        description: "Project details have been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      onClose();
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
        title: "Update Failed",
        description: "Unable to update project. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name) {
      toast({
        title: "Missing Information",
        description: "Please fill in the project name.",
        variant: "destructive",
      });
      return;
    }

    updateProjectMutation.mutate({
      name: formData.name,
      description: formData.description || null,
      budget: formData.budget ? parseFloat(formData.budget) : null,
      startDate: formData.startDate ? new Date(formData.startDate) : null,
      expectedCompletion: formData.expectedCompletion ? new Date(formData.expectedCompletion) : null,
      status: formData.status,
      progress: formData.progress,
    });
  };

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const statusOptions = [
    { value: "active", label: "Active", color: "blue" },
    { value: "on_hold", label: "On Hold", color: "yellow" },
    { value: "completed", label: "Completed", color: "green" },
  ];

  const getStatusColor = (status: string) => {
    const option = statusOptions.find(opt => opt.value === status);
    return option?.color || "gray";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project Information */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <Target className="h-4 w-4" />
              Project Details
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Website Redesign"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Project scope and objectives"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budget" className="flex items-center gap-2">
                  <DollarSign className="h-3 w-3" />
                  Budget ($)
                </Label>
                <Input
                  id="budget"
                  type="number"
                  step="0.01"
                  value={formData.budget}
                  onChange={(e) => handleInputChange('budget', e.target.value)}
                  placeholder="10000"
                />
              </div>
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
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full bg-${option.color}-500`} />
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  Start Date
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => handleInputChange('startDate', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expectedCompletion">Expected Completion</Label>
                <Input
                  id="expectedCompletion"
                  type="date"
                  value={formData.expectedCompletion}
                  onChange={(e) => handleInputChange('expectedCompletion', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Progress Section */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Project Progress
            </h3>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Progress ({formData.progress}%)</Label>
                  <Badge 
                    variant="secondary" 
                    className={`
                      ${formData.progress === 0 ? 'bg-gray-100 text-gray-600' : 
                        formData.progress < 25 ? 'bg-red-100 text-red-700' :
                        formData.progress < 50 ? 'bg-yellow-100 text-yellow-700' :
                        formData.progress < 75 ? 'bg-blue-100 text-blue-700' :
                        formData.progress < 100 ? 'bg-green-100 text-green-700' :
                        'bg-green-200 text-green-800'}
                    `}
                  >
                    {formData.progress === 0 ? 'Not Started' :
                     formData.progress < 25 ? 'Getting Started' :
                     formData.progress < 50 ? 'In Progress' :
                     formData.progress < 75 ? 'Significant Progress' :
                     formData.progress < 100 ? 'Nearly Complete' :
                     'Completed'}
                  </Badge>
                </div>
                <Slider
                  value={[formData.progress]}
                  onValueChange={(value) => handleInputChange('progress', value[0])}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0%</span>
                  <span>25%</span>
                  <span>50%</span>
                  <span>75%</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Progress Update Guide</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <p>• <strong>0-24%:</strong> Project initiation, planning, and setup</p>
                  <p>• <strong>25-49%:</strong> Active development and implementation</p>
                  <p>• <strong>50-74%:</strong> Major milestones achieved, refinements ongoing</p>
                  <p>• <strong>75-99%:</strong> Final touches, testing, and client reviews</p>
                  <p>• <strong>100%:</strong> Project completed and delivered</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={updateProjectMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {updateProjectMutation.isPending ? 'Updating...' : 'Update Project'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}