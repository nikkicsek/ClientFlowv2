import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Building2, Plus, Users, Edit } from "lucide-react";
import { Organization, User } from "@shared/schema";

export function OrganizationManagementModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    website: "",
    industry: "",
    primaryContactId: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/admin/organizations"],
    enabled: isOpen,
  });

  const { data: clients } = useQuery<User[]>({
    queryKey: ["/api/admin/clients"],
    enabled: isOpen,
  });

  const createOrgMutation = useMutation({
    mutationFn: async (orgData: typeof formData) => {
      console.log("Sending organization data:", orgData);
      
      // Clean the data before sending
      const cleanData = {
        name: orgData.name.trim(),
        description: orgData.description.trim() || undefined,
        website: orgData.website.trim() || undefined,
        industry: orgData.industry.trim() || undefined,
        primaryContactId: orgData.primaryContactId || undefined,
      };
      
      console.log("Cleaned organization data:", cleanData);
      
      const response = await apiRequest("POST", "/api/admin/organizations", cleanData);
      if (!response.ok) {
        const error = await response.json();
        console.error("Server error response:", error);
        throw new Error(error.message || error.details || "Failed to create organization");
      }
      return response.json();
    },
    onSuccess: (data) => {
      console.log("Organization created successfully:", data);
      toast({
        title: "Organization Created",
        description: "New organization has been created successfully",
      });
      setFormData({ name: "", description: "", website: "", industry: "", primaryContactId: "" });
      setIsCreating(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
    },
    onError: (error: Error) => {
      console.error("Organization creation error:", error);
      toast({
        title: "Creation Failed",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Organization name is required",
        variant: "destructive",
      });
      return;
    }
    createOrgMutation.mutate(formData);
  };

  const resetForm = () => {
    setFormData({ name: "", description: "", website: "", industry: "", primaryContactId: "" });
    setIsCreating(false);
    setSelectedOrg(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Manage Organizations
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Business Organization Management
          </DialogTitle>
          <DialogDescription>
            Organize multiple client contacts under business entities for better project management.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Create New Organization */}
          {!isCreating && (
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Organizations</h3>
              <Button 
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Organization
              </Button>
            </div>
          )}

          {isCreating && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Create New Organization
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="org-name">Organization Name *</Label>
                    <Input
                      id="org-name"
                      placeholder="ACME Corporation"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="org-industry">Industry</Label>
                    <Input
                      id="org-industry"
                      placeholder="Technology, Manufacturing, etc."
                      value={formData.industry}
                      onChange={(e) => setFormData(prev => ({ ...prev, industry: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="org-description">Description</Label>
                  <Textarea
                    id="org-description"
                    placeholder="Brief description of the organization..."
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="org-website">Website</Label>
                    <Input
                      id="org-website"
                      placeholder="https://example.com"
                      value={formData.website}
                      onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="primary-contact">Primary Contact</Label>
                    <Select 
                      value={formData.primaryContactId} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, primaryContactId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select primary contact" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients?.filter(client => client.role === 'client').map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.firstName} {client.lastName} ({client.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button 
                    onClick={handleSubmit}
                    disabled={createOrgMutation.isPending}
                  >
                    {createOrgMutation.isPending ? "Creating..." : "Create Organization"}
                  </Button>
                  <Button variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Organizations List */}
          {!isCreating && (
            <div>
              {!organizations || organizations.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Building2 className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Organizations Yet</h3>
                    <p className="text-gray-600 mb-4">
                      Create organizations to group multiple client contacts under business entities.
                    </p>
                    <Button onClick={() => setIsCreating(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Organization
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {organizations.map((org) => (
                    <Card key={org.id}>
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Building2 className="h-5 w-5 text-blue-600" />
                              <h4 className="text-lg font-semibold">{org.name}</h4>
                              {org.industry && (
                                <Badge variant="secondary">{org.industry}</Badge>
                              )}
                            </div>
                            
                            {org.description && (
                              <p className="text-gray-600 mb-2">{org.description}</p>
                            )}
                            
                            <div className="text-sm text-gray-500">
                              {org.website && (
                                <span className="mr-4">
                                  Website: <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{org.website}</a>
                                </span>
                              )}
                              <span>Created: {new Date(org.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline">
                              <Users className="h-4 w-4 mr-1" />
                              View Contacts
                            </Button>
                            <Button size="sm" variant="outline">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}