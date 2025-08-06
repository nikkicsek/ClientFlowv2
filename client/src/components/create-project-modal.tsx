import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateProjectModal({ isOpen, onClose, onSuccess }: CreateProjectModalProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    clientEmail: "",
    clientFirstName: "",
    clientLastName: "",
    clientCompanyName: "",
    budget: "",
    startDate: "",
    expectedCompletion: "",
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/projects", data);
      return response.json();
    },
    onSuccess: () => {
      onSuccess();
      setFormData({
        name: "",
        description: "",
        clientEmail: "",
        clientFirstName: "",
        clientLastName: "",
        clientCompanyName: "",
        budget: "",
        startDate: "",
        expectedCompletion: "",
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
        description: "Unable to create project. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.clientEmail) {
      toast({
        title: "Missing Information",
        description: "Please fill in the project name and client email.",
        variant: "destructive",
      });
      return;
    }

    createProjectMutation.mutate({
      name: formData.name,
      description: formData.description,
      clientEmail: formData.clientEmail,
      clientFirstName: formData.clientFirstName,
      clientLastName: formData.clientLastName,
      clientCompanyName: formData.clientCompanyName,
      budget: formData.budget ? parseFloat(formData.budget) : null,
      startDate: formData.startDate ? new Date(formData.startDate) : null,
      expectedCompletion: formData.expectedCompletion ? new Date(formData.expectedCompletion) : null,
    });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project Information */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Project Information</h3>
            
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Website Redesign for ABC Corp"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Brief description of the project scope and objectives"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budget">Budget ($)</Label>
                <Input
                  id="budget"
                  type="number"
                  value={formData.budget}
                  onChange={(e) => handleInputChange('budget', e.target.value)}
                  placeholder="10000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => handleInputChange('startDate', e.target.value)}
                />
              </div>
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

          {/* Client Information */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-medium text-gray-900">Client Information</h3>
            
            <div className="space-y-2">
              <Label htmlFor="clientEmail">Client Email *</Label>
              <Input
                id="clientEmail"
                type="email"
                value={formData.clientEmail}
                onChange={(e) => handleInputChange('clientEmail', e.target.value)}
                placeholder="client@company.com"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clientFirstName">First Name</Label>
                <Input
                  id="clientFirstName"
                  value={formData.clientFirstName}
                  onChange={(e) => handleInputChange('clientFirstName', e.target.value)}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientLastName">Last Name</Label>
                <Input
                  id="clientLastName"
                  value={formData.clientLastName}
                  onChange={(e) => handleInputChange('clientLastName', e.target.value)}
                  placeholder="Smith"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clientCompanyName">Company Name</Label>
              <Input
                id="clientCompanyName"
                value={formData.clientCompanyName}
                onChange={(e) => handleInputChange('clientCompanyName', e.target.value)}
                placeholder="ABC Corporation"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={createProjectMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}