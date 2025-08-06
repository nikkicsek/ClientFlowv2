import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Building2, UserPlus } from "lucide-react";
import { Organization, User } from "@shared/schema";

interface AssignOrganizationModalProps {
  user: User;
}

export function AssignOrganizationModal({ user }: AssignOrganizationModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string>(user.organizationId || "");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/admin/organizations"],
    enabled: isOpen,
  });

  const assignMutation = useMutation({
    mutationFn: async (organizationId: string | null) => {
      const response = await apiRequest("PUT", `/api/admin/users/${user.id}/organization`, {
        organizationId: organizationId || null
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update organization assignment");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Assignment Updated",
        description: selectedOrgId 
          ? "User has been assigned to the organization" 
          : "User has been removed from organization",
      });
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Assignment Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAssign = () => {
    assignMutation.mutate(selectedOrgId || null);
  };

  const currentOrg = organizations?.find(org => org.id === user.organizationId);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="flex items-center gap-1"
        >
          <Building2 className="h-3 w-3" />
          {user.organizationId ? "Change Org" : "Assign Org"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Assign to Organization
          </DialogTitle>
          <DialogDescription>
            Assign {user.firstName} {user.lastName} to a business organization
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Client Information</h4>
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="font-medium">{user.firstName} {user.lastName}</p>
              <p className="text-sm text-gray-600">{user.email}</p>
              {user.companyName && (
                <p className="text-sm text-gray-500">{user.companyName}</p>
              )}
            </div>
          </div>

          {currentOrg && (
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Current Organization</h4>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  <Building2 className="h-3 w-3 mr-1" />
                  {currentOrg.name}
                </Badge>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="organization-select">Select Organization</Label>
            <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an organization or leave unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No Organization (Individual Client)</SelectItem>
                {organizations?.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      <div>
                        <div className="font-medium">{org.name}</div>
                        {org.industry && (
                          <div className="text-xs text-gray-500">{org.industry}</div>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button 
              onClick={handleAssign}
              disabled={assignMutation.isPending}
              className="flex-1"
            >
              {assignMutation.isPending ? "Updating..." : "Update Assignment"}
            </Button>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}