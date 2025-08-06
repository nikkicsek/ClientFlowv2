import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calendar, DollarSign, TrendingUp, Clock, Target } from "lucide-react";
import { format, differenceInDays } from "date-fns";

interface ProjectProgressCardProps {
  project: any;
}

export default function ProjectProgressCard({ project }: ProjectProgressCardProps) {
  const getProgressColor = (progress: number) => {
    if (progress === 0) return "text-gray-500";
    if (progress < 25) return "text-red-600";
    if (progress < 50) return "text-yellow-600";
    if (progress < 75) return "text-blue-600";
    if (progress < 100) return "text-green-600";
    return "text-green-700";
  };

  const getProgressLabel = (progress: number) => {
    if (progress === 0) return "Not Started";
    if (progress < 25) return "Getting Started";
    if (progress < 50) return "In Progress";
    if (progress < 75) return "Significant Progress";
    if (progress < 100) return "Nearly Complete";
    return "Completed";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'on_hold': return 'bg-yellow-100 text-yellow-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'on_hold': return 'On Hold';
      case 'completed': return 'Completed';
      default: return 'Unknown';
    }
  };

  const getDaysRemaining = () => {
    if (!project.expectedCompletion) return null;
    const today = new Date();
    const completion = new Date(project.expectedCompletion);
    const daysLeft = differenceInDays(completion, today);
    
    if (daysLeft < 0) return { days: Math.abs(daysLeft), overdue: true };
    return { days: daysLeft, overdue: false };
  };

  const daysInfo = getDaysRemaining();

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl text-gray-900">{project.name}</CardTitle>
            <p className="text-gray-600 mt-1">{project.description}</p>
          </div>
          <Badge className={getStatusColor(project.status)}>
            {getStatusLabel(project.status)}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Progress Section */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Project Progress</span>
            </div>
            <div className="text-right">
              <span className={`text-lg font-bold ${getProgressColor(project.progress || 0)}`}>
                {project.progress || 0}%
              </span>
              <p className="text-xs text-gray-500">{getProgressLabel(project.progress || 0)}</p>
            </div>
          </div>
          <Progress value={project.progress || 0} className="h-3" />
        </div>

        {/* Timeline Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {project.startDate && (
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Start Date</p>
                <p className="text-sm font-medium text-gray-900">
                  {format(new Date(project.startDate), "MMM dd, yyyy")}
                </p>
              </div>
            </div>
          )}

          {project.expectedCompletion && (
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${daysInfo?.overdue ? 'bg-red-100' : 'bg-green-100'}`}>
                <Target className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Target Completion</p>
                <p className="text-sm font-medium text-gray-900">
                  {format(new Date(project.expectedCompletion), "MMM dd, yyyy")}
                </p>
                {daysInfo && (
                  <p className={`text-xs ${daysInfo.overdue ? 'text-red-600' : 'text-green-600'}`}>
                    {daysInfo.overdue ? `${daysInfo.days} days overdue` : `${daysInfo.days} days remaining`}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Budget Section */}
        {project.budget && (
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Project Budget</p>
              <p className="text-lg font-bold text-gray-900">
                ${Number(project.budget).toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Progress Milestones */}
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Progress Milestones</h4>
          <div className="space-y-2">
            {[
              { label: "Project Setup & Planning", threshold: 25, completed: project.progress >= 25 },
              { label: "Development & Implementation", threshold: 50, completed: project.progress >= 50 },
              { label: "Testing & Refinements", threshold: 75, completed: project.progress >= 75 },
              { label: "Final Delivery", threshold: 100, completed: project.progress >= 100 },
            ].map((milestone, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  milestone.completed 
                    ? 'bg-green-500' 
                    : project.progress > milestone.threshold - 25 
                      ? 'bg-yellow-400' 
                      : 'bg-gray-300'
                }`} />
                <span className={`text-sm ${
                  milestone.completed 
                    ? 'text-green-700 font-medium' 
                    : 'text-gray-600'
                }`}>
                  {milestone.label}
                </span>
                {milestone.completed && (
                  <span className="text-xs text-green-600">✓</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Last Updated */}
        <div className="border-t pt-4 flex items-center gap-2 text-xs text-gray-500">
          <Clock className="h-3 w-3" />
          <span>
            Last updated: {format(new Date(project.updatedAt || project.createdAt), "MMM dd, yyyy 'at' h:mm a")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}