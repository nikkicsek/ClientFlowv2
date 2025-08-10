import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Facebook, Plus, RefreshCw, Trash2, BarChart3, Target, Users } from "lucide-react";

interface FacebookConnection {
  connectionId: string;
  providerConfigKey: string;
  accountId: string;
  accountName: string;
  isConnected: boolean;
}

interface FacebookAdsData {
  campaigns: any[];
  adSets: any[];
  ads: any[];
  insights: any[];
}

export function FacebookIntegration() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user's Facebook connections
  const { data: connections, isLoading: connectionsLoading } = useQuery<FacebookConnection[]>({
    queryKey: ["/api/facebook/connections"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch Facebook ads data for selected connection
  const { data: adsData, isLoading: adsLoading } = useQuery<FacebookAdsData>({
    queryKey: ["/api/facebook/ads-data", selectedConnection],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/facebook/ads-data?connectionId=${selectedConnection}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to fetch ads data");
      }
      return response.json();
    },
    enabled: !!selectedConnection,
  });

  // Create new Facebook connection
  const createConnectionMutation = useMutation({
    mutationFn: async () => {
      const connectionId = `facebook_${Date.now()}`;
      const response = await apiRequest("POST", "/api/facebook/connect", { connectionId });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create Facebook connection");
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Open Facebook OAuth URL in new window
      window.open(data.authUrl, 'facebook-oauth', 'width=500,height=600');
      setIsConnecting(true);
      
      toast({
        title: "Connecting to Facebook",
        description: "Please complete the authorization in the popup window",
      });

      // Poll for connection status
      const pollInterval = setInterval(async () => {
        try {
          queryClient.invalidateQueries({ queryKey: ["/api/facebook/connections"] });
          const updatedConnections = await queryClient.fetchQuery({
            queryKey: ["/api/facebook/connections"],
          });
          
          if (Array.isArray(updatedConnections) && updatedConnections.length > (connections?.length || 0)) {
            clearInterval(pollInterval);
            setIsConnecting(false);
            toast({
              title: "Facebook Connected",
              description: "Successfully connected your Facebook account",
            });
          }
        } catch (error) {
          console.error("Error polling connection status:", error);
        }
      }, 2000);

      // Stop polling after 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsConnecting(false);
      }, 120000);
    },
    onError: (error: Error) => {
      setIsConnecting(false);
      toast({
        title: "Connection Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete Facebook connection
  const deleteConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const response = await apiRequest("DELETE", `/api/facebook/connections/${connectionId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete connection");
      }
    },
    onSuccess: () => {
      toast({
        title: "Connection Removed",
        description: "Facebook connection has been removed",
      });
      setSelectedConnection(null);
      queryClient.invalidateQueries({ queryKey: ["/api/facebook/connections"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Trigger sync for connection
  const syncMutation = useMutation({
    mutationFn: async ({ connectionId, syncName }: { connectionId: string; syncName: string }) => {
      const response = await apiRequest("POST", `/api/facebook/sync`, { connectionId, syncName });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to trigger sync");
      }
    },
    onSuccess: () => {
      toast({
        title: "Sync Started",
        description: "Facebook data sync has been triggered",
      });
      // Refresh ads data after a short delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/facebook/ads-data", selectedConnection] });
      }, 5000);
    },
    onError: (error: Error) => {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Facebook Integration</h3>
          <p className="text-gray-600">Connect Facebook accounts to track advertising performance</p>
        </div>
        <Button 
          onClick={() => createConnectionMutation.mutate()}
          disabled={isConnecting || createConnectionMutation.isPending}
          className="flex items-center gap-2"
        >
          {isConnecting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Connect Facebook
            </>
          )}
        </Button>
      </div>

      {/* Facebook Connections */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {connectionsLoading ? (
          <Card>
            <CardContent className="p-6 text-center">
              <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin text-gray-400" />
              <p className="text-gray-600">Loading connections...</p>
            </CardContent>
          </Card>
        ) : connections && connections.length > 0 ? (
          connections.map((connection) => (
            <Card key={connection.connectionId} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Facebook className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-sm">{connection.accountName}</CardTitle>
                  </div>
                  <Badge variant={connection.isConnected ? "default" : "secondary"}>
                    {connection.isConnected ? "Connected" : "Disconnected"}
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  ID: {connection.connectionId}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedConnection(connection.connectionId)}
                    className="flex-1"
                  >
                    <BarChart3 className="h-3 w-3 mr-1" />
                    View Data
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => syncMutation.mutate({ 
                      connectionId: connection.connectionId, 
                      syncName: 'facebook-ads' 
                    })}
                    disabled={syncMutation.isPending}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteConnectionMutation.mutate(connection.connectionId)}
                    disabled={deleteConnectionMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="col-span-full">
            <CardContent className="p-8 text-center">
              <Facebook className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Facebook Connections</h3>
              <p className="text-gray-600 mb-4">Connect a Facebook account to start tracking advertising data</p>
              <Button onClick={() => createConnectionMutation.mutate()} disabled={isConnecting}>
                <Plus className="h-4 w-4 mr-2" />
                Connect Facebook Account
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Facebook Ads Data Modal */}
      {selectedConnection && (
        <Dialog open={!!selectedConnection} onOpenChange={() => setSelectedConnection(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Facebook className="h-5 w-5 text-blue-600" />
                Facebook Ads Data
              </DialogTitle>
              <DialogDescription>
                Performance data for connection: {selectedConnection}
              </DialogDescription>
            </DialogHeader>

            {adsLoading ? (
              <div className="p-8 text-center">
                <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin text-gray-400" />
                <p className="text-gray-600">Loading Facebook ads data...</p>
              </div>
            ) : adsData ? (
              <div className="space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Target className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                      <p className="text-2xl font-bold">{adsData.campaigns.length}</p>
                      <p className="text-sm text-gray-600">Campaigns</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <BarChart3 className="h-6 w-6 mx-auto mb-2 text-green-600" />
                      <p className="text-2xl font-bold">{adsData.ads.length}</p>
                      <p className="text-sm text-gray-600">Ads</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Users className="h-6 w-6 mx-auto mb-2 text-purple-600" />
                      <p className="text-2xl font-bold">
                        {adsData.insights.reduce((sum, insight) => sum + (insight.impressions || 0), 0)}
                      </p>
                      <p className="text-sm text-gray-600">Total Impressions</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <div className="h-6 w-6 mx-auto mb-2 bg-orange-600 rounded text-white text-xs flex items-center justify-center">$</div>
                      <p className="text-2xl font-bold">
                        {formatCurrency(adsData.insights.reduce((sum, insight) => sum + (insight.spend || 0), 0))}
                      </p>
                      <p className="text-sm text-gray-600">Total Spend</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Recent Campaigns */}
                {adsData.campaigns.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-3">Recent Campaigns</h4>
                    <div className="space-y-2">
                      {adsData.campaigns.slice(0, 5).map((campaign, index) => (
                        <div key={campaign.id || index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">{campaign.name || 'Unnamed Campaign'}</p>
                            <p className="text-sm text-gray-600">Objective: {campaign.objective || 'N/A'}</p>
                          </div>
                          <Badge variant={campaign.status === 'ACTIVE' ? 'default' : 'secondary'}>
                            {campaign.status || 'Unknown'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Performance Insights */}
                {adsData.insights.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-3">Performance Insights</h4>
                    <div className="space-y-2">
                      {adsData.insights.slice(0, 5).map((insight, index) => (
                        <div key={insight.id || index} className="p-3 bg-gray-50 rounded-lg">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-gray-600">Impressions</p>
                              <p className="font-medium">{formatNumber(insight.impressions || 0)}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Clicks</p>
                              <p className="font-medium">{formatNumber(insight.clicks || 0)}</p>
                            </div>
                            <div>
                              <p className="text-gray-600">CTR</p>
                              <p className="font-medium">{(insight.ctr || 0).toFixed(2)}%</p>
                            </div>
                            <div>
                              <p className="text-gray-600">Spend</p>
                              <p className="font-medium">{formatCurrency(insight.spend || 0)}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center">
                <BarChart3 className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
                <p className="text-gray-600 mb-4">No Facebook ads data found for this connection</p>
                <Button 
                  onClick={() => syncMutation.mutate({ 
                    connectionId: selectedConnection, 
                    syncName: 'facebook-ads' 
                  })}
                  disabled={syncMutation.isPending}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync Data
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}