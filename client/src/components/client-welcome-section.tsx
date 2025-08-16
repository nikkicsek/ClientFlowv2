import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Video, 
  Play, 
  Users, 
  MapPin, 
  Calendar,
  Sparkles,
  ArrowRight,
  CheckCircle
} from "lucide-react";
import { HeyGenVideoPlayer } from "./heygen-video-player";

interface ClientWelcomeSectionProps {
  clientName: string;
  organizationName?: string;
  projectCount: number;
  onStartTour: () => void;
}

export function ClientWelcomeSection({ 
  clientName, 
  organizationName, 
  projectCount, 
  onStartTour 
}: ClientWelcomeSectionProps) {
  const [showWelcomeVideo, setShowWelcomeVideo] = useState(false);
  const [hasWelcomeVideo, setHasWelcomeVideo] = useState(false);

  const welcomeMessage = `Hello ${clientName}! Welcome to your dedicated project dashboard. ${
    organizationName ? `We're excited to work with ${organizationName}.` : ''
  } This platform will be your central hub for tracking progress, accessing files, and communicating with our team. We're committed to delivering exceptional results and keeping you informed every step of the way. Let's create something amazing together!`;

  const features = [
    {
      icon: Calendar,
      title: "Real-time Progress",
      description: "Track project milestones and deliverables as they happen"
    },
    {
      icon: Users,
      title: "Direct Communication",
      description: "Connect with your dedicated project team instantly"
    },
    {
      icon: CheckCircle,
      title: "File Management",
      description: "Access all your project files and approvals in one place"
    }
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Hero Section */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <CardContent className="p-8">
          <div className="flex flex-col lg:flex-row items-start gap-8">
            {/* Welcome Content */}
            <div className="flex-1 space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                  <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                    Welcome to Your Dashboard
                  </Badge>
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-4">
                  Welcome
                </h1>
                {organizationName && (
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="h-4 w-4 text-gray-500" />
                    <span className="text-lg text-gray-600">{organizationName}</span>
                  </div>
                )}
                <p className="text-gray-700 leading-relaxed text-lg">
                  We're thrilled to have you as our client. Your dedicated project dashboard 
                  gives you complete visibility into your project's progress, team communications, 
                  and all important deliverables.
                </p>
              </div>

              {/* Quick Stats */}
              <div className="flex flex-wrap gap-4">
                <div className="bg-white rounded-lg p-4 shadow-sm border">
                  <div className="text-2xl font-bold text-blue-600">{projectCount}</div>
                  <div className="text-sm text-gray-600">Active Project{projectCount !== 1 ? 's' : ''}</div>
                </div>
                <div className="bg-white rounded-lg p-4 shadow-sm border">
                  <div className="text-2xl font-bold text-green-600">24/7</div>
                  <div className="text-sm text-gray-600">Support Available</div>
                </div>
                <div className="bg-white rounded-lg p-4 shadow-sm border">
                  <div className="text-2xl font-bold text-purple-600">100%</div>
                  <div className="text-sm text-gray-600">Transparency</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                {hasWelcomeVideo && (
                  <Button
                    onClick={() => setShowWelcomeVideo(true)}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Video className="h-4 w-4 mr-2" />
                    Watch Welcome Message
                  </Button>
                )}
                <Button variant="outline" onClick={onStartTour}>
                  <Play className="h-4 w-4 mr-2" />
                  Take Dashboard Tour
                </Button>
              </div>
            </div>

            {/* Video Thumbnail - Only show if video is available */}
            {hasWelcomeVideo && (
              <div className="lg:w-80">
                <div 
                  className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setShowWelcomeVideo(true)}
                >
                  <div className="aspect-video bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg">
                      <Play className="h-8 w-8 text-purple-600" />
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium text-gray-900 mb-1">Personal Welcome Message</h3>
                    <p className="text-sm text-gray-600">A special message from our team just for you</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Feature Highlights */}
      <div className="grid md:grid-cols-3 gap-6">
        {features.map((feature, index) => (
          <Card key={index} className="border-gray-200 hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <feature.icon className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Next Steps */}
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <ArrowRight className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-green-900 mb-2">Ready to Get Started?</h3>
              <p className="text-green-800 mb-4">
                Explore your project details below to see current progress, upcoming milestones, 
                and available resources. Your dedicated team is here to ensure your success.
              </p>
              <Button variant="outline" className="border-green-300 text-green-700 hover:bg-green-100">
                View Project Details
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Welcome Video Modal */}
      {showWelcomeVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-900">Welcome Message</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowWelcomeVideo(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </Button>
              </div>
            </div>
            <div className="p-6">
              <HeyGenVideoPlayer
                clientName={clientName}
                organizationName={organizationName}
                customMessage={welcomeMessage}
                onVideoComplete={() => {
                  console.log("Welcome video completed");
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}