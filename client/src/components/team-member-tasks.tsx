import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock, Calendar, Target, User, Building2, AlertTriangle, Edit } from 'lucide-react';
import CreateTaskModal from './create-task-modal';
import { useToast } from '@/hooks/use-toast';

interface TeamMemberTasksProps {
  teamMemberId: string;
  teamMemberName: string;
}

export function TeamMemberTasks({ teamMemberId, teamMemberName }: TeamMemberTasksProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingTask, setEditingTask] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Get tasks assigned to this team member
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["/api/team-members", teamMemberId, "assignments"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/team-members/${teamMemberId}/assignments`);
      return response.json();
    }
  });

  // Mark assignment as completed
  const completeAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const response = await apiRequest("PUT", `/api/assignments/${assignmentId}`, {
        isCompleted: true
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members", teamMemberId, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-assignments"] });
      toast({
        title: "Task completed",
        description: "Your task has been marked as completed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete task",
        variant: "destructive",
      });
    }
  });

  // Mark assignment as not completed (undo)
  const uncompleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const response = await apiRequest("PUT", `/api/assignments/${assignmentId}`, {
        isCompleted: false
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-members", teamMemberId, "assignments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/task-assignments"] });
      toast({
        title: "Task reopened",
        description: "Your task has been marked as not completed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reopen task",
        variant: "destructive",
      });
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-100 text-green-800";
      case "in_progress": return "bg-blue-100 text-blue-800";
      case "needs_approval": return "bg-yellow-100 text-yellow-800";
      case "outstanding": return "bg-red-100 text-red-800";
      case "needs_clarification": return "bg-purple-100 text-purple-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-600 text-white";
      case "high": return "bg-orange-500 text-white";
      case "medium": return "bg-yellow-500 text-white";
      case "low": return "bg-green-500 text-white";
      default: return "bg-gray-500 text-white";
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <div className="animate-pulse">Loading your tasks...</div>
        </CardContent>
      </Card>
    );
  }

  const completedAssignments = assignments.filter((a: any) => a.isCompleted);
  const pendingAssignments = assignments.filter((a: any) => !a.isCompleted);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Tasks</h2>
          <p className="text-gray-600">Tasks assigned to {teamMemberName}</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{pendingAssignments.length}</div>
            <div className="text-gray-600">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{completedAssignments.length}</div>
            <div className="text-gray-600">Completed</div>
          </div>
        </div>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Tasks Assigned</h3>
            <p className="text-gray-600">You don't have any tasks assigned at the moment. Check back later!</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Pending Tasks */}
          {pendingAssignments.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Pending Tasks ({pendingAssignments.length})
              </h3>
              <div className="space-y-3">
                {pendingAssignments.map((assignment: any) => (
                  <Card key={assignment.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-medium text-gray-900">{assignment.task.title}</h4>
                            {assignment.task.taskType === "milestone" && (
                              <Badge variant="outline" className="text-xs">
                                <Target className="h-3 w-3 mr-1" />
                                Milestone
                              </Badge>
                            )}
                            {assignment.task.priority && (
                              <Badge className={`text-xs ${getPriorityColor(assignment.task.priority)}`}>
                                {assignment.task.priority.toUpperCase()}
                              </Badge>
                            )}
                          </div>
                          
                          {assignment.task.description && (
                            <p className="text-sm text-gray-600 mb-2">{assignment.task.description}</p>
                          )}
                          
                          <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                            {assignment.project && (
                              <div className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                <span>{assignment.project.name}</span>
                              </div>
                            )}
                            {assignment.task.estimatedHours && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{assignment.task.estimatedHours}h estimated</span>
                              </div>
                            )}
                            {assignment.task.dueDate && (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>Due: {new Date(assignment.task.dueDate).toLocaleDateString()}</span>
                              </div>
                            )}
                          </div>
                          
                          <Badge className={getStatusColor(assignment.task.status)}>
                            {assignment.task.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingTask(assignment.task);
                              setShowEditModal(true);
                            }}
                            className="flex items-center gap-2"
                          >
                            <Edit className="h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            onClick={() => completeAssignmentMutation.mutate(assignment.id)}
                            disabled={completeAssignmentMutation.isPending}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Mark Complete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Completed Tasks */}
          {completedAssignments.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Completed Tasks ({completedAssignments.length})
              </h3>
              <div className="space-y-3">
                {completedAssignments.map((assignment: any) => (
                  <Card key={assignment.id} className="opacity-75 hover:opacity-100 transition-opacity">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-medium text-gray-900 line-through">{assignment.task.title}</h4>
                            <Badge className="bg-green-100 text-green-800 text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              COMPLETED
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            {assignment.project && (
                              <div className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                <span>{assignment.project.name}</span>
                              </div>
                            )}
                            <span>Completed: {new Date(assignment.updatedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => uncompleteAssignmentMutation.mutate(assignment.id)}
                          disabled={uncompleteAssignmentMutation.isPending}
                          className="ml-4"
                        >
                          Reopen
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      
      {/* Edit Task Modal */}
      {showEditModal && editingTask && (
        <CreateTaskModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingTask(null);
          }}
          projectId={editingTask.projectId}
          organizationId={editingTask.orgId}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/team-members", teamMemberId, "assignments"] });
          }}
          mode="edit"
          task={editingTask}
          onTaskUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/team-members", teamMemberId, "assignments"] });
          }}
        />
      )}
    </div>
  );
}