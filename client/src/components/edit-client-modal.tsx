import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { User, Organization } from "@shared/schema";

interface EditClientModalProps {
  client: User | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditClientModal({ client, isOpen, onClose }: EditClientModalProps) {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    companyName: "",
    organizationId: "",
    jobTitle: "",
    phone: "",
    address: "",
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch organizations for dropdown
  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/admin/organizations"],
    enabled: isOpen,
  });

  // Sort organizations alphabetically
  const sortedOrganizations = [...organizations].sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (client) {
      setFormData({
        firstName: client.firstName || "",
        lastName: client.lastName || "",
        email: client.email || "",
        companyName: client.companyName || "",
        organizationId: client.organizationId || "none",
        jobTitle: client.jobTitle || "",
        phone: client.phone || "",
        address: client.address || "",
      });
    }
  }, [client]);

  const updateClientMutation = useMutation({
    mutationFn: async (clientData: typeof formData) => {
      if (!client) throw new Error("No client selected");

      const cleanData = {
        firstName: clientData.firstName.trim() || null,
        lastName: clientData.lastName.trim() || null,
        email: clientData.email.trim(),
        companyName: clientData.companyName.trim() || null,
        organizationId: clientData.organizationId === "none" ? null : clientData.organizationId || null,
        jobTitle: clientData.jobTitle.trim() || null,
        phone: clientData.phone.trim() || null,
        address: clientData.address.trim() || null,
      };

      console.log("Updating client with data:", cleanData);

      const response = await apiRequest("PUT", `/api/admin/clients/${client.id}`, cleanData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update client");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Client Updated",
        description: "Client details have been updated successfully",
      });
      onClose();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      // Also invalidate organization users queries
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("No client selected");

      const response = await apiRequest("DELETE", `/api/admin/clients/${client.id}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete client");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Client Deleted",
        description: "Client has been deleted successfully",
      });
      onClose();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email) {
      toast({
        title: "Validation Error",
        description: "Email is required",
        variant: "destructive",
      });
      return;
    }
    updateClientMutation.mutate(formData);
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this client? This action cannot be undone.")) {
      deleteClientMutation.mutate();
    }
  };

  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Client</DialogTitle>
          <DialogDescription>
            Update the client's information or delete the client account.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleInputChange("firstName", e.target.value)}
                placeholder="John"
              />
            </div>
            <div>
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleInputChange("lastName", e.target.value)}
                placeholder="Smith"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              placeholder="john@example.com"
              required
            />
          </div>

          <div>
            <Label htmlFor="companyName">Company Name</Label>
            <Input
              id="companyName"
              value={formData.companyName}
              onChange={(e) => handleInputChange("companyName", e.target.value)}
              placeholder="Acme Corp"
            />
          </div>

          <div>
            <Label htmlFor="organization">Organization</Label>
            <Select value={formData.organizationId} onValueChange={(value) => handleInputChange("organizationId", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select organization (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No organization</SelectItem>
                {sortedOrganizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="jobTitle">Job Title</Label>
            <Input
              id="jobTitle"
              value={formData.jobTitle}
              onChange={(e) => handleInputChange("jobTitle", e.target.value)}
              placeholder="Marketing Manager"
            />
          </div>

          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              placeholder="123 Main St, City, State 12345"
              rows={3}
            />
          </div>

          <div className="flex justify-between pt-4">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteClientMutation.isPending}
            >
              {deleteClientMutation.isPending ? "Deleting..." : "Delete Client"}
            </Button>
            
            <div className="flex space-x-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateClientMutation.isPending}
              >
                {updateClientMutation.isPending ? "Updating..." : "Update Client"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}