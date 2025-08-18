/**
 * QA Calendar Test Component
 * One-click self-test for Calendar sync functionality
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, AlertTriangle, Clock, Play } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface QATestResult {
  step: string;
  status: 'pass' | 'fail' | 'skip' | 'warn';
  message: string;
  data?: any;
}

interface QATestResponse {
  success: boolean;
  timestamp: string;
  passed: number;
  failed: number;
  warnings: number;
  results: QATestResult[];
  summary: string;
}

export function QACalendarTest() {
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<QATestResponse | null>(null);
  const { toast } = useToast();

  const runQATestMutation = useMutation({
    mutationFn: async (): Promise<QATestResponse> => {
      setIsRunning(true);
      const response = await apiRequest('GET', '/api/qa/calendar-test');
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'QA test failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setTestResults(data);
      setIsRunning(false);
      
      if (data.failed === 0) {
        toast({
          title: "QA Test Passed",
          description: data.summary,
        });
      } else {
        toast({
          title: "QA Test Issues Found", 
          description: data.summary,
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      setIsRunning(false);
      toast({
        title: "QA Test Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'fail':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warn':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'skip':
        return <Clock className="h-4 w-4 text-gray-400" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pass: 'bg-green-100 text-green-800 border-green-200',
      fail: 'bg-red-100 text-red-800 border-red-200',
      warn: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      skip: 'bg-gray-100 text-gray-600 border-gray-200',
    };
    
    return (
      <Badge variant="outline" className={variants[status as keyof typeof variants] || ''}>
        {status.toUpperCase()}
      </Badge>
    );
  };

  const getProgressValue = () => {
    if (!testResults) return 0;
    const total = testResults.results.length;
    const completed = testResults.results.length;
    return total > 0 ? (completed / total) * 100 : 0;
  };

  const getOverallStatus = () => {
    if (!testResults) return 'Unknown';
    if (testResults.failed > 0) return 'Failed';
    if (testResults.warnings > 0) return 'Passed with Warnings';
    return 'Passed';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Calendar Sync QA Test
          </CardTitle>
          <CardDescription>
            Comprehensive self-test for Google Calendar integration and auto-sync functionality.
            Verifies task creation, assignment hooks, and calendar event synchronization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => runQATestMutation.mutate()}
              disabled={isRunning}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              {isRunning ? 'Running Tests...' : 'Run QA Test'}
            </Button>
            
            {testResults && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Overall Status:</span>
                <Badge 
                  variant={getOverallStatus() === 'Passed' ? 'default' : 'destructive'}
                  className="font-medium"
                >
                  {getOverallStatus()}
                </Badge>
              </div>
            )}
          </div>

          {isRunning && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                <span className="text-sm text-muted-foreground">Running comprehensive tests...</span>
              </div>
              <Progress value={30} className="h-2" />
            </div>
          )}

          {testResults && (
            <>
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{testResults.passed}</div>
                  <div className="text-sm text-muted-foreground">Passed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{testResults.failed}</div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{testResults.warnings}</div>
                  <div className="text-sm text-muted-foreground">Warnings</div>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <strong>Summary:</strong> {testResults.summary}
              </div>
              <div className="text-xs text-muted-foreground">
                Test completed at: {new Date(testResults.timestamp).toLocaleString()}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {testResults && testResults.results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Test Results Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {testResults.results.map((result, index) => (
                <div 
                  key={index}
                  className="flex items-start gap-3 p-3 border rounded-lg bg-card"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getStatusIcon(result.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{result.step.replace(/_/g, ' ')}</span>
                      {getStatusBadge(result.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">{result.message}</p>
                    {result.data && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          View Details
                        </summary>
                        <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}