import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Phone, Plus, Edit, Trash2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  phoneNumber?: string;
  profileImageUrl?: string;
}

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "project_manager", label: "Project Manager" },
  { value: "designer", label: "Designer" },
  { value: "developer", label: "Developer" },
  { value: "content_creator", label: "Content Creator" },
  { value: "account_manager", label: "Account Manager" },
  { value: "strategist", label: "Strategist" },
  { value: "analyst", label: "Analyst" },
];

export function TeamManagementContent() {
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
  });

  // Get task assignments for all team members
  const { data: taskAssignments = [] } = useQuery({
    queryKey: ["/api/admin/task-assignments"],
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingMember) {
      updateMemberMutation.mutate({
        id: editingMember.id,
        ...formData,
      });
    } else {
      createMemberMutation.mutate(formData);
    }
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      admin: "bg-purple-100 text-purple-700",
      project_manager: "bg-blue-100 text-blue-700",
      designer: "bg-pink-100 text-pink-700",
      developer: "bg-green-100 text-green-700",
      content_creator: "bg-yellow-100 text-yellow-700",
      account_manager: "bg-indigo-100 text-indigo-700",
      strategist: "bg-orange-100 text-orange-700",
      analyst: "bg-gray-100 text-gray-700",
    };
    return colors[role] || "bg-gray-100 text-gray-700";
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Team Management</h2>
          <p className="text-gray-600">Manage agency team members and their roles for task assignments</p>
        </div>
        {!showAddForm && (
          <Button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Team Member
          </Button>
        )}
      </div>

      {showAddForm ? (
        <Card>
          <CardContent className="p-6">
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
                    type="url"
                    value={formData.profileImageUrl}
                    onChange={(e) => setFormData({ ...formData, profileImageUrl: e.target.value })}
                    placeholder="https://example.com/profile-image.jpg"
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
          </CardContent>
        </Card>
      ) : (
        <>
          {isLoading ? (
            <div className="text-center py-8">Loading team members...</div>
          ) : teamMembers.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Team Members Yet</h3>
                <p className="text-gray-600 mb-4">
                  Add your first team member to get started with task assignments.
                </p>
                <Button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-2 mx-auto"
                >
                  <Plus className="h-4 w-4" />
                  Add Team Member
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {teamMembers.map((member: TeamMember) => {
                const taskStats = getTeamMemberTaskCount(member.id);
                return (
                  <Card key={member.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
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
                            <div className="flex items-center gap-3 mb-1">
                              <h3 className="font-medium">{member.name}</h3>
                              <Badge className={getRoleColor(member.role)}>
                                {ROLE_OPTIONS.find(r => r.value === member.role)?.label || member.role}
                              </Badge>
                            </div>
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
                            <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                              <span>Tasks: {taskStats.total} total</span>
                              <span>Completed: {taskStats.completed}</span>
                              <span>Pending: {taskStats.pending}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(member)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(member.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}