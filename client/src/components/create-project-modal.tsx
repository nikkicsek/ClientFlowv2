import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Building2, User } from "lucide-react";

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
    selectedClientId: "",
    budget: "",
    startDate: "",
    expectedCompletion: "",
  });

  // Fetch all clients to populate company dropdown
  const { data: clients = [] } = useQuery({
    queryKey: ["/api/admin/clients"],
    enabled: isOpen,
  });

  // Get selected client details
  const selectedClient = clients.find((client: any) => client.id === formData.selectedClientId);

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
        selectedClientId: "",
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
    
    if (!formData.name || !formData.selectedClientId) {
      toast({
        title: "Missing Information",
        description: "Please fill in the project name and select a client company.",
        variant: "destructive",
      });
      return;
    }

    createProjectMutation.mutate({
      name: formData.name,
      description: formData.description,
      clientId: formData.selectedClientId,
      organizationId: selectedClient?.organizationId || null,
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Client Selection */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Select Client Company
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="client">Company Name *</Label>
              <Select
                value={formData.selectedClientId}
                onValueChange={(value) => handleInputChange('selectedClientId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a client company..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client: any) => (
                    <SelectItem key={client.id} value={client.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {client.companyName || `${client.firstName} ${client.lastName}`}
                        </span>
                        {client.organizationId && (
                          <Badge variant="secondary" className="text-xs">
                            Organization
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Show selected client details */}
            {selectedClient && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-blue-900">
                      {selectedClient.firstName} {selectedClient.lastName}
                    </h4>
                    <p className="text-sm text-blue-700">{selectedClient.email}</p>
                    {selectedClient.companyName && (
                      <p className="text-sm text-blue-600">{selectedClient.companyName}</p>
                    )}
                    {selectedClient.organizationId && (
                      <Badge variant="secondary" className="mt-2 text-xs">
                        <Building2 className="h-3 w-3 mr-1" />
                        Organization Member
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Project Information */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Project Details</h3>
            
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
                  step="0.01"
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

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={createProjectMutation.isPending || !formData.selectedClientId}
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