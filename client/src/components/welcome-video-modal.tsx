import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Video, Loader2, Play, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { HeyGenVideoPlayer } from "./heygen-video-player";

interface WelcomeVideoModalProps {
  clientName: string;
  organizationName?: string;
  projectDetails?: string;
}

export function WelcomeVideoModal({ 
  clientName, 
  organizationName, 
  projectDetails 
}: WelcomeVideoModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Generate default welcome message
  const generateDefaultMessage = () => {
    const baseMessage = `Hello ${clientName}! Welcome to your dedicated project dashboard.`;
    const orgMessage = organizationName ? ` We're excited to work with ${organizationName}` : '';
    const projectMessage = projectDetails ? ` ${projectDetails}` : '';
    
    return `${baseMessage}${orgMessage}. This platform will be your central hub for tracking progress, accessing files, and communicating with our team. We're committed to delivering exceptional results and keeping you informed every step of the way.${projectMessage} Let's create something amazing together!`;
  };

  const generateVideoMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", "/api/heygen/generate-video", {
        message,
        clientName,
        organizationName,
        videoType: "welcome"
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Video Generation Started",
        description: "Your personalized welcome video is being created. This may take a few minutes.",
      });
      setShowVideoPlayer(true);
    },
    onError: (error) => {
      toast({
        title: "Video Generation Failed",
        description: error.message || "Unable to generate video. Please check if HeyGen API key is configured.",
        variant: "destructive",
      });
    },
  });

  const handleGenerateVideo = () => {
    const message = customMessage.trim() || generateDefaultMessage();
    generateVideoMutation.mutate(message);
  };

  const resetForm = () => {
    setCustomMessage("");
    setShowVideoPlayer(false);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      resetForm();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-purple-600 hover:bg-purple-700">
          <Video className="h-4 w-4 mr-2" />
          Create Welcome Video
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Create Personalized Welcome Video
          </DialogTitle>
          <DialogDescription>
            Generate a custom AI avatar video to welcome {clientName} to their project dashboard.
            This creates a white-glove service experience that sets your agency apart.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {!showVideoPlayer ? (
            <>
              {/* Message Customization */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="client-info">Client Information</Label>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <Input
                      value={clientName}
                      disabled
                      placeholder="Client Name"
                    />
                    <Input
                      value={organizationName || ""}
                      disabled
                      placeholder="Organization (optional)"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="custom-message">Custom Welcome Message</Label>
                  <Textarea
                    id="custom-message"
                    placeholder={generateDefaultMessage()}
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    rows={8}
                    className="mt-2"
                  />
                  <p className="text-sm text-gray-500 mt-2">
                    Leave blank to use the default personalized message, or write your own custom welcome.
                  </p>
                </div>

                {/* Preview Card */}
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-4">
                    <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Video Settings
                    </h4>
                    <div className="text-sm text-blue-800 space-y-1">
                      <p>• Professional female avatar (Daisy)</p>
                      <p>• High-quality voice synthesis</p>
                      <p>• 16:9 HD video format (1280x720)</p>
                      <p>• Clean professional background</p>
                      <p>• Estimated generation time: 2-3 minutes</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleGenerateVideo}
                  disabled={generateVideoMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {generateVideoMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating Video...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Generate Welcome Video
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              {/* Video Player */}
              <div className="space-y-4">
                <HeyGenVideoPlayer
                  clientName={clientName}
                  organizationName={organizationName}
                  customMessage={customMessage.trim() || generateDefaultMessage()}
                  onVideoComplete={() => {
                    toast({
                      title: "Welcome Video Complete",
                      description: "The personalized welcome video has finished playing.",
                    });
                  }}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={resetForm}>
                  Create Another Video
                </Button>
                <Button onClick={() => setIsOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}