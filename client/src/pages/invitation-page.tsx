import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function InvitationPage() {
  const [match, params] = useRoute("/invite/:token");
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'expired'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!match || !params?.token) return;

    const acceptInvitation = async () => {
      try {
        const response = await apiRequest("POST", `/api/accept-invitation/${params.token}`);
        const data = await response.json();
        
        if (response.ok) {
          setStatus('success');
          setMessage(data.message);
          // Redirect to login after a delay
          setTimeout(() => {
            window.location.href = "/api/login";
          }, 2000);
        } else {
          setStatus(data.message.includes('expired') ? 'expired' : 'error');
          setMessage(data.message);
        }
      } catch (error) {
        setStatus('error');
        setMessage('Failed to process invitation');
      }
    };

    acceptInvitation();
  }, [match, params?.token]);

  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-16 w-16 text-green-500" />;
      case 'expired':
        return <Clock className="h-16 w-16 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-16 w-16 text-red-500" />;
      default:
        return <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600" />;
    }
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'success':
        return 'Invitation Accepted!';
      case 'expired':
        return 'Invitation Expired';
      case 'error':
        return 'Invalid Invitation';
      default:
        return 'Processing Invitation...';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex flex-col items-center text-center space-y-4">
            {getStatusIcon()}
            <CardTitle className="text-2xl">{getStatusTitle()}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === 'loading' && (
            <p className="text-gray-600">
              Please wait while we process your team invitation...
            </p>
          )}
          
          {status === 'success' && (
            <>
              <p className="text-gray-600">{message}</p>
              <p className="text-sm text-gray-500">
                Redirecting you to sign in to complete your account setup...
              </p>
            </>
          )}
          
          {status === 'expired' && (
            <>
              <p className="text-gray-600">{message}</p>
              <p className="text-sm text-gray-500">
                Please contact your team administrator for a new invitation.
              </p>
            </>
          )}
          
          {status === 'error' && (
            <>
              <p className="text-gray-600">{message}</p>
              <Button 
                onClick={() => window.location.href = "/"}
                variant="outline"
                className="mt-4"
              >
                Go to Homepage
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}