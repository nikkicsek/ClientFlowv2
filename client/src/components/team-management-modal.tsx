import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Users, Mail, Copy, Check, Clock, UserPlus } from "lucide-react";
import { TeamInvitation } from "@shared/schema";

export function TeamManagementModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: invitations } = useQuery<TeamInvitation[]>({
    queryKey: ["/api/admin/team-invitations"],
    enabled: isOpen,
  });

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/admin/team-invitations", { email });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to send invitation");
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Invitation Sent",
        description: `Team invitation sent to ${email}`,
      });
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/team-invitations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Invitation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleInvite = () => {
    if (!email.trim()) return;
    inviteMutation.mutate(email.trim());
  };

  const copyInvitationLink = async (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(token);
      toast({
        title: "Link Copied",
        description: "Invitation link copied to clipboard",
      });
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Could not copy link to clipboard",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'accepted':
        return 'bg-green-100 text-green-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Manage Team
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Management
          </DialogTitle>
          <DialogDescription>
            Invite team members to access the agency dashboard with full admin privileges.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Invite New Member Section */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Invite New Team Member
              </h3>
              
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="colleague@agency.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleInvite()}
                  />
                </div>
                <div className="flex items-end">
                  <Button 
                    onClick={handleInvite}
                    disabled={!email.trim() || inviteMutation.isPending}
                    className="flex items-center gap-2"
                  >
                    <Mail className="h-4 w-4" />
                    {inviteMutation.isPending ? "Sending..." : "Send Invite"}
                  </Button>
                </div>
              </div>
              
              <p className="text-sm text-gray-600 mt-2">
                Team members will receive full admin access to view and manage all client projects.
              </p>
            </CardContent>
          </Card>

          {/* Existing Invitations */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Team Invitations</h3>
            
            {!invitations || invitations.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-gray-600">No team invitations sent yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {invitations.map((invitation) => (
                  <Card key={invitation.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <div>
                              <p className="font-medium">{invitation.email}</p>
                              <p className="text-sm text-gray-600">
                                Invited {new Date(invitation.createdAt).toLocaleDateString()}
                                {invitation.status === 'pending' && (
                                  <span className="ml-2">
                                    • Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <Badge className={getStatusColor(invitation.status)}>
                            {invitation.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                            {invitation.status}
                          </Badge>
                          
                          {invitation.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyInvitationLink(invitation.invitationToken)}
                              className="flex items-center gap-1"
                            >
                              {copiedLink === invitation.invitationToken ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              {copiedLink === invitation.invitationToken ? "Copied!" : "Copy Link"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}