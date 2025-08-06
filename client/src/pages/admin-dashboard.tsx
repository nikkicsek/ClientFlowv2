import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Users, Briefcase, Settings, Eye, Building2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import CreateProjectModal from "@/components/create-project-modal";
import CreateTaskModal from "@/components/create-task-modal";
import { TeamManagementModal } from "@/components/team-management-modal";
import { OrganizationManagementModal } from "@/components/organization-management-modal";
import { AssignOrganizationModal } from "@/components/assign-organization-modal";
import { CreateClientModal } from "@/components/create-client-modal";
import { CreateServiceModal } from "@/components/create-service-modal";
import { EditServiceModal } from "@/components/edit-service-modal";
import { WelcomeVideoModal } from "@/components/welcome-video-modal";
import type { Project, Task, Service } from "@shared/schema";

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [editingService, setEditingService] = useState<Service | null>(null);

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
              <TeamManagementModal />
              <OrganizationManagementModal />
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
        <Tabs defaultValue="projects" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="projects">Projects</TabsTrigger>
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
                        <div className="flex gap-2 mt-4">
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
                        <div className="flex items-center gap-2">
                          <WelcomeVideoModal
                            clientName={`${client.firstName} ${client.lastName}`}
                            organizationName={client.companyName}
                            projectDetails="Thank you for choosing our agency for your project needs."
                          />
                          <AssignOrganizationModal user={client} />
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
                <p className="text-gray-600">Manage client business entities and group multiple contacts under organizations</p>
              </div>
            </div>

            <Card>
              <CardContent className="p-8 text-center">
                <Building2 className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Organize Your Clients</h3>
                <p className="text-gray-600 mb-4">
                  Create business organizations to group multiple client contacts together. This helps manage 
                  projects for companies with multiple stakeholders and points of contact.
                </p>
                <div className="bg-blue-50 p-4 rounded-lg mb-6">
                  <h4 className="font-medium text-blue-900 mb-2">Benefits of Organization Management:</h4>
                  <ul className="text-blue-800 text-sm space-y-1 text-left max-w-lg mx-auto">
                    <li>• Group multiple client contacts under one business entity</li>
                    <li>• Assign projects to organizations instead of individual clients</li>
                    <li>• Track business relationships and hierarchy</li>
                    <li>• Streamline communication with primary contacts</li>
                    <li>• Better organize large enterprise clients</li>
                  </ul>
                </div>
                <OrganizationManagementModal />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="services" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Available Services</h2>
                <p className="text-gray-600">Manage the services your agency offers to clients</p>
              </div>
              <CreateServiceModal />
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
    </div>
  );
}