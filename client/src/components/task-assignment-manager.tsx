import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  User, 
  Plus, 
  X, 
  CheckCircle, 
  Clock,
  Edit3,
  Trash2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Task, TeamMember, TaskAssignment } from "@shared/schema";

interface TaskAssignmentManagerProps {
  task: Task;
  onUpdate?: () => void;
}

export function TaskAssignmentManager({ task, onUpdate }: TaskAssignmentManagerProps) {
  const queryClient = useQueryClient();
  const [isAddingAssignment, setIsAddingAssignment] = useState(false);
  const [selectedTeamMember, setSelectedTeamMember] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [notes, setNotes] = useState("");

  // Get team members
  const { data: teamMembers } = useQuery({
    queryKey: ["/api/admin/team-members"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/team-members");
      return response.json();
    }
  });

  // Get task assignments
  const { data: assignments, isLoading } = useQuery({
    queryKey: ["/api/tasks", task.id, "assignments"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/tasks/${task.id}/assignments`);
      return response.json();
    }
  });

  // Create assignment mutation
  const createAssignmentMutation = useMutation({
    mutationFn: async (assignmentData: any) => {
      const response = await apiRequest("POST", `/api/tasks/${task.id}/assignments`, assignmentData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.id, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      setIsAddingAssignment(false);
      setSelectedTeamMember("");
      setEstimatedHours("");
      setNotes("");
      onUpdate?.();
    }
  });

  // Update assignment mutation
  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const response = await apiRequest("PUT", `/api/assignments/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.id, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      onUpdate?.();
    }
  });

  // Delete assignment mutation
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      await apiRequest("DELETE", `/api/assignments/${assignmentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.id, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      onUpdate?.();
    }
  });

  const handleCreateAssignment = () => {
    if (!selectedTeamMember) return;

    createAssignmentMutation.mutate({
      teamMemberId: selectedTeamMember,
      estimatedHours: estimatedHours ? parseInt(estimatedHours) : null,
      notes: notes.trim() || null,
    });
  };

  const handleToggleCompletion = (assignment: TaskAssignment & { teamMember: TeamMember }) => {
    updateAssignmentMutation.mutate({
      id: assignment.id,
      updates: {
        isCompleted: !assignment.isCompleted,
        completedAt: !assignment.isCompleted ? new Date() : null,
      }
    });
  };

  const handleDeleteAssignment = (assignmentId: string) => {
    if (confirm("Are you sure you want to remove this assignment?")) {
      deleteAssignmentMutation.mutate(assignmentId);
    }
  };

  const getAvailableTeamMembers = () => {
    if (!teamMembers || !assignments) return teamMembers || [];
    
    const assignedMemberIds = assignments.map((a: TaskAssignment & { teamMember: TeamMember }) => a.teamMemberId);
    return teamMembers.filter((member: TeamMember) => !assignedMemberIds.includes(member.id));
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "photographer": return "bg-purple-100 text-purple-800";
      case "content_writer": return "bg-blue-100 text-blue-800";
      case "designer": return "bg-pink-100 text-pink-800";
      case "project_manager": return "bg-green-100 text-green-800";
      case "ghl_lead": return "bg-orange-100 text-orange-800";
      case "strategist": return "bg-indigo-100 text-indigo-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading assignments...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Team Assignments</Label>
        <Dialog open={isAddingAssignment} onOpenChange={setIsAddingAssignment}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Assign Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Team Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="team-member">Team Member</Label>
                <Select value={selectedTeamMember} onValueChange={setSelectedTeamMember}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableTeamMembers().map((member: TeamMember) => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex items-center gap-2">
                          <span>{member.name}</span>
                          <Badge variant="secondary" className={`text-xs ${getRoleColor(member.role)}`}>
                            {member.role.replace("_", " ")}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="estimated-hours">Estimated Hours (optional)</Label>
                <Input
                  id="estimated-hours"
                  type="number"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  placeholder="Enter estimated hours"
                />
              </div>
              
              <div>
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any specific instructions or notes..."
                  rows={3}
                />
              </div>
              
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsAddingAssignment(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateAssignment}
                  disabled={!selectedTeamMember || createAssignmentMutation.isPending}
                >
                  {createAssignmentMutation.isPending ? "Assigning..." : "Assign"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {assignments && assignments.length > 0 ? (
        <div className="space-y-2">
          {assignments.map((assignment: TaskAssignment & { teamMember: TeamMember }) => (
            <Card key={assignment.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">{assignment.teamMember.name}</span>
                    <Badge variant="secondary" className={`text-xs ${getRoleColor(assignment.teamMember.role)}`}>
                      {assignment.teamMember.role.replace("_", " ")}
                    </Badge>
                  </div>
                  
                  {assignment.estimatedHours && (
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      {assignment.estimatedHours}h
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant={assignment.isCompleted ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleToggleCompletion(assignment)}
                    className={assignment.isCompleted ? "bg-green-600 hover:bg-green-700" : ""}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    {assignment.isCompleted ? "Completed" : "Mark Complete"}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteAssignment(assignment.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {assignment.notes && (
                <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                  {assignment.notes}
                </div>
              )}
              
              {assignment.isCompleted && assignment.completedAt && (
                <div className="mt-2 text-xs text-green-600">
                  Completed on {new Date(assignment.completedAt).toLocaleDateString()}
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-500 italic">
          No team members assigned to this task yet.
        </div>
      )}
    </div>
  );
}