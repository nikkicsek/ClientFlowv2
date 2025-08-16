import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  CheckSquare, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  User, 
  Target,
  Plus,
  Users,
  Building2
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { TaskAssignmentManager } from './task-assignment-manager';
import CreateOrganizationTaskModal from './create-organization-task-modal';
import type { Organization, Service } from '@shared/schema';

interface OrganizationTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  organization: Organization | null;
  services: Service[];
}

export function OrganizationTasksModal({ isOpen, onClose, organization, services }: OrganizationTasksModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTaskForAssignment, setSelectedTaskForAssignment] = useState<string | null>(null);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["/api/organizations", organization?.id, "tasks"],
    enabled: !!organization?.id && isOpen,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/organizations/${organization?.id}/tasks`);
      return response.json();
    },
  });

  const { data: taskAssignments } = useQuery({
    queryKey: ["/api/admin/task-assignments"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/task-assignments");
      return response.json();
    },
    enabled: isOpen
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: any }) => {
      const response = await apiRequest("PUT", `/api/tasks/${taskId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations", organization?.id, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
    },
  });

  if (!organization) return null;

  // Filter tasks based on selected filters
  const filteredTasks = tasks.filter((task: any) => {
    const statusMatch = filterStatus === "all" || task.status === filterStatus;
    const priorityMatch = filterPriority === "all" || task.priority === filterPriority;
    return statusMatch && priorityMatch;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckSquare className="h-4 w-4 text-green-600" />;
      case "in_progress": return <Clock className="h-4 w-4 text-blue-600" />;
      case "needs_approval": return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "outstanding": return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "in_progress": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "needs_approval": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "outstanding": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "high": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "medium": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "low": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const getTaskAssignments = (taskId: string) => {
    if (!taskAssignments) return [];
    return taskAssignments.filter((assignment: any) => assignment.taskId === taskId);
  };

  const getTeamMemberInitials = (name: string) => {
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
  };

  const getTeamMemberColor = (role: string) => {
    switch (role) {
      case "photographer": return "bg-purple-500";
      case "content_writer": return "bg-blue-500";
      case "designer": return "bg-pink-500";
      case "project_manager": return "bg-green-500";
      case "ghl_lead": return "bg-orange-500";
      case "strategist": return "bg-indigo-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organization Tasks - {organization.name}
            </DialogTitle>
          </DialogHeader>

          {/* Header Controls */}
          <div className="flex justify-between items-center gap-4 py-4 border-b">
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <Label>Status:</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="needs_approval">Needs Approval</SelectItem>
                    <SelectItem value="outstanding">Outstanding</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Label>Priority:</Label>
                <Select value={filterPriority} onValueChange={setFilterPriority}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Organization Task
            </Button>
          </div>

          {/* Tasks List */}
          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-8">Loading organization tasks...</div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No organization tasks found. Create your first administrative task above.
              </div>
            ) : (
              filteredTasks.map((task: any) => {
                const assignments = getTaskAssignments(task.id);
                return (
                  <Card key={task.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            {getStatusIcon(task.status)}
                            {task.title}
                          </CardTitle>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={task.status}
                            onValueChange={(value) => updateTaskMutation.mutate({ 
                              taskId: task.id, 
                              updates: { status: value }
                            })}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="needs_approval">Needs Approval</SelectItem>
                              <SelectItem value="outstanding">Outstanding</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Badge className={getStatusColor(task.status)}>
                            {task.status.replace('_', ' ')}
                          </Badge>
                          <Badge className={getPriorityColor(task.priority)}>
                            {task.priority} priority
                          </Badge>
                          {task.dueDate && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              Due: {new Date(task.dueDate).toLocaleDateString()}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Team Member Assignments Display */}
                          {assignments.length > 0 && (
                            <div className="flex items-center gap-2">
                              <div className="flex -space-x-1">
                                {assignments.slice(0, 3).map((assignment: any) => (
                                  <div
                                    key={assignment.id}
                                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white border-2 border-white ${getTeamMemberColor(assignment.teamMember?.role || '')}`}
                                    title={`${assignment.teamMember?.name} (${assignment.teamMember?.role})`}
                                  >
                                    {getTeamMemberInitials(assignment.teamMember?.name || '')}
                                  </div>
                                ))}
                                {assignments.length > 3 && (
                                  <div className="w-6 h-6 rounded-full bg-gray-500 flex items-center justify-center text-xs font-medium text-white border-2 border-white">
                                    +{assignments.length - 3}
                                  </div>
                                )}
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {assignments.filter((a: any) => a.isCompleted).length} of {assignments.length} completed
                              </span>
                            </div>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedTaskForAssignment(task.id)}
                          >
                            <Users className="h-4 w-4 mr-1" />
                            Assign Team
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Organization Task Modal */}
      <CreateOrganizationTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          queryClient.invalidateQueries({ queryKey: ["/api/organizations", organization.id, "tasks"] });
        }}
        organizationId={organization.id}
        organizationName={organization.name}
        services={services}
      />

      {/* Task Assignment Modal */}
      {selectedTaskForAssignment && (
        <TaskAssignmentManager
          isOpen={!!selectedTaskForAssignment}
          onClose={() => setSelectedTaskForAssignment(null)}
          taskId={selectedTaskForAssignment}
          onAssignmentChange={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/task-assignments"] });
          }}
        />
      )}
    </>
  );
}