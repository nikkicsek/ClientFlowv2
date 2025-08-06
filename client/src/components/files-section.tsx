import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, FileImage, FileText, FileSpreadsheet, Folder, File } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import FileUploadModal from "./file-upload-modal";
import type { ProjectFile } from "@shared/schema";

export default function FilesSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showUploadModal, setShowUploadModal] = useState(false);

  const { data: projects } = useQuery({
    queryKey: ["/api/projects"],
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

  const activeProject = projects?.[0];

  const { data: files, isLoading } = useQuery({
    queryKey: ["/api/projects", activeProject?.id, "files"],
    enabled: !!activeProject?.id,
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

  const downloadMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await apiRequest("GET", `/api/files/${fileId}/download`);
      return response;
    },
    onSuccess: async (response, fileId) => {
      const file = files?.find(f => f.id === fileId);
      if (file && response.body) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
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
      toast({
        title: "Download Failed",
        description: "Unable to download the file. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-64 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const getFileIcon = (fileType: string, fileName: string) => {
    if (fileType?.startsWith('image/')) return FileImage;
    if (fileType?.includes('pdf')) return FileText;
    if (fileType?.includes('spreadsheet') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) return FileSpreadsheet;
    if (fileType?.includes('document') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) return FileText;
    return File;
  };

  const getFileIconColor = (fileType: string, fileName: string) => {
    if (fileType?.startsWith('image/')) return 'text-blue-600';
    if (fileType?.includes('pdf')) return 'text-red-600';
    if (fileType?.includes('spreadsheet') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) return 'text-green-600';
    if (fileType?.includes('document') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) return 'text-blue-600';
    return 'text-gray-600';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFilesByCategory = (category: string) => {
    if (!files) return [];
    return files.filter(file => file.category === category);
  };

  const categories = [
    {
      id: 'design',
      title: 'Design Assets',
      icon: FileImage,
      files: getFilesByCategory('design')
    },
    {
      id: 'document',
      title: 'Documents',
      icon: FileText,
      files: getFilesByCategory('document')
    },
    {
      id: 'report',
      title: 'Reports',
      icon: FileSpreadsheet,
      files: getFilesByCategory('report')
    }
  ];

  const handleDownload = (fileId: string) => {
    downloadMutation.mutate(fileId);
  };

  const handleUploadSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", activeProject?.id, "files"] });
    setShowUploadModal(false);
    toast({
      title: "File Uploaded",
      description: "Your file has been uploaded successfully.",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Project Files</h2>
          <p className="text-gray-600">Access designs, documents, and deliverables</p>
        </div>
        <Button 
          onClick={() => setShowUploadModal(true)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload File
        </Button>
      </div>

      {!files || files.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-gray-500">
              <Folder className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Files Available</h3>
              <p>Project files will appear here as they are uploaded.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {categories.map((category) => {
            const CategoryIcon = category.icon;
            return (
              <Card key={category.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-600">
                    <CategoryIcon className="h-5 w-5" />
                    {category.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {category.files.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No files in this category</p>
                  ) : (
                    <div className="space-y-3">
                      {category.files.map((file) => {
                        const FileIcon = getFileIcon(file.fileType || '', file.fileName);
                        const iconColor = getFileIconColor(file.fileType || '', file.fileName);
                        
                        return (
                          <div key={file.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <FileIcon className={`h-6 w-6 ${iconColor}`} />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">{file.fileName}</p>
                              <div className="flex items-center gap-2 text-sm text-gray-500">
                                <span>{file.fileSize ? formatFileSize(file.fileSize) : 'Unknown size'}</span>
                                <span>•</span>
                                <span>{new Date(file.createdAt).toLocaleDateString()}</span>
                              </div>
                              {file.isApprovalRequired && (
                                <Badge variant="secondary" className="mt-1">
                                  {file.isApproved ? 'Approved' : 'Pending Approval'}
                                </Badge>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownload(file.id)}
                              disabled={downloadMutation.isPending}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <FileUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={handleUploadSuccess}
        projectId={activeProject?.id || ''}
      />
    </div>
  );
}
