import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Video, Users, MessageCircle, FileText, TrendingUp } from "lucide-react";

interface ClientWelcomeSectionProps {
  clientName: string;
  organizationName?: string;
  projectCount: number;
  onStartTour?: () => void;
}

export function ClientWelcomeSection({ 
  clientName, 
  organizationName, 
  projectCount,
  onStartTour 
}: ClientWelcomeSectionProps) {
  const [videoLoading, setVideoLoading] = useState(false);
  const [showVideo, setShowVideo] = useState(false);

  const handlePlayWelcomeVideo = async () => {
    setVideoLoading(true);
    try {
      // TODO: Integrate with HeyGen API to generate personalized welcome video
      // For now, we'll show a placeholder video player
      setShowVideo(true);
    } catch (error) {
      console.error("Error loading welcome video:", error);
    } finally {
      setVideoLoading(false);
    }
  };

  const welcomeFeatures = [
    {
      icon: <TrendingUp className="h-5 w-5" />,
      title: "Project Analytics",
      description: "Track your project progress with real-time dashboards and insights"
    },
    {
      icon: <FileText className="h-5 w-5" />,
      title: "File Management", 
      description: "Access all project files, assets, and deliverables in one place"
    },
    {
      icon: <MessageCircle className="h-5 w-5" />,
      title: "Direct Communication",
      description: "Stay connected with your team through integrated messaging"
    },
    {
      icon: <Users className="h-5 w-5" />,
      title: "Team Collaboration",
      description: "Collaborate with team members and track task assignments"
    }
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Hero Section */}
      <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl text-blue-900">
                Welcome to Your Project Dashboard, {clientName}!
              </CardTitle>
              {organizationName && (
                <p className="text-blue-700 mt-1">
                  Managing projects for {organizationName}
                </p>
              )}
            </div>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800">
              {projectCount} Active Project{projectCount !== 1 ? 's' : ''}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-blue-800 text-lg">
            Thank you for choosing our agency! This dashboard is your central hub for tracking 
            project progress, accessing files, and staying connected with our team.
          </p>
          
          {/* Video Section */}
          <div className="bg-white rounded-lg p-6 border border-blue-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Video className="h-5 w-5 text-blue-600" />
                Personal Welcome Message
              </h3>
            </div>
            
            {!showVideo ? (
              <div className="bg-gray-100 rounded-lg p-8 text-center">
                <Video className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">
                  Your Personalized Welcome Video
                </h4>
                <p className="text-gray-600 mb-4">
                  Our team has prepared a special welcome message just for you, 
                  covering your project details and next steps.
                </p>
                <Button 
                  onClick={handlePlayWelcomeVideo}
                  disabled={videoLoading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {videoLoading ? "Loading Video..." : "Play Welcome Video"}
                </Button>
              </div>
            ) : (
              <div className="bg-black rounded-lg aspect-video flex items-center justify-center">
                <div className="text-center text-white">
                  <Video className="h-16 w-16 mx-auto mb-4" />
                  <p className="text-lg">HeyGen Avatar Video Player</p>
                  <p className="text-sm text-gray-300 mt-2">
                    Integration with HeyGen API will display personalized avatar video here
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Features Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl text-gray-900">What You Can Do Here</CardTitle>
          <p className="text-gray-600">
            Your dashboard is designed to give you complete visibility into your projects
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {welcomeFeatures.map((feature, index) => (
              <div key={index} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                  {feature.icon}
                </div>
                <div>
                  <h4 className="font-medium text-gray-900 mb-1">{feature.title}</h4>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Getting Started Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl text-gray-900">Ready to Get Started?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button onClick={onStartTour} className="bg-green-600 hover:bg-green-700">
              <Users className="h-4 w-4 mr-2" />
              Take Dashboard Tour
            </Button>
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              View Project Files
            </Button>
            <Button variant="outline">
              <MessageCircle className="h-4 w-4 mr-2" />
              Contact Your Team
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}