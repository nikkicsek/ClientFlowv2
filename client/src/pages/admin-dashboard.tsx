import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Users, Briefcase, Settings, Eye, Building2, Edit, CheckSquare, Clock, AlertTriangle, Grid3X3, List } from "lucide-react";
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
import type { Project, Task, Service, User } from "@shared/schema";

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
  const [organizationViewMode, setOrganizationViewMode] = useState<"grid" | "list">("grid");

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/admin/projects"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/projects");
      return response.json();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
    },
  });

  const { data: services } = useQuery({
    queryKey: ["/api/services"],
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["/api/admin/clients"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/clients");
      return response.json();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
    },
  });

  const { data: organizations } = useQuery({
    queryKey: ["/api/admin/organizations"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/organizations");
      return response.json();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
    },
  });

  const { data: allTasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["/api/admin/tasks"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/tasks");
      return response.json();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
    },
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

  const handleViewAsClient = (projectId: string) => {
    // Store the selected project ID and switch to client view
    localStorage.setItem('adminViewingProject', projectId);
    window.location.href = '/client-view';
  };

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
              <Badge variant="secondary">Admin</Badge>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user?.firstName} {user?.lastName}
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
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="organizations">Organizations</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">All Projects</h2>
              <Button 
                onClick={() => setShowCreateProject(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Project
              </Button>
            </div>

            {!projects || projects.length === 0 ? (
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
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project: Project) => (
                  <Card key={project.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{project.name}</CardTitle>
                          <p className="text-sm text-gray-600 mt-1">{project.description}</p>
                        </div>
                        <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
                          {project.status}
                        </Badge>
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
                ))}
              </div>
            )}
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {clients.map((client: any) => (
                  <Card key={client.id}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <Users className="h-6 w-6 text-blue-600" />
                          </div>
                          <div>
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
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingClient(client)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <AssignOrganizationModal user={client} />
                          </div>
                          <div className="flex justify-end">
                            <WelcomeVideoModal
                              clientName={`${client.firstName} ${client.lastName}`}
                              organizationName={client.companyName}
                              projectDetails="Thank you for choosing our agency for your project needs."
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
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
                  <Card key={org.id} className="hover:shadow-md transition-shadow">
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
                  <Card key={org.id} className="hover:shadow-sm transition-shadow">
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


    </div>
  );
}