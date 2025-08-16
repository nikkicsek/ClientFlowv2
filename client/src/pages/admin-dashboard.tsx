import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Users, Briefcase, Settings, Eye, Building2, Edit, CheckSquare, Clock, AlertTriangle, Grid3X3, List, UserPlus, FolderOpen, GripVertical, Trash2 } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import CreateProjectModal from "@/components/create-project-modal";
import EditProjectModal from "@/components/edit-project-modal";
import CreateTaskModal from "@/components/create-task-modal";
import { TeamManagementModal } from "@/components/team-management-modal";
import { OrganizationManagementModal } from "@/components/organization-management-modal";
import { AssignOrganizationModal } from "@/components/assign-organization-modal";
import { CreateClientModal } from "@/components/create-client-modal";
import { CreateServiceModal } from "@/components/create-service-modal";
import { EditServiceModal } from "@/components/edit-service-modal";
import { ServiceCategoryModal } from "@/components/service-category-modal";
import { WelcomeVideoModal } from "@/components/welcome-video-modal";
import { EditClientModal } from "@/components/edit-client-modal";
import { AgencyTasksModal } from "@/components/agency-tasks-modal";
import { EditOrganizationModal } from "@/components/edit-organization-modal";
import { OrganizationContactsModal } from "@/components/organization-contacts-modal";
import { GoogleDriveLinks } from "@/components/google-drive-links";
import { ProposalManagement } from "@/components/proposal-management";
import { LiveDiseaseFreeProposal } from "@/components/live-disease-free-proposal";
import { RestoreDeletedItems } from "@/components/restore-deleted-items";
import type { Project, Task, Service, User, Organization } from "@shared/schema";

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingClient, setEditingClient] = useState<User | null>(null);
  const [showAgencyTasks, setShowAgencyTasks] = useState(false);
  const [selectedProjectForTasks, setSelectedProjectForTasks] = useState<Project | null>(null);
  const [showTeamManagement, setShowTeamManagement] = useState(false);
  const [activeTab, setActiveTab] = useState("projects");
  const [organizationViewMode, setOrganizationViewMode] = useState<"grid" | "list">("list");
  const [projectViewMode, setProjectViewMode] = useState<"grid" | "list">("list");
  const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null);
  const [viewingOrgContacts, setViewingOrgContacts] = useState<Organization | null>(null);
  const [selectedOrgForProjects, setSelectedOrgForProjects] = useState<string | null>(null);
  const [showLDFProposal, setShowLDFProposal] = useState(false);
  const [selectedClientForProposal, setSelectedClientForProposal] = useState<{clientId: string, organizationId?: string} | null>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Update project status mutation
  const updateProjectStatusMutation = useMutation({
    mutationFn: async ({ projectId, status }: { projectId: string; status: string }) => {
      const response = await fetch(`/api/admin/projects/${projectId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update project status');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects'] });
      toast({
        title: "Project status updated",
        description: "The project status has been updated successfully.",
      });
    },
  });

  // Reorder projects mutation
  const reorderProjectsMutation = useMutation({
    mutationFn: async ({ orgId, projectOrders }: { orgId: string; projectOrders: { id: string; displayOrder: number }[] }) => {
      const response = await fetch(`/api/admin/organizations/${orgId}/projects/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectOrders }),
      });
      if (!response.ok) throw new Error('Failed to reorder projects');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/projects'] });
    },
  });

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/admin/projects"],
  });

  const { data: services } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: clients } = useQuery<User[]>({
    queryKey: ["/api/admin/clients"],
  });

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/admin/organizations"],
  });

  const { data: allTasks, isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/admin/tasks"],
  });

  const handleProjectCreated = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
    setShowCreateProject(false);
    toast({
      title: "Project Created",
      description: "New project has been created successfully.",
    });
  };

  const handleTaskCreated = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", selectedProject, "tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
    setShowCreateTask(false);
    toast({
      title: "Task Created",
      description: "New task has been added to the project.",
    });
  };

  // Handle drag end for project reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id && selectedOrgForProjects) {
      const orgProjects = projects?.filter(p => p.organizationId === selectedOrgForProjects) || [];
      const sortedProjects = orgProjects.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
      
      const oldIndex = sortedProjects.findIndex(p => p.id === active.id);
      const newIndex = sortedProjects.findIndex(p => p.id === over?.id);

      const newOrder = arrayMove(sortedProjects, oldIndex, newIndex);
      const projectOrders = newOrder.map((project, index) => ({
        id: project.id,
        displayOrder: index,
      }));

      reorderProjectsMutation.mutate({
        orgId: selectedOrgForProjects,
        projectOrders,
      });
    }
  };

  // Get status badge variant and color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return { variant: 'default' as const, label: 'Active' };
      case 'completed':
        return { variant: 'default' as const, label: 'Completed' };
      case 'on_hold':
        return { variant: 'secondary' as const, label: 'On Hold' };
      case 'pending':
        return { variant: 'outline' as const, label: 'Pending' };
      default:
        return { variant: 'secondary' as const, label: status };
    }
  };

  const handleViewAsClient = (projectId: string) => {
    // Store the selected project ID and switch to client view
    localStorage.setItem('adminViewingProject', projectId);
    window.location.href = '/client-view';
  };

  // Sortable project card component
  function SortableProjectCard({ project }: { project: Project }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
    } = useSortable({ id: project.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    const statusBadge = getStatusBadge(project.status);

    return (
      <Card 
        ref={setNodeRef} 
        style={style} 
        className="hover:shadow-md transition-shadow"
      >
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-2 flex-1">
              {selectedOrgForProjects && (
                <div 
                  {...attributes} 
                  {...listeners}
                  className="cursor-grab active:cursor-grabbing mt-1"
                >
                  <GripVertical className="h-4 w-4 text-gray-400" />
                </div>
              )}
              <div className="flex-1">
                <CardTitle className="text-lg">{project.name}</CardTitle>
                <p className="text-sm text-gray-600 mt-1">{project.description}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Select 
                value={project.status} 
                onValueChange={(status) => updateProjectStatusMutation.mutate({ projectId: project.id, status })}
              >
                <SelectTrigger className="w-32">
                  <SelectValue>
                    <Badge variant={statusBadge.variant}>
                      {statusBadge.label}
                    </Badge>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Progress:</span>
              <span className="font-medium">{project.progress || 0}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full" 
                style={{ width: `${project.progress || 0}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Budget:</span>
              <span className="font-medium">
                {project.budget ? `$${Number(project.budget).toLocaleString()}` : 'Not set'}
              </span>
            </div>
            
            <div className="mt-4 pt-4 border-t">
              <GoogleDriveLinks project={project} />
            </div>
            
            <div className="flex gap-2 mt-4 flex-wrap">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setEditingProject(project)}
              >
                <Settings className="h-3 w-3 mr-1" />
                Edit
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setSelectedProject(project.id);
                  setShowCreateTask(true);
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Task
              </Button>
              <Button 
                variant="default" 
                size="sm"
                onClick={() => {
                  setSelectedProjectForTasks(project);
                  setShowAgencyTasks(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <CheckSquare className="h-3 w-3 mr-1" />
                Agency Tasks
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleViewAsClient(project.id)}
              >
                <Eye className="h-3 w-3 mr-1" />
                View as Client
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sortable project list item component
  function SortableProjectListItem({ project }: { project: Project }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
    } = useSortable({ id: project.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    const statusBadge = getStatusBadge(project.status);

    return (
      <div 
        ref={setNodeRef} 
        style={style} 
        className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            {selectedOrgForProjects && (
              <div 
                {...attributes} 
                {...listeners}
                className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded"
                title="Drag to reorder"
              >
                <GripVertical className="h-4 w-4 text-gray-400" />
              </div>
            )}
            <div className="flex items-center gap-3 flex-1">
              <h3 className="font-medium text-gray-900 truncate flex-1">{project.name}</h3>
              <Select 
                value={project.status} 
                onValueChange={(status) => updateProjectStatusMutation.mutate({ projectId: project.id, status })}
              >
                <SelectTrigger className="w-28">
                  <SelectValue>
                    <Badge variant={statusBadge.variant} className="text-xs">
                      {statusBadge.label}
                    </Badge>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setEditingProject(project)}
              title="Edit Project"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                setSelectedProject(project.id);
                setShowCreateTask(true);
              }}
              title="Add Task"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                setSelectedProjectForTasks(project);
                setShowAgencyTasks(true);
              }}
              title="Agency Tasks"
              className="text-indigo-600 hover:text-indigo-700"
            >
              <CheckSquare className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => handleViewAsClient(project.id)}
              title="View as Client"
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (projectsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Agency Dashboard</h1>
              <p className="text-gray-600">Manage clients, projects, and team activities</p>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => setShowTeamManagement(true)}
                className="flex items-center gap-2"
              >
                <Users className="h-4 w-4" />
                Team Members
              </Button>
              <Button
                variant="outline"
                onClick={() => setActiveTab("organizations")}
                className="flex items-center gap-2"
              >
                <Building2 className="h-4 w-4" />
                Organizations
              </Button>
              <Button
                variant="outline"
                onClick={() => setActiveTab("deleted")}
                className="flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Restore Items
              </Button>
              <Badge variant="secondary">Admin</Badge>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user?.firstName || user?.email} {user?.lastName || ''}
                </p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => window.location.href = "/api/logout"}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="proposals">Proposals</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="organizations">Organizations</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="deleted">Deleted Items</TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {selectedOrgForProjects 
                    ? `${organizations?.find(org => org.id === selectedOrgForProjects)?.name} Projects` 
                    : 'All Projects'
                  }
                </h2>
                {selectedOrgForProjects && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedOrgForProjects(null)}
                    className="mt-1 text-blue-600 hover:text-blue-700"
                  >
                    ← Back to All Projects
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex rounded-md border border-gray-300">
                  <Button
                    variant={projectViewMode === "list" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setProjectViewMode("list")}
                    className="rounded-r-none"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={projectViewMode === "grid" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setProjectViewMode("grid")}
                    className="rounded-l-none"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                </div>
                <Button 
                  onClick={() => setShowCreateProject(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Project
                </Button>
              </div>
            </div>

            {!projects || projects.length === 0 || (selectedOrgForProjects && projects.filter(p => p.organizationId === selectedOrgForProjects).length === 0) ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Briefcase className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Projects Yet</h3>
                  <p className="text-gray-600 mb-4">Create your first client project to get started.</p>
                  <Button 
                    onClick={() => setShowCreateProject(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Project
                  </Button>
                </CardContent>
              </Card>
            ) : selectedOrgForProjects ? (
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={projects.filter(p => p.organizationId === selectedOrgForProjects)
                    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
                    .map(p => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {projectViewMode === "grid" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {projects.filter(p => p.organizationId === selectedOrgForProjects)
                        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
                        .map((project: Project) => (
                          <SortableProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {projects.filter(p => p.organizationId === selectedOrgForProjects)
                        .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
                        .map((project: Project) => (
                          <SortableProjectListItem key={project.id} project={project} />
                        ))}
                    </div>
                  )}
                </SortableContext>
              </DndContext>
            ) : (
              // All Projects view - no drag and drop
              projectViewMode === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {projects.map((project: Project) => (
                    <SortableProjectCard key={project.id} project={project} />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {projects.map((project: Project) => (
                    <SortableProjectListItem key={project.id} project={project} />
                  ))}
                </div>
              )
            )}
          </TabsContent>

          <TabsContent value="proposals" className="space-y-6">
            <ProposalManagement />
          </TabsContent>

          <TabsContent value="tasks" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">All Tasks</h2>
              <p className="text-gray-600">View and manage tasks across all projects</p>
            </div>

            {tasksLoading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-gray-200 rounded"></div>
                ))}
              </div>
            ) : !allTasks || allTasks.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Settings className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Tasks Yet</h3>
                  <p className="text-gray-600 mb-4">Tasks will appear here as you add them to your projects.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {allTasks.map((task: any) => (
                  <Card key={task.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-medium text-gray-900">{task.title}</h3>
                            <Badge variant={
                              task.status === 'completed' ? 'default' :
                              task.status === 'in_progress' ? 'secondary' :
                              task.status === 'needs_approval' ? 'outline' :
                              'destructive'
                            }>
                              {task.status === 'in_progress' ? 'In Progress' :
                               task.status === 'completed' ? 'Completed' :
                               task.status === 'needs_approval' ? 'Needs Approval' :
                               task.status === 'outstanding' ? 'Outstanding' :
                               'Needs Clarification'}
                            </Badge>
                          </div>
                          {task.description && (
                            <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span>Project: <strong>{task.project?.name || 'Unknown Project'}</strong></span>
                            {task.service && (
                              <span>Service: <strong>{task.service.name}</strong></span>
                            )}
                            {task.dueDate && (
                              <span>Due: <strong>{new Date(task.dueDate).toLocaleDateString()}</strong></span>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-sm text-gray-500">
                          {task.createdAt && (
                            <p>Created: {new Date(task.createdAt).toLocaleDateString()}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="clients" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Client Accounts</h2>
              <CreateClientModal />
            </div>

            {!clients || clients.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Users className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Clients Yet</h3>
                  <p className="text-gray-600">Clients will appear here when they sign up or when you create projects for them.</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {clients.map((client: any) => (
                      <div key={client.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <Users className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900">
                              {client.firstName} {client.lastName}
                            </h3>
                            <p className="text-sm text-gray-600">{client.email}</p>
                            {client.companyName && (
                              <p className="text-sm text-gray-500">{client.companyName}</p>
                            )}
                            {client.organizationId && (
                              <Badge variant="secondary" className="mt-1">
                                <Building2 className="h-3 w-3 mr-1" />
                                Organization Member
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingClient(client)}
                            title="Edit Client"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AssignOrganizationModal user={client} />
                          <WelcomeVideoModal
                            clientName={`${client.firstName} ${client.lastName}`}
                            organizationName={client.companyName}
                            projectDetails="Thank you for choosing our agency for your project needs."
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="organizations" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Business Organizations</h2>
                <p className="text-gray-600">Manage client business entities</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center border rounded-lg">
                  <Button
                    variant={organizationViewMode === "grid" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setOrganizationViewMode("grid")}
                    className="rounded-r-none"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={organizationViewMode === "list" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setOrganizationViewMode("list")}
                    className="rounded-l-none"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
                <OrganizationManagementModal />
              </div>
            </div>

            {!organizations || organizations.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Building2 className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Organizations</h3>
                  <p className="text-gray-600 mb-4">No organizations have been created yet.</p>
                  <OrganizationManagementModal />
                </CardContent>
              </Card>
            ) : organizationViewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {organizations
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((org) => (
                  <Card key={org.id} className="group hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <Building2 className="h-8 w-8 text-blue-600" />
                          <div>
                            <h3 className="font-semibold text-gray-900">{org.name}</h3>
                            {org.industry && (
                              <Badge variant="secondary" className="mt-1">
                                {org.industry}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedOrgForProjects(org.id);
                              setActiveTab("projects");
                            }}
                            title={`View Projects (${projects?.filter(p => p.organizationId === org.id).length || 0})`}
                          >
                            <FolderOpen className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingOrgContacts(org)}
                            title="Manage Contacts"
                          >
                            <Users className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingOrganization(org)}
                            title="Edit Organization"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      {org.description && (
                        <p className="text-gray-600 text-sm mb-3">{org.description}</p>
                      )}
                      
                      <div className="space-y-2 text-sm text-gray-500">
                        {org.website && (
                          <div className="flex items-center gap-2">
                            <span>Website:</span>
                            <a 
                              href={org.website} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-blue-600 hover:underline truncate"
                            >
                              {org.website}
                            </a>
                          </div>
                        )}
                        <div>
                          Created: {new Date(org.createdAt).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-blue-600">
                          {projects?.filter(p => p.organizationId === org.id).length || 0} projects
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {organizations
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((org) => (
                  <Card key={org.id} className="group hover:shadow-sm transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <Building2 className="h-6 w-6 text-blue-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-gray-900 truncate">{org.name}</h3>
                              {org.industry && (
                                <Badge variant="secondary" className="flex-shrink-0">
                                  {org.industry}
                                </Badge>
                              )}
                            </div>
                            {org.description && (
                              <p className="text-gray-600 text-sm mb-1 line-clamp-1">{org.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              {org.website && (
                                <a 
                                  href={org.website} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-blue-600 hover:underline truncate max-w-48"
                                >
                                  {org.website}
                                </a>
                              )}
                              <span>Created: {new Date(org.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedOrgForProjects(org.id);
                              setActiveTab("projects");
                            }}
                            title={`View Projects (${projects?.filter(p => p.organizationId === org.id).length || 0})`}
                          >
                            <FolderOpen className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingOrgContacts(org)}
                            title="Manage Contacts"
                          >
                            <Users className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingOrganization(org)}
                            title="Edit Organization"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="services" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Available Services</h2>
                <p className="text-gray-600">Manage the services your agency offers to clients</p>
              </div>
              <div className="flex gap-2">
                <ServiceCategoryModal />
                <CreateServiceModal />
              </div>
            </div>

            {!services || services.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Settings className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Services</h3>
                  <p className="text-gray-600 mb-4">No services are currently configured. Add your first service to start organizing your offerings.</p>
                  <CreateServiceModal />
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {services.map((service: Service) => (
                  <Card key={service.id} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{service.name}</h3>
                          <p className="text-sm text-gray-600 mt-1">{service.description}</p>
                        </div>
                        <Badge variant="outline" className="ml-2">{service.category}</Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <Badge variant={service.isActive ? "default" : "secondary"}>
                          {service.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setEditingService(service)}
                        >
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="deleted" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Deleted Items</h2>
              <p className="text-gray-600">Restore accidentally deleted items</p>
            </div>
            
            <RestoreDeletedItems />
          </TabsContent>
        </Tabs>
      </div>

      <CreateProjectModal
        isOpen={showCreateProject}
        onClose={() => setShowCreateProject(false)}
        onSuccess={handleProjectCreated}
      />

      <CreateTaskModal
        isOpen={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        onSuccess={handleTaskCreated}
        projectId={selectedProject}
        services={services || []}
      />

      <EditServiceModal
        service={editingService}
        isOpen={!!editingService}
        onClose={() => setEditingService(null)}
      />

      <EditProjectModal
        project={editingProject}
        isOpen={!!editingProject}
        onClose={() => setEditingProject(null)}
      />

      <EditClientModal
        client={editingClient}
        isOpen={!!editingClient}
        onClose={() => setEditingClient(null)}
      />

      <AgencyTasksModal
        isOpen={showAgencyTasks}
        onClose={() => {
          setShowAgencyTasks(false);
          setSelectedProjectForTasks(null);
        }}
        project={selectedProjectForTasks}
      />

      <TeamManagementModal
        isOpen={showTeamManagement}
        onClose={() => setShowTeamManagement(false)}
      />

      <EditOrganizationModal
        organization={editingOrganization}
        isOpen={!!editingOrganization}
        onClose={() => setEditingOrganization(null)}
      />

      <OrganizationContactsModal
        organization={viewingOrgContacts}
        isOpen={!!viewingOrgContacts}
        onClose={() => setViewingOrgContacts(null)}
      />

    </div>
  );
}