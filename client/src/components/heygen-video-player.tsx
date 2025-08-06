import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Pause, Volume2, VolumeX, Loader2 } from "lucide-react";

interface HeyGenVideoPlayerProps {
  videoId?: string;
  customMessage?: string;
  clientName: string;
  organizationName?: string;
  projectDetails?: string;
  onVideoComplete?: () => void;
}

export function HeyGenVideoPlayer({
  videoId,
  customMessage,
  clientName,
  organizationName,
  projectDetails,
  onVideoComplete
}: HeyGenVideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Generate personalized welcome message
  const generateWelcomeMessage = () => {
    if (customMessage) return customMessage;
    
    const baseMessage = `Hello ${clientName}! Welcome to your dedicated project dashboard.`;
    const orgMessage = organizationName ? ` We're excited to work with ${organizationName}` : '';
    const projectMessage = projectDetails ? ` ${projectDetails}` : '';
    
    return `${baseMessage}${orgMessage}. This platform will be your central hub for tracking progress, accessing files, and communicating with our team. We're committed to delivering exceptional results and keeping you informed every step of the way.${projectMessage} Let's create something amazing together!`;
  };

  const generateHeyGenVideo = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Call our backend endpoint to generate HeyGen video
      const response = await fetch('/api/heygen/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: generateWelcomeMessage(),
          clientName,
          organizationName,
          videoType: 'welcome'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate video');
      }

      const data = await response.json();
      setVideoUrl(data.videoUrl);
    } catch (err) {
      setError('Unable to load video. Please check if HeyGen API key is configured.');
      console.error('HeyGen video generation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!videoUrl && !videoId) {
      generateHeyGenVideo();
    }
  }, []);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
    // In a real implementation, this would control the video player
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    // In a real implementation, this would control video audio
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <h3 className="text-lg font-semibold">Generating Your Personal Welcome Video</h3>
            <p className="text-gray-600 text-center">
              Our AI avatar is creating a customized welcome message just for you...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full border-yellow-200 bg-yellow-50">
        <CardContent className="p-6">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">Video Unavailable</h3>
            <p className="text-yellow-700 mb-4">{error}</p>
            <Button 
              onClick={generateHeyGenVideo}
              variant="outline"
              className="border-yellow-300 text-yellow-800 hover:bg-yellow-100"
            >
              Retry Video Generation
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="p-0">
        <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
          {/* Video Display Area */}
          <div className="absolute inset-0 flex items-center justify-center">
            {videoUrl ? (
              <video
                src={videoUrl}
                className="w-full h-full object-cover"
                poster="/api/heygen/video-thumbnail"
                onEnded={onVideoComplete}
              />
            ) : (
              <div className="text-center text-white">
                <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <Play className="h-10 w-10 ml-1" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Welcome Video Ready</h3>
                <p className="text-gray-300">Click play to start your personalized message</p>
              </div>
            )}
          </div>

          {/* Video Controls */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handlePlayPause}
                  className="text-white hover:bg-white/20"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleMuteToggle}
                  className="text-white hover:bg-white/20"
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </div>
              <div className="text-white text-sm">
                Personal Welcome Message
              </div>
            </div>
          </div>
        </div>
        
        {/* Video Info */}
        <div className="p-4 bg-gray-50">
          <h4 className="font-medium text-gray-900 mb-1">Welcome to Your Dashboard</h4>
          <p className="text-sm text-gray-600">
            A personalized message from our team introducing your project management experience
          </p>
        </div>
      </CardContent>
    </Card>
  );
}