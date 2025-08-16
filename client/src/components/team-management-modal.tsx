import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Edit, Trash2, Mail, Phone, User, ClipboardList, CheckCircle } from "lucide-react";
import type { TeamMember } from "@shared/schema";

interface TeamManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_OPTIONS = [
  { value: "project_manager", label: "Project Manager", color: "bg-blue-100 text-blue-800" },
  { value: "content_writer", label: "Content Writer", color: "bg-green-100 text-green-800" },
  { value: "photographer", label: "Photographer", color: "bg-purple-100 text-purple-800" },
  { value: "designer", label: "Designer", color: "bg-pink-100 text-pink-800" },
  { value: "ghl_lead", label: "GHL Lead", color: "bg-orange-100 text-orange-800" },
  { value: "strategist", label: "Strategist", color: "bg-indigo-100 text-indigo-800" },
];

export function TeamManagementModal({ isOpen, onClose }: TeamManagementModalProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "",
    phoneNumber: "",
    profileImageUrl: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: ["/api/team-members"],
    enabled: isOpen,
  });

  // Get task assignments for all team members
  const { data: taskAssignments = [] } = useQuery({
    queryKey: ["/api/admin/task-assignments"],
    enabled: isOpen,
  });

  // Get task count for a specific team member
  const getTeamMemberTaskCount = (memberId: string) => {
    const assignments = taskAssignments.filter((assignment: any) => assignment.teamMemberId === memberId);
    const completed = assignments.filter((assignment: any) => assignment.isCompleted).length;
    const total = assignments.length;
    return { total, completed, pending: total - completed };
  };

  const createMemberMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/team-members", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      setShowAddForm(false);
      resetForm();
      toast({
        title: "Team member added",
        description: "The team member has been successfully added.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add team member",
        variant: "destructive",
      });
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PUT", "/api/team-members/" + id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      setEditingMember(null);
      resetForm();
      toast({
        title: "Team member updated",
        description: "The team member has been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update team member",
        variant: "destructive",
      });
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", "/api/team-members/" + id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      toast({
        title: "Team member removed",
        description: "The team member has been successfully removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove team member",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      role: "",
      phoneNumber: "",
      profileImageUrl: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.role) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (editingMember) {
      updateMemberMutation.mutate({
        id: editingMember.id,
        ...formData,
      });
    } else {
      createMemberMutation.mutate(formData);
    }
  };

  const handleEdit = (member: TeamMember) => {
    setEditingMember(member);
    setFormData({
      name: member.name,
      email: member.email,
      role: member.role,
      phoneNumber: member.phoneNumber || "",
      profileImageUrl: member.profileImageUrl || "",
    });
    setShowAddForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to remove this team member?")) {
      deleteMemberMutation.mutate(id);
    }
  };

  const getRoleColor = (role: string) => {
    const roleOption = ROLE_OPTIONS.find(option => option.value === role);
    return roleOption?.color || "bg-gray-100 text-gray-800";
  };

  const getRoleLabel = (role: string) => {
    const roleOption = ROLE_OPTIONS.find(option => option.value === role);
    return roleOption?.label || role;
  };

  useEffect(() => {
    if (!isOpen) {
      setShowAddForm(false);
      setEditingMember(null);
      resetForm();
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Team Management
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!showAddForm ? (
            <>
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  Manage your team members and their roles for task assignments
                </p>
                <Button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Team Member
                </Button>
              </div>

              {isLoading ? (
                <div className="text-center py-8">Loading team members...</div>
              ) : teamMembers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No team members added yet. Add your first team member to get started.
                </div>
              ) : (
                <div className="grid gap-4">
                  {teamMembers.map((member: TeamMember) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-4">
                        {member.profileImageUrl ? (
                          <img
                            src={member.profileImageUrl}
                            alt={member.name}
                            className="w-12 h-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                            <User className="h-6 w-6 text-gray-500" />
                          </div>
                        )}
                        
                        <div>
                          <h3 className="font-medium">{member.name}</h3>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {member.email}
                            </div>
                            {member.phoneNumber && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {member.phoneNumber}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={`${getRoleColor(member.role)}`}>
                              {getRoleLabel(member.role)}
                            </Badge>
                            {(() => {
                              const taskStats = getTeamMemberTaskCount(member.id);
                              if (taskStats.total > 0) {
                                return (
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1 px-2 py-1 bg-blue-50 rounded text-xs">
                                      <ClipboardList className="h-3 w-3 text-blue-600" />
                                      <span className="text-blue-700 font-medium">{taskStats.total} tasks</span>
                                    </div>
                                    {taskStats.completed > 0 && (
                                      <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded text-xs">
                                        <CheckCircle className="h-3 w-3 text-green-600" />
                                        <span className="text-green-700 font-medium">{taskStats.completed} done</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(member)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(member.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">
                  {editingMember ? "Edit Team Member" : "Add New Team Member"}
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingMember(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter full name"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter email address"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="role">Role *</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input
                    id="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    placeholder="Enter phone number"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="profileImageUrl">Profile Image URL</Label>
                  <Input
                    id="profileImageUrl"
                    value={formData.profileImageUrl}
                    onChange={(e) => setFormData({ ...formData, profileImageUrl: e.target.value })}
                    placeholder="Enter profile image URL"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="submit"
                  disabled={createMemberMutation.isPending || updateMemberMutation.isPending}
                >
                  {editingMember ? "Update Member" : "Add Member"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}