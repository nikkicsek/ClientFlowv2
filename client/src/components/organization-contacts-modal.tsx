import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Mail, Phone, Building2, UserMinus, UserPlus } from "lucide-react";
import type { Organization, User } from "@shared/schema";

interface OrganizationContactsModalProps {
  organization: Organization | null;
  isOpen: boolean;
  onClose: () => void;
}

export function OrganizationContactsModal({ organization, isOpen, onClose }: OrganizationContactsModalProps) {
  const [assigningUser, setAssigningUser] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get organization contacts
  const { data: orgUsers, isLoading: orgUsersLoading } = useQuery<User[]>({
    queryKey: [`/api/admin/organizations/${organization?.id}/users`],
    enabled: !!organization?.id && isOpen,
  });

  // Get all clients for assignment
  const { data: allClients } = useQuery<User[]>({
    queryKey: ["/api/admin/clients"],
    enabled: isOpen,
  });

  // Get unassigned clients (not in any organization or not in this organization)
  const unassignedClients = allClients?.filter(client => 
    !client.organizationId || client.organizationId !== organization?.id
  ) || [];

  const assignUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!organization) throw new Error("No organization selected");
      
      const response = await apiRequest("PUT", `/api/admin/users/${userId}/organization`, {
        organizationId: organization.id
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to assign user");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "User Assigned",
        description: "The user has been assigned to this organization.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/organizations/${organization?.id}/users`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      setAssigningUser("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("PUT", `/api/admin/users/${userId}/organization`, {
        organizationId: null
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to remove user");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "User Removed",
        description: "The user has been removed from this organization.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/organizations/${organization?.id}/users`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAssignUser = () => {
    if (assigningUser) {
      assignUserMutation.mutate(assigningUser);
    }
  };

  const handleRemoveUser = (userId: string) => {
    if (confirm("Are you sure you want to remove this user from the organization?")) {
      removeUserMutation.mutate(userId);
    }
  };

  if (!organization) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {organization.name} - Manage Contacts
          </DialogTitle>
          <DialogDescription>
            Add or remove contacts for this organization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add new contact */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900">Assign Contact</h3>
            <div className="flex gap-2">
              <Select value={assigningUser} onValueChange={setAssigningUser}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a client to assign" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedClients.length === 0 ? (
                    <SelectItem value="none" disabled>No available clients</SelectItem>
                  ) : (
                    unassignedClients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.firstName} {client.lastName} ({client.email})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button 
                onClick={handleAssignUser} 
                disabled={!assigningUser || assignUserMutation.isPending}
              >
                <UserPlus className="h-4 w-4 mr-1" />
                Assign
              </Button>
            </div>
          </div>

          {/* Current contacts */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-900">Current Contacts</h3>
            {orgUsersLoading ? (
              <div className="text-center py-4 text-gray-500">Loading contacts...</div>
            ) : !orgUsers || orgUsers.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center">
                  <Users className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-gray-600">No contacts assigned to this organization yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {orgUsers.map((user) => (
                  <Card key={user.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-blue-700 font-medium text-sm">
                              {user.firstName?.[0]}{user.lastName?.[0]}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">
                              {user.firstName} {user.lastName}
                            </h4>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Mail className="h-3 w-3" />
                              {user.email}
                            </div>
                            {user.phone && (
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Phone className="h-3 w-3" />
                                {user.phone}
                              </div>
                            )}
                            {user.jobTitle && (
                              <Badge variant="outline" className="mt-1">
                                {user.jobTitle}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveUser(user.id)}
                          disabled={removeUserMutation.isPending}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}