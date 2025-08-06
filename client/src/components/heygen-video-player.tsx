import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Play, 
  Loader2, 
  Video, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  RefreshCw 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface HeyGenVideoPlayerProps {
  clientName: string;
  organizationName?: string;
  customMessage: string;
  onVideoComplete?: () => void;
}

interface VideoStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  error?: string;
}

export function HeyGenVideoPlayer({ 
  clientName, 
  organizationName, 
  customMessage, 
  onVideoComplete 
}: HeyGenVideoPlayerProps) {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  // Generate video mutation
  const generateVideoMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/heygen/generate-video", {
        message: customMessage,
        clientName,
        organizationName,
        videoType: "welcome"
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.videoId) {
        setVideoId(data.videoId);
        setIsGenerating(false);
        toast({
          title: "Video Generation Started",
          description: "Your personalized welcome video is being created.",
        });
      }
    },
    onError: (error) => {
      setIsGenerating(false);
      toast({
        title: "Video Generation Failed",
        description: error.message || "Unable to generate video. Please check if HeyGen API key is configured.",
        variant: "destructive",
      });
    },
  });

  // Check video status query
  const { data: videoStatus, isLoading: isCheckingStatus } = useQuery<VideoStatus>({
    queryKey: ["/api/heygen/video-status", videoId],
    queryFn: async () => {
      if (!videoId) return null;
      const response = await apiRequest("GET", `/api/heygen/video-status/${videoId}`);
      return response.json();
    },
    enabled: !!videoId,
    refetchInterval: (data) => {
      // Stop polling when video is completed or failed
      if (!data || data.status === 'completed' || data.status === 'failed') {
        return false;
      }
      return 3000; // Poll every 3 seconds
    },
  });

  // Handle video completion
  useEffect(() => {
    if (videoStatus?.status === 'completed' && onVideoComplete) {
      onVideoComplete();
    }
  }, [videoStatus?.status, onVideoComplete]);

  const handleGenerateVideo = () => {
    setIsGenerating(true);
    generateVideoMutation.mutate();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-5 w-5 text-blue-600" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Video className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Video generation queued...';
      case 'processing':
        return 'Creating your personalized video...';
      case 'completed':
        return 'Your welcome video is ready!';
      case 'failed':
        return 'Video generation failed. Please try again.';
      default:
        return 'Ready to generate video';
    }
  };

  return (
    <div className="space-y-6">
      {/* Video Player or Placeholder */}
      <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
        {videoStatus?.status === 'completed' && videoStatus.video_url ? (
          <video
            controls
            className="w-full h-full object-cover"
            poster="/api/heygen/video-thumbnail"
          >
            <source src={videoStatus.video_url} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50">
            <div className="text-center space-y-4">
              {getStatusIcon(videoStatus?.status || 'idle')}
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  {videoStatus?.status === 'completed' ? 'Video Ready' : 'AI Avatar Welcome Video'}
                </h3>
                <p className="text-gray-600">
                  {getStatusMessage(videoStatus?.status || 'idle')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status and Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon(videoStatus?.status || 'idle')}
              <div>
                <h4 className="font-medium text-gray-900">
                  Personalized Welcome Message
                </h4>
                <p className="text-sm text-gray-600">
                  {getStatusMessage(videoStatus?.status || 'idle')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!videoId && !isGenerating && (
                <Button
                  onClick={handleGenerateVideo}
                  disabled={generateVideoMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {generateVideoMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Generate Video
                    </>
                  )}
                </Button>
              )}

              {videoStatus?.status === 'failed' && (
                <Button
                  onClick={() => {
                    setVideoId(null);
                    setIsGenerating(false);
                  }}
                  variant="outline"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              )}

              {(videoStatus?.status === 'pending' || videoStatus?.status === 'processing') && (
                <div className="text-sm text-gray-500">
                  Estimated time: 2-3 minutes
                </div>
              )}
            </div>
          </div>

          {videoStatus?.error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                <div>
                  <h5 className="font-medium text-red-900">Generation Error</h5>
                  <p className="text-sm text-red-700">{videoStatus.error}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Preview */}
      <Card className="bg-gray-50">
        <CardContent className="p-4">
          <h4 className="font-medium text-gray-900 mb-3">Video Message Preview</h4>
          <div className="text-sm text-gray-700 leading-relaxed">
            "{customMessage}"
          </div>
          <div className="mt-3 text-xs text-gray-500">
            This message will be delivered by a professional AI avatar with natural voice synthesis.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}