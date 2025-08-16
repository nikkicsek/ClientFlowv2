import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Organization, User } from "@shared/schema";

interface EditOrganizationModalProps {
  organization: Organization | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditOrganizationModal({ organization, isOpen, onClose }: EditOrganizationModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    website: "",
    industry: "",
    primaryContactId: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: clients } = useQuery<User[]>({
    queryKey: ["/api/admin/clients"],
    enabled: isOpen,
  });

  useEffect(() => {
    if (organization) {
      setFormData({
        name: organization.name || "",
        description: organization.description || "",
        website: organization.website || "",
        industry: organization.industry || "",
        primaryContactId: organization.primaryContactId || "",
      });
    }
  }, [organization]);

  const updateOrgMutation = useMutation({
    mutationFn: async (orgData: typeof formData) => {
      if (!organization) throw new Error("No organization selected");
      
      const cleanData = {
        name: orgData.name.trim(),
        description: orgData.description.trim() || undefined,
        website: orgData.website.trim() || undefined,
        industry: orgData.industry.trim() || undefined,
        primaryContactId: orgData.primaryContactId || undefined,
      };
      
      const response = await apiRequest("PUT", `/api/admin/organizations/${organization.id}`, cleanData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.details || "Failed to update organization");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Organization Updated",
        description: "The organization has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      onClose();
      setFormData({ name: "", description: "", website: "", industry: "", primaryContactId: "" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Organization name is required.",
        variant: "destructive",
      });
      return;
    }
    updateOrgMutation.mutate(formData);
  };

  const handleClose = () => {
    onClose();
    setFormData({ name: "", description: "", website: "", industry: "", primaryContactId: "" });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Organization</DialogTitle>
          <DialogDescription>
            Update the organization details below.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Organization Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter organization name"
              required
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the organization"
            />
          </div>
          <div>
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://example.com"
            />
          </div>
          <div>
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              value={formData.industry}
              onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              placeholder="e.g., Technology, Healthcare, Finance"
            />
          </div>
          <div>
            <Label htmlFor="primaryContact">Primary Contact</Label>
            <Select
              value={formData.primaryContactId}
              onValueChange={(value) => setFormData({ ...formData, primaryContactId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select primary contact" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No primary contact</SelectItem>
                {clients?.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.firstName} {client.lastName} ({client.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateOrgMutation.isPending}>
              {updateOrgMutation.isPending ? "Updating..." : "Update Organization"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}