import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, CheckCircle, Clock, AlertTriangle, DollarSign, Calendar, Users, ArrowRight } from "lucide-react";
import type { Proposal, ProposalItem, User, Organization } from "@shared/schema";

const proposalSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  clientId: z.string().min(1, "Client is required"),
  organizationId: z.string().optional(),
  totalAmount: z.string().min(1, "Total amount is required"),
  validUntil: z.string().optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
});

const proposalItemSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  amount: z.string().min(1, "Amount is required"),
  timeline: z.string().optional(),
  phase: z.number().optional(),
  serviceId: z.string().optional(),
  notes: z.string().optional(),
});

type ProposalFormData = z.infer<typeof proposalSchema>;
type ProposalItemFormData = z.infer<typeof proposalItemSchema>;

interface ProposalWithItems extends Proposal {
  items?: ProposalItem[];
  client?: User;
  organization?: Organization;
}

export function ProposalManagement() {
  const [showCreateProposal, setShowCreateProposal] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<ProposalWithItems | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: proposals } = useQuery<ProposalWithItems[]>({
    queryKey: ["/api/admin/proposals"],
  });

  const { data: clients } = useQuery<User[]>({
    queryKey: ["/api/admin/clients"],
  });

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/admin/organizations"],
  });

  const form = useForm<ProposalFormData>({
    resolver: zodResolver(proposalSchema),
    defaultValues: {
      title: "",
      description: "",
      clientId: "",
      organizationId: "",
      totalAmount: "",
      validUntil: "",
      terms: "",
      notes: "",
    },
  });

  const createProposalMutation = useMutation({
    mutationFn: async (data: ProposalFormData) => {
      const response = await fetch("/api/admin/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create proposal");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proposals"] });
      setShowCreateProposal(false);
      form.reset();
      toast({
        title: "Proposal created successfully",
        description: "You can now add items to the proposal.",
      });
    },
  });

  const convertToProjectsMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      const response = await fetch(`/api/admin/proposals/${proposalId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to convert proposal to projects");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      setShowApprovalModal(false);
      toast({
        title: "Projects created successfully",
        description: "All approved items have been converted to individual projects.",
      });
    },
  });

  const onSubmit = (data: ProposalFormData) => {
    createProposalMutation.mutate(data);
  };

  const handleApprovalUpdate = async (proposalId: string, itemApprovals: Record<string, boolean>) => {
    try {
      const response = await fetch(`/api/admin/proposals/${proposalId}/approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemApprovals }),
      });
      
      if (!response.ok) throw new Error("Failed to update approvals");
      
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proposals"] });
      toast({
        title: "Approvals updated",
        description: "Proposal item approvals have been saved.",
      });
    } catch (error) {
      toast({
        title: "Error updating approvals",
        description: "Failed to save approval changes.",
        variant: "destructive",
      });
    }
  };

  const getProposalStatusBadge = (proposal: ProposalWithItems) => {
    const approvedItems = proposal.items?.filter(item => item.isApproved).length || 0;
    const totalItems = proposal.items?.length || 0;
    
    if (proposal.status === "converted") {
      return <Badge className="bg-green-600">Converted to Projects</Badge>;
    } else if (approvedItems === totalItems && totalItems > 0) {
      return <Badge className="bg-blue-600">Fully Approved</Badge>;
    } else if (approvedItems > 0) {
      return <Badge variant="secondary">Partially Approved ({approvedItems}/{totalItems})</Badge>;
    } else if (proposal.status === "sent") {
      return <Badge variant="outline">Awaiting Approval</Badge>;
    } else {
      return <Badge variant="secondary">{proposal.status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Proposal Management</h2>
          <p className="text-gray-600">Manage slide deck proposals and convert approved items to projects</p>
        </div>
        <Dialog open={showCreateProposal} onOpenChange={setShowCreateProposal}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              New Proposal
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Proposal</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proposal Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Strategic Growth & AI Enablement" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select client" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients?.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.firstName} {client.lastName} - {client.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="totalAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Amount (CAD)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="22500" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateProposal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createProposalMutation.isPending}>
                    {createProposalMutation.isPending ? "Creating..." : "Create Proposal"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {!proposals || proposals.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Proposals Yet</h3>
            <p className="text-gray-600 mb-4">Create your first proposal to get started with client approvals.</p>
            <Button onClick={() => setShowCreateProposal(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Create First Proposal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {proposals.map((proposal) => (
            <Card key={proposal.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{proposal.title}</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">
                      {proposal.client?.firstName} {proposal.client?.lastName}
                    </p>
                  </div>
                  {getProposalStatusBadge(proposal)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Value:</span>
                    <span className="font-medium">${Number(proposal.totalAmount).toLocaleString()} CAD</span>
                  </div>
                  
                  {proposal.items && proposal.items.length > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Items:</span>
                      <span className="font-medium">
                        {proposal.items.filter(item => item.isApproved).length} / {proposal.items.length} approved
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2 mt-4">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setSelectedProposal(proposal);
                        setShowApprovalModal(true);
                      }}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Manage Approvals
                    </Button>
                    
                    {proposal.items?.some(item => item.isApproved) && proposal.status !== "converted" && (
                      <Button 
                        variant="default" 
                        size="sm"
                        onClick={() => convertToProjectsMutation.mutate(proposal.id)}
                        disabled={convertToProjectsMutation.isPending}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <ArrowRight className="h-3 w-3 mr-1" />
                        Convert to Projects
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approval Management Modal */}
      <Dialog open={showApprovalModal} onOpenChange={setShowApprovalModal}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Proposal Approvals - {selectedProposal?.title}</DialogTitle>
          </DialogHeader>
          {selectedProposal && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Proposal Overview</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Client:</span>
                    <span className="ml-2 font-medium">
                      {selectedProposal.client?.firstName} {selectedProposal.client?.lastName}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Total Value:</span>
                    <span className="ml-2 font-medium">${Number(selectedProposal.totalAmount).toLocaleString()} CAD</span>
                  </div>
                </div>
              </div>

              {selectedProposal.items && selectedProposal.items.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="font-medium">Proposal Items</h4>
                  {selectedProposal.items.map((item) => (
                    <Card key={item.id} className={`border-l-4 ${item.isApproved ? 'border-l-green-500' : 'border-l-gray-300'}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Checkbox
                                checked={item.isApproved || false}
                                onCheckedChange={(checked) => {
                                  // Update item approval immediately - allow toggling on/off
                                  handleApprovalUpdate(selectedProposal.id, {
                                    [item.id]: checked === true
                                  });
                                }}
                              />
                              <h5 className="font-medium">{item.title}</h5>
                              {item.phase && (
                                <Badge variant="outline">Phase {item.phase}</Badge>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-sm text-gray-600 mb-2 ml-7">{item.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-sm text-gray-500 ml-7">
                              <span className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                ${Number(item.amount).toLocaleString()} CAD
                              </span>
                              {item.timeline && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {item.timeline}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">No items in this proposal yet. Add items to enable approval management.</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowApprovalModal(false)}>
                  Close
                </Button>
                {selectedProposal.items?.some(item => item.isApproved) && selectedProposal.status !== "converted" && (
                  <Button 
                    onClick={() => convertToProjectsMutation.mutate(selectedProposal.id)}
                    disabled={convertToProjectsMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {convertToProjectsMutation.isPending ? "Converting..." : "Convert Approved Items to Projects"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}