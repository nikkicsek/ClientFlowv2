import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Calendar, DollarSign, CheckCircle, Clock, AlertCircle, FileText, MessageSquare, Download, Eye, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import type { Project, Task, ProjectFile, Message, Service } from "@shared/schema";

export default function ClientView() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [projectId, setProjectId] = useState<string>("");
  const [viewingFile, setViewingFile] = useState<ProjectFile | null>(null);

  useEffect(() => {
    // Get the project ID from localStorage (set by admin)
    const storedProjectId = localStorage.getItem('adminViewingProject');
    if (storedProjectId) {
      setProjectId(storedProjectId);
    } else {
      // No project selected, redirect back to admin
      setLocation('/');
    }
  }, [setLocation]);

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: tasks } = useQuery<(Task & { service?: Service })[]>({
    queryKey: ["/api/projects", projectId, "tasks"],
    enabled: !!projectId,
  });

  const { data: files } = useQuery<ProjectFile[]>({
    queryKey: ["/api/projects", projectId, "files"],
    enabled: !!projectId,
  });

  const { data: messages } = useQuery<(Message & { sender: any })[]>({
    queryKey: ["/api/projects", projectId, "messages"],
    enabled: !!projectId,
  });

  const { data: analytics } = useQuery<any[]>({
    queryKey: ["/api/projects", projectId, "analytics"],
    enabled: !!projectId,
  });

  const handleBackToAdmin = () => {
    localStorage.removeItem('adminViewingProject');
    setLocation('/');
  };

  const handleFileDownload = async (fileId: string, fileName: string) => {
    try {
      const response = await apiRequest("GET", `/api/projects/${projectId}/files/${fileId}/download`);
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: "Download Started",
          description: `Downloading ${fileName}...`,
        });
        // In a real implementation, this would trigger the actual file download
        console.log('File download:', data);
      } else {
        toast({
          title: "Download Failed",
          description: data.message || "Could not download file",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error downloading file:", error);
      toast({
        title: "Download Error",
        description: "An error occurred while downloading the file",
        variant: "destructive",
      });
    }
  };

  const canDownloadFile = (file: ProjectFile) => {
    // Clients can download files that are:
    // - Approved (is_approved = true)
    // - Need changes (is_approved = false) - to see iteration history
    // - Don't require approval (is_approval_required = false)
    // They cannot download files pending approval (is_approved = null and is_approval_required = true)
    if (!file.isApprovalRequired) return true;
    if (file.isApproved === true || file.isApproved === false) return true;
    return false; // Pending approval
  };

  const handleFileView = (file: ProjectFile) => {
    setViewingFile(file);
  };

  const isViewableFile = (file: ProjectFile) => {
    const viewableTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'];
    return viewableTypes.includes(file.fileType) || file.fileType.startsWith('image/');
  };

  const renderFilePreview = (file: ProjectFile) => {
    if (file.fileType.startsWith('image/')) {
      return (
        <div className="flex justify-center">
          <img 
            src={`/api/projects/${projectId}/files/${file.id}/preview`} 
            alt={file.fileName}
            className="max-w-full max-h-96 object-contain rounded"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzljYTNhZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIG5vdCBhdmFpbGFibGU8L3RleHQ+PC9zdmc+';
            }}
          />
        </div>
      );
    } else if (file.fileType === 'application/pdf') {
      return (
        <div className="text-center p-8">
          <FileText className="h-16 w-16 mx-auto mb-4 text-red-600" />
          <p className="text-gray-600 mb-4">PDF Preview</p>
          <Button
            onClick={() => handleFileDownload(file.id, file.fileName)}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Open PDF
          </Button>
        </div>
      );
    } else {
      return (
        <div className="text-center p-8">
          <FileText className="h-16 w-16 mx-auto mb-4 text-gray-600" />
          <p className="text-gray-600 mb-2">File Preview Not Available</p>
          <p className="text-sm text-gray-500 mb-4">
            {file.fileType} • {file.category}
          </p>
          <Button
            onClick={() => handleFileDownload(file.id, file.fileName)}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download File
          </Button>
        </div>
      );
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'needs_approval':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      case 'outstanding':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'needs_clarification':
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'needs_approval':
        return 'bg-yellow-100 text-yellow-800';
      case 'outstanding':
        return 'bg-red-100 text-red-800';
      case 'needs_clarification':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading project...</p>
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
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackToAdmin}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Admin
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                <p className="text-gray-600">Client Dashboard View</p>
              </div>
            </div>
            <Badge variant={project.status === 'active' ? 'default' : 'secondary'}>
              {project.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Project Overview */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-full">
                  <Calendar className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Progress</p>
                  <p className="text-2xl font-bold text-gray-900">{project.progress || 0}%</p>
                </div>
              </div>
              <Progress value={project.progress || 0} className="mt-4" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-full">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Budget</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {project.budget ? `$${Number(project.budget).toLocaleString()}` : 'Not set'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-full">
                  <CheckCircle className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Completion Date</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {project?.expectedCompletion ? 
                      new Date(project.expectedCompletion).toLocaleDateString() : 
                      'TBD'
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="tasks" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="tasks">Tasks & Progress</TabsTrigger>
            <TabsTrigger value="files">Project Files</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Current Tasks</h3>
            {!tasks || tasks.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-gray-600">No tasks have been created yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {tasks?.map((task: Task & { service?: Service }) => (
                  <Card key={task.id}>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            {getStatusIcon(task.status)}
                            <h4 className="font-medium text-gray-900">{task.title}</h4>
                            <Badge className={getStatusColor(task.status)}>
                              {task.status.replace('_', ' ')}
                            </Badge>
                          </div>
                          {task.description && (
                            <p className="text-gray-600 mb-3">{task.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            {task.service && (
                              <span className="bg-gray-100 px-2 py-1 rounded">
                                {task.service.name}
                              </span>
                            )}
                            {task.dueDate && (
                              <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="files" className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Project Files</h3>
            {!files || files.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600">No files have been uploaded yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {files?.map((file: ProjectFile) => (
                  <Card key={file.id} className="relative">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <FileText className="h-8 w-8 text-blue-600 mt-1" />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 truncate mb-1">{file.fileName}</h4>
                          <p className="text-sm text-gray-500 mb-2">{file.category}</p>
                          
                          <div className="flex flex-col gap-2">
                            {file.isApprovalRequired && (
                              <Badge 
                                variant={file.isApproved === true ? 'default' : file.isApproved === false ? 'destructive' : 'secondary'}
                                className="w-fit"
                              >
                                {file.isApproved === true ? 'Approved' : file.isApproved === false ? 'Needs Changes' : 'Pending Review'}
                              </Badge>
                            )}
                            
                            {canDownloadFile(file) ? (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleFileDownload(file.id, file.fileName)}
                                  className="flex items-center gap-1 text-xs"
                                >
                                  <Download className="h-3 w-3" />
                                  Download
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleFileView(file)}
                                  className="flex items-center gap-1 text-xs"
                                  disabled={!isViewableFile(file)}
                                >
                                  <Eye className="h-3 w-3" />
                                  View
                                </Button>
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500 italic">
                                Pending approval - available soon
                              </div>
                            )}
                            
                            {file.isApproved === false && (
                              <p className="text-xs text-orange-600 mt-1">
                                View previous versions and requested changes
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Project Analytics</h3>
            {!analytics || analytics.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-gray-600">No analytics data available yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {analytics?.map((metric: any, index: number) => (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <h4 className="font-medium text-gray-900 capitalize">
                        {metric.metricType.replace('_', ' ')}
                      </h4>
                      <p className="text-2xl font-bold text-blue-600 mt-2">
                        {Number(metric.metricValue).toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {metric.period} • {new Date(metric.date).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="messages" className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Project Messages</h3>
            {!messages || messages.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <MessageSquare className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600">No messages yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {messages?.map((message: Message & { sender: any }) => (
                  <Card key={message.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-blue-600">
                              {message.sender.firstName?.[0] || message.sender.email[0].toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {message.sender.firstName} {message.sender.lastName} 
                              {message.sender.email === 'nikki@csekcreative.com' && ' (Agency)'}
                            </p>
                            <p className="text-sm text-gray-500">
                              {message.createdAt && new Date(message.createdAt).toLocaleDateString()} at {message.createdAt && new Date(message.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      </div>
                      <p className="text-gray-700">{message.content}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* File Viewer Modal */}
      {viewingFile && (
        <Dialog open={!!viewingFile} onOpenChange={() => setViewingFile(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <div className="flex justify-between items-start">
                <div>
                  <DialogTitle className="text-lg font-semibold">
                    {viewingFile.fileName}
                  </DialogTitle>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline">{viewingFile.category}</Badge>
                    {viewingFile.isApprovalRequired && (
                      <Badge 
                        variant={viewingFile.isApproved === true ? 'default' : viewingFile.isApproved === false ? 'destructive' : 'secondary'}
                      >
                        {viewingFile.isApproved === true ? 'Approved' : viewingFile.isApproved === false ? 'Needs Changes' : 'Pending Review'}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewingFile(null)}
                  className="flex items-center gap-1"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogHeader>
            
            <div className="mt-4">
              {renderFilePreview(viewingFile)}
            </div>

            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <div className="text-sm text-gray-500">
                Uploaded: {viewingFile.uploadedAt && new Date(viewingFile.uploadedAt).toLocaleDateString()}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleFileDownload(viewingFile.id, viewingFile.fileName)}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setViewingFile(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}