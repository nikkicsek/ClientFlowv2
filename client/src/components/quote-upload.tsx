import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, CheckCircle, Loader2, Eye, PlayCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

interface Quote {
  id: string;
  quoteNumber: string;
  title: string;
  description: string;
  totalAmount: string;
  status: string;
  fileName?: string;
  createdAt: string;
  clientId?: string;
  organizationId?: string;
  projectId?: string;
  client?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    companyName?: string;
  };
  organization?: {
    id: string;
    name: string;
  };
}

export function QuoteUpload() {
  const [uploadStep, setUploadStep] = useState<'upload' | 'details' | 'processing'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [quoteDetails, setQuoteDetails] = useState({
    title: '',
    description: '',
    totalAmount: '',
    clientId: '',
    organizationId: '',
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch clients for dropdown
  const { data: clients } = useQuery({
    queryKey: ["/api/admin/clients"],
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

  // Fetch organizations for dropdown
  const { data: organizations } = useQuery({
    queryKey: ["/api/organizations"],
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

  // Fetch quotes
  const { data: quotes, isLoading: quotesLoading } = useQuery<Quote[]>({
    queryKey: ["/api/quotes"],
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

  // Upload quote mutation
  const uploadQuoteMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await apiRequest("POST", "/api/quotes/upload", formData, {
        headers: {}, // Let browser set the Content-Type for FormData
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to upload quote");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Quote Uploaded",
        description: `Quote "${data.title}" has been uploaded successfully.`,
      });
      setUploadStep('details');
      setQuoteDetails({
        title: data.title || '',
        description: data.description || '',
        totalAmount: data.totalAmount || '',
        clientId: '',
        organizationId: '',
      });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
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
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Convert quote to project mutation
  const convertToProjectMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      const response = await apiRequest("POST", `/api/quotes/${quoteId}/convert`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to convert quote to project");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Project Created!",
        description: `Quote has been converted to project "${data.name}" with tasks automatically generated.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
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
        title: "Conversion Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: "Please upload a PDF, Word document, or text file.",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('quote', selectedFile);

    uploadQuoteMutation.mutate(formData);
  };

  const handleQuoteDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Here we would update the quote with client/organization details
    // For now, we'll just show success
    toast({
      title: "Quote Details Updated",
      description: "Quote is ready for conversion to project.",
    });
    setUploadStep('processing');
    queryClient.invalidateQueries({ queryKey: ["/api/quotes"] });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      draft: "outline",
      sent: "secondary",
      approved: "default",
      declined: "destructive",
      converted: "secondary",
    };
    
    return (
      <Badge variant={variants[status] || "outline"} className="capitalize">
        {status}
      </Badge>
    );
  };

  if (uploadStep === 'upload') {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Quote/Proposal
            </CardTitle>
            <CardDescription>
              Upload an approved quote or proposal to automatically generate projects and tasks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <div className="space-y-2">
                <Label htmlFor="quote-upload" className="text-lg cursor-pointer">
                  Choose quote file or drag and drop
                </Label>
                <p className="text-sm text-gray-500">
                  Supports PDF, Word documents, and text files
                </p>
                <Input
                  id="quote-upload"
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  onClick={() => document.getElementById('quote-upload')?.click()}
                  variant="outline"
                  className="mt-2"
                >
                  Select File
                </Button>
              </div>
            </div>

            {selectedFile && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleUpload}
                  disabled={uploadQuoteMutation.isPending}
                  className="mt-4 w-full"
                >
                  {uploadQuoteMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload & Process Quote
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Existing Quotes */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Quotes</CardTitle>
            <CardDescription>
              View and manage uploaded quotes and proposals
            </CardDescription>
          </CardHeader>
          <CardContent>
            {quotesLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : quotes && quotes.length > 0 ? (
              <div className="space-y-4">
                {quotes.map((quote) => (
                  <div key={quote.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold">{quote.title}</h3>
                        <p className="text-sm text-gray-600">{quote.quoteNumber}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(quote.status)}
                        <span className="text-lg font-bold text-green-600">
                          ${Number(quote.totalAmount).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    
                    {quote.description && (
                      <p className="text-sm text-gray-700 mb-3">{quote.description}</p>
                    )}
                    
                    <div className="flex justify-between items-center text-sm text-gray-500">
                      <span>
                        {quote.client
                          ? `${quote.client.firstName} ${quote.client.lastName} - ${quote.client.companyName || quote.client.email}`
                          : 'No client assigned'
                        }
                      </span>
                      <span>{new Date(quote.createdAt).toLocaleDateString()}</span>
                    </div>
                    
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                      {quote.status === 'approved' && !quote.projectId && (
                        <Button
                          size="sm"
                          onClick={() => convertToProjectMutation.mutate(quote.id)}
                          disabled={convertToProjectMutation.isPending}
                        >
                          {convertToProjectMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <PlayCircle className="h-4 w-4 mr-1" />
                          )}
                          Convert to Project
                        </Button>
                      )}
                      {quote.projectId && (
                        <Badge variant="secondary">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Project Created
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center p-8">
                <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500">No quotes uploaded yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Additional steps would be rendered here
  return null;
}