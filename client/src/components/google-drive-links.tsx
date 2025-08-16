import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { FolderOpen, ExternalLink, Plus, Edit2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const googleDriveSchema = z.object({
  googleDriveFolderId: z.string().optional(),
  googleDriveFolderUrl: z.string().url("Please enter a valid Google Drive URL").optional(),
});

type GoogleDriveFormData = z.infer<typeof googleDriveSchema>;

interface GoogleDriveLinksProps {
  project: {
    id: string;
    name: string;
    googleDriveFolderId?: string | null;
    googleDriveFolderUrl?: string | null;
  };
}

export function GoogleDriveLinks({ project }: GoogleDriveLinksProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<GoogleDriveFormData>({
    resolver: zodResolver(googleDriveSchema),
    defaultValues: {
      googleDriveFolderId: project.googleDriveFolderId || "",
      googleDriveFolderUrl: project.googleDriveFolderUrl || "",
    },
  });

  const updateGoogleDriveMutation = useMutation({
    mutationFn: async (data: GoogleDriveFormData) => {
      const response = await fetch(`/api/admin/projects/${project.id}/google-drive`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update Google Drive links');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      toast({
        title: "Google Drive links updated",
        description: "Project file links have been successfully updated.",
      });
      setIsOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error updating Google Drive links",
        description: error.message || "Failed to update Google Drive links",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: GoogleDriveFormData) => {
    updateGoogleDriveMutation.mutate(data);
  };

  const extractFolderIdFromUrl = (url: string): string => {
    // Extract folder ID from Google Drive URL patterns
    const patterns = [
      /\/folders\/([a-zA-Z0-9-_]+)/,
      /id=([a-zA-Z0-9-_]+)/,
      /\/d\/([a-zA-Z0-9-_]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    
    return url; // Return as-is if no pattern matches
  };

  const handleUrlChange = (url: string) => {
    if (url) {
      const folderId = extractFolderIdFromUrl(url);
      form.setValue("googleDriveFolderId", folderId);
    }
    form.setValue("googleDriveFolderUrl", url);
  };

  const hasGoogleDriveLink = project.googleDriveFolderUrl;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Project Files</h3>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              {hasGoogleDriveLink ? (
                <>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit Google Drive Link
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Link Google Drive Folder
                </>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {hasGoogleDriveLink ? "Edit" : "Add"} Google Drive Folder
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="googleDriveFolderUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Google Drive Folder URL</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="https://drive.google.com/drive/folders/..."
                          onChange={(e) => {
                            field.onChange(e);
                            handleUrlChange(e.target.value);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="googleDriveFolderId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Folder ID (auto-extracted)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Folder ID will be extracted automatically"
                          readOnly
                          className="bg-gray-50"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={updateGoogleDriveMutation.isPending}
                  >
                    {updateGoogleDriveMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {hasGoogleDriveLink ? (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FolderOpen className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium">Client Project Folder</p>
                  <p className="text-sm text-gray-500">
                    Google Drive folder for {project.name}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(project.googleDriveFolderUrl!, "_blank")}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Folder
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-6 text-center">
            <FolderOpen className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500 mb-4">
              No Google Drive folder linked to this project
            </p>
            <p className="text-sm text-gray-400">
              Link a Google Drive folder to access project files directly
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}