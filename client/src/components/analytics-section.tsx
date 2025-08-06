import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, TrendingUp, Users, Target, DollarSign } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useEffect, useRef } from "react";

// Chart.js imports
declare global {
  interface Window {
    Chart: any;
  }
}

export default function AnalyticsSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const trafficChartRef = useRef<HTMLCanvasElement>(null);
  const sourceChartRef = useRef<HTMLCanvasElement>(null);
  const trafficChartInstance = useRef<any>(null);
  const sourceChartInstance = useRef<any>(null);

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

  const { data: analytics, isLoading } = useQuery({
    queryKey: ["/api/projects", activeProject?.id, "analytics"],
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

  // Load Chart.js and initialize charts
  useEffect(() => {
    const loadChartJS = async () => {
      if (!window.Chart) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = () => {
          initializeCharts();
        };
        document.head.appendChild(script);
      } else {
        initializeCharts();
      }
    };

    loadChartJS();

    return () => {
      // Cleanup charts
      if (trafficChartInstance.current) {
        trafficChartInstance.current.destroy();
      }
      if (sourceChartInstance.current) {
        sourceChartInstance.current.destroy();
      }
    };
  }, []);

  const initializeCharts = () => {
    if (!window.Chart) return;

    // Traffic Chart
    if (trafficChartRef.current && !trafficChartInstance.current) {
      const ctx = trafficChartRef.current.getContext('2d');
      trafficChartInstance.current = new window.Chart(ctx, {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [{
            label: 'Website Visitors',
            data: [1200, 1900, 2100, 2600, 2400, 2847],
            borderColor: '#1976D2',
            backgroundColor: 'rgba(25, 118, 210, 0.1)',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      });
    }

    // Source Chart
    if (sourceChartRef.current && !sourceChartInstance.current) {
      const ctx = sourceChartRef.current.getContext('2d');
      sourceChartInstance.current = new window.Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Organic Search', 'Direct', 'Social Media', 'Paid Ads'],
          datasets: [{
            data: [45, 30, 15, 10],
            backgroundColor: ['#4CAF50', '#1976D2', '#FF9800', '#F44336']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom'
            }
          }
        }
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const metrics = [
    {
      title: "Website Visitors",
      value: "2,847",
      change: "+24%",
      changeType: "positive",
      icon: Users,
    },
    {
      title: "Conversion Rate",
      value: "67%",
      change: "+12%",
      changeType: "positive",
      icon: Target,
    },
    {
      title: "New Leads",
      value: "142",
      change: "+38%",
      changeType: "positive",
      icon: TrendingUp,
    },
    {
      title: "Revenue Generated",
      value: "$4,280",
      change: "+56%",
      changeType: "positive",
      icon: DollarSign,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analytics & Reports</h2>
          <p className="text-gray-600">Track performance metrics and campaign results</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <Card key={index}>
              <CardContent className="p-6 text-center">
                <div className="flex items-center justify-center mb-4">
                  <Icon className="h-8 w-8 text-blue-600" />
                </div>
                <div className="text-3xl font-bold text-blue-600 mb-2">
                  {metric.value}
                </div>
                <div className="text-sm text-gray-600 mb-2">{metric.title}</div>
                <div className={`text-sm flex items-center justify-center gap-1 ${
                  metric.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                }`}>
                  <TrendingUp className="h-3 w-3" />
                  {metric.change} vs last month
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Website Traffic Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <canvas ref={trafficChartRef}></canvas>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Traffic Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <canvas ref={sourceChartRef}></canvas>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Analytics Data Table */}
      {analytics && analytics.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent Analytics Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Metric</th>
                    <th className="text-left p-2">Value</th>
                    <th className="text-left p-2">Period</th>
                    <th className="text-left p-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.slice(0, 10).map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-2 capitalize">{item.metricType}</td>
                      <td className="p-2">{Number(item.metricValue).toLocaleString()}</td>
                      <td className="p-2 capitalize">{item.period}</td>
                      <td className="p-2">{new Date(item.date).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-gray-500">
              <TrendingUp className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Analytics Data</h3>
              <p>Analytics data will appear here as your project progresses.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
