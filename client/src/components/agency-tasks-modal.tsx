import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  CheckSquare, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  User, 
  Target,
  PlayCircle,
  CheckCircle,
  XCircle,
  AlertCircle,
  Camera,
  PenTool,
  Palette,
  BarChart3,
  UserPlus,
  Edit3
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Project, Task } from "@shared/schema";

interface AgencyTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
}

export function AgencyTasksModal({ isOpen, onClose, project }: AgencyTasksModalProps) {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newAssignee, setNewAssignee] = useState("");

  // Common team member names for quick assignment
  const teamMembers = [
    "Sarah (Content Writer)",
    "Mike (Photographer)", 
    "Alex (Designer)",
    "Jamie (Project Manager)",
    "Taylor (Content Writer)",
    "Chris (Photographer)",
    "Sam (Designer)"
  ];

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["/api/projects", project?.id, "tasks"],
    enabled: !!project?.id && isOpen,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/projects/${project?.id}/tasks`);
      return response.json();
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: any }) => {
      const response = await apiRequest("PUT", `/api/tasks/${taskId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project?.id, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
    },
  });

  if (!project) return null;

  // Filter tasks based on selected filters
  const filteredTasks = tasks?.filter((task: any) => {
    const statusMatch = filterStatus === "all" || task.status === filterStatus;
    const priorityMatch = filterPriority === "all" || task.priority === filterPriority;
    const roleMatch = filterRole === "all" || task.assigneeRole === filterRole;
    return statusMatch && priorityMatch && roleMatch;
  }) || [];

  // Group tasks by workflow phase for Faces of Kelowna projects
  const isFacesProject = project.name.includes("Faces of Kelowna");
  const groupedTasks = isFacesProject ? {
    contract: filteredTasks.filter((t: any) => t.title.toLowerCase().includes("contract") || t.title.toLowerCase().includes("payment")),
    content: filteredTasks.filter((t: any) => t.title.toLowerCase().includes("interview") || t.title.toLowerCase().includes("content") || t.title.toLowerCase().includes("writing")),
    photography: filteredTasks.filter((t: any) => t.title.toLowerCase().includes("photo") || t.title.toLowerCase().includes("studio")),
    production: filteredTasks.filter((t: any) => t.title.toLowerCase().includes("magazine") || t.title.toLowerCase().includes("approval") || t.title.toLowerCase().includes("printing")),
    distribution: filteredTasks.filter((t: any) => t.title.toLowerCase().includes("distribution") || t.title.toLowerCase().includes("kelownanow") || t.title.toLowerCase().includes("social") || t.title.toLowerCase().includes("livestream")),
    ongoing: filteredTasks.filter((t: any) => t.title.toLowerCase().includes("annual") || t.title.toLowerCase().includes("weekly"))
  } : {};

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "in_progress": return <PlayCircle className="h-4 w-4 text-blue-600" />;
      case "needs_approval": return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      case "outstanding": return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "photographer": return <Camera className="h-4 w-4" />;
      case "content_writer": return <PenTool className="h-4 w-4" />;
      case "designer": return <Palette className="h-4 w-4" />;
      case "project_manager": return <BarChart3 className="h-4 w-4" />;
      default: return <User className="h-4 w-4" />;
    }
  };

  const TaskCard = ({ task }: { task: any }) => (
    <Card className="mb-3 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {getStatusIcon(task.status)}
              <h4 className="font-medium text-gray-900">{task.title}</h4>
              {task.taskType === "milestone" && (
                <Badge variant="outline" className="text-xs">
                  <Target className="h-3 w-3 mr-1" />
                  Milestone
                </Badge>
              )}
              {task.priority === "high" && (
                <Badge variant="destructive" className="text-xs">High Priority</Badge>
              )}
              {task.priority === "urgent" && (
                <Badge variant="destructive" className="text-xs bg-red-600">URGENT</Badge>
              )}
            </div>
            {task.description && (
              <p className="text-sm text-gray-600 mb-2">{task.description}</p>
            )}
            
            {/* Assignment Section */}
            {task.assignedToMember && (
              <div className="mb-2 p-2 bg-blue-50 rounded text-sm">
                <div className="flex items-center gap-1 text-blue-700">
                  <User className="h-3 w-3" />
                  <span className="font-medium">Assigned to: {task.assignedToMember}</span>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {task.assigneeRole && (
                <div className="flex items-center gap-1">
                  {getRoleIcon(task.assigneeRole)}
                  <span className="capitalize">{task.assigneeRole.replace("_", " ")}</span>
                </div>
              )}
              {task.estimatedHours && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{task.estimatedHours}h estimated</span>
                </div>
              )}
              {task.dueDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>
            
            {/* Assignment and Priority Controls */}
            {editingTaskId === task.id ? (
              <div className="mt-3 space-y-2 p-3 bg-gray-50 rounded">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Assign to Team Member</Label>
                    <Select
                      value={newAssignee}
                      onValueChange={setNewAssignee}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Choose team member" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {teamMembers.map((member) => (
                          <SelectItem key={member} value={member}>{member}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Priority</Label>
                    <Select
                      value={task.priority}
                      onValueChange={(newPriority) => 
                        updateTaskMutation.mutate({ 
                          taskId: task.id, 
                          updates: { priority: newPriority } 
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">URGENT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      const assigneeValue = newAssignee === "unassigned" ? null : newAssignee;
                      updateTaskMutation.mutate({ 
                        taskId: task.id, 
                        updates: { assignedToMember: assigneeValue } 
                      });
                      setEditingTaskId(null);
                      setNewAssignee("");
                    }}
                    className="h-7 text-xs"
                  >
                    Save Assignment
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingTaskId(null);
                      setNewAssignee("");
                    }}
                    className="h-7 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingTaskId(task.id);
                    setNewAssignee(task.assignedToMember || "unassigned");
                  }}
                  className="h-7 text-xs"
                >
                  <UserPlus className="h-3 w-3 mr-1" />
                  Assign/Edit
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Select
              value={task.status}
              onValueChange={(newStatus) => 
                updateTaskMutation.mutate({ 
                  taskId: task.id, 
                  updates: { status: newStatus } 
                })
              }
            >
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="needs_approval">Needs Approval</SelectItem>
                <SelectItem value="outstanding">Outstanding</SelectItem>
                <SelectItem value="needs_clarification">Needs Clarification</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Agency Tasks: {project.name}
          </DialogTitle>
          <DialogDescription>
            Manage internal team workflows, assign tasks to specific team members, and track project progress.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Project Summary */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-medium text-blue-900">Project Overview</h3>
                <p className="text-blue-700 text-sm mt-1">{project.description}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-900">
                  {project.budget ? `$${Number(project.budget).toLocaleString()}` : 'Budget TBD'}
                </div>
                <div className="text-blue-700 text-sm">{project.progress || 0}% Complete</div>
              </div>
            </div>
          </div>

          {/* Team Workload Summary */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Team Workload Summary
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {teamMembers.map((member) => {
                const memberTasks = filteredTasks.filter((t: any) => t.assignedToMember === member);
                const activeTasks = memberTasks.filter((t: any) => t.status === 'in_progress').length;
                const completedTasks = memberTasks.filter((t: any) => t.status === 'completed').length;
                return (
                  <div key={member} className="text-center bg-white p-2 rounded">
                    <div className="font-medium text-blue-800">{member.split(' (')[0]}</div>
                    <div className="text-blue-600 text-xs">{activeTasks} active • {completedTasks} done</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-4 items-center flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Status:</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32">
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
              <label className="text-sm font-medium">Priority:</label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Role:</label>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="project_manager">Project Manager</SelectItem>
                  <SelectItem value="content_writer">Content Writer</SelectItem>
                  <SelectItem value="photographer">Photographer</SelectItem>
                  <SelectItem value="designer">Designer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8">Loading tasks...</div>
          ) : isFacesProject ? (
            /* Faces of Kelowna Workflow View */
            <Tabs defaultValue="workflow" className="w-full">
              <TabsList>
                <TabsTrigger value="workflow">Workflow Phases</TabsTrigger>
                <TabsTrigger value="all">All Tasks</TabsTrigger>
              </TabsList>
              
              <TabsContent value="workflow" className="space-y-6">
                {Object.entries(groupedTasks).map(([phase, phaseTasks]) => (
                  phaseTasks.length > 0 && (
                    <Card key={phase}>
                      <CardHeader>
                        <CardTitle className="capitalize flex items-center gap-2">
                          {phase === "contract" && <BarChart3 className="h-5 w-5" />}
                          {phase === "content" && <PenTool className="h-5 w-5" />}
                          {phase === "photography" && <Camera className="h-5 w-5" />}
                          {phase === "production" && <Palette className="h-5 w-5" />}
                          {phase === "distribution" && <Target className="h-5 w-5" />}
                          {phase === "ongoing" && <Clock className="h-5 w-5" />}
                          {phase.replace("_", " ")} Phase ({phaseTasks.length} tasks)
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {phaseTasks.map((task: any) => (
                          <TaskCard key={task.id} task={task} />
                        ))}
                      </CardContent>
                    </Card>
                  )
                ))}
              </TabsContent>
              
              <TabsContent value="all">
                {filteredTasks.map((task: any) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </TabsContent>
            </Tabs>
          ) : (
            /* Standard Task View for Other Projects */
            <div className="space-y-3">
              {filteredTasks.map((task: any) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}

          {filteredTasks.length === 0 && !isLoading && (
            <div className="text-center py-8 text-gray-500">
              No tasks found with the selected filters.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}