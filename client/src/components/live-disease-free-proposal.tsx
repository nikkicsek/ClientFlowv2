import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Calendar, CheckCircle, ArrowRight, Brain, Users, Zap, Target } from "lucide-react";

interface ProposalItem {
  id: string;
  title: string;
  description: string;
  amount: number;
  timeline: string;
  phase: number;
  icon: React.ReactNode;
  isApproved: boolean;
}

const LIVE_DISEASE_FREE_ITEMS: ProposalItem[] = [
  {
    id: "ldf-phase1-blueprint",
    title: "Strategic Blueprint",
    description: "Program Structure, Audience Mapping, Technology Planning, Platform Selection, Initiative Prioritization",
    amount: 3500,
    timeline: "2-3 weeks",
    phase: 1,
    icon: <Target className="h-5 w-5 text-blue-600" />,
    isApproved: false,
  },
  {
    id: "ldf-phase2-pambot",
    title: "Custom AI Assistant - PamBot v1",
    description: "Trained AI assistant for student FAQs and protocol questions. References internal knowledge base with no hallucinating.",
    amount: 2500,
    timeline: "3-4 weeks",
    phase: 2,
    icon: <Brain className="h-5 w-5 text-purple-600" />,
    isApproved: false,
  },
  {
    id: "ldf-phase2-practitioner",
    title: "Practitioner Program Launch",
    description: "Full buildout of global practitioner licensing model with strategy, content, portal development, and technical setup.",
    amount: 4500,
    timeline: "6-8 weeks",
    phase: 2,
    icon: <Users className="h-5 w-5 text-green-600" />,
    isApproved: false,
  },
  {
    id: "ldf-phase2-coach-training",
    title: "Coach Training & Certification System",
    description: "Scalable certification program with on-demand courses, practicum design, and certificate delivery system.",
    amount: 3500,
    timeline: "4-6 weeks",
    phase: 2,
    icon: <CheckCircle className="h-5 w-5 text-indigo-600" />,
    isApproved: false,
  },
  {
    id: "ldf-phase2-automation",
    title: "Automation & Funnel Build",
    description: "Go High Level implementation with practitioner funnel, email/SMS sequences, content repurposing, and social lead gen.",
    amount: 1500,
    timeline: "2-3 weeks",
    phase: 2,
    icon: <Zap className="h-5 w-5 text-yellow-600" />,
    isApproved: false,
  },
  {
    id: "ldf-future-ai-diagnostic",
    title: "AI Diagnostic Tool - MVP Build",
    description: "Intelligent intake tool to help identify parasite load, symptom patterns, and treatment roadmap with data mapping and GPT prototype.",
    amount: 7500,
    timeline: "2-3 months",
    phase: 3,
    icon: <Brain className="h-5 w-5 text-red-600" />,
    isApproved: false,
  },
];

interface LiveDiseaseFreeProposalProps {
  clientId: string;
  organizationId?: string;
  onClose: () => void;
}

export function LiveDiseaseFreeProposal({ clientId, organizationId, onClose }: LiveDiseaseFreeProposalProps) {
  const [approvedItems, setApprovedItems] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createProposalMutation = useMutation({
    mutationFn: async () => {
      const totalAmount = LIVE_DISEASE_FREE_ITEMS
        .filter(item => approvedItems.has(item.id))
        .reduce((sum, item) => sum + item.amount, 0);

      const proposalData = {
        title: "Strategic Growth & AI Enablement for Live Disease Free",
        description: "Comprehensive strategy and implementation plan to scale impact, reduce hands-on time, and prepare for future growth with AI integration.",
        clientId,
        organizationId,
        totalAmount: totalAmount.toString(),
        status: "approved",
        approvalType: approvedItems.size === LIVE_DISEASE_FREE_ITEMS.length ? "full" : "partial",
        approvedDate: new Date().toISOString(),
      };

      // Create proposal
      const proposalResponse = await fetch("/api/admin/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proposalData),
      });

      if (!proposalResponse.ok) throw new Error("Failed to create proposal");
      const proposal = await proposalResponse.json();

      // Add approved items
      const itemPromises = LIVE_DISEASE_FREE_ITEMS
        .filter(item => approvedItems.has(item.id))
        .map(item => 
          fetch("/api/admin/proposal-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              proposalId: proposal.id,
              title: item.title,
              description: item.description,
              amount: item.amount.toString(),
              timeline: item.timeline,
              phase: item.phase,
              isApproved: true,
            }),
          })
        );

      await Promise.all(itemPromises);

      // Convert to projects
      const convertResponse = await fetch(`/api/admin/proposals/${proposal.id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!convertResponse.ok) throw new Error("Failed to convert to projects");
      return convertResponse.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proposals"] });
      toast({
        title: "Projects created successfully",
        description: `${approvedItems.size} projects created from Live Disease Free proposal.`,
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Error creating projects",
        description: error.message || "Failed to create projects from proposal.",
        variant: "destructive",
      });
    },
  });

  const toggleItemApproval = (itemId: string) => {
    const newApproved = new Set(approvedItems);
    if (newApproved.has(itemId)) {
      newApproved.delete(itemId);
    } else {
      newApproved.add(itemId);
    }
    setApprovedItems(newApproved);
  };

  const totalApprovedAmount = LIVE_DISEASE_FREE_ITEMS
    .filter(item => approvedItems.has(item.id))
    .reduce((sum, item) => sum + item.amount, 0);

  const approvedByPhase = LIVE_DISEASE_FREE_ITEMS.reduce((acc, item) => {
    if (approvedItems.has(item.id)) {
      acc[item.phase] = (acc[item.phase] || 0) + 1;
    }
    return acc;
  }, {} as Record<number, number>);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-lg border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">Strategic Growth & AI Enablement</h3>
            <p className="text-gray-600 mt-1">Live Disease Free - Comprehensive Implementation Plan</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Total Proposal Value</p>
            <p className="text-2xl font-bold text-gray-900">$22,500 CAD</p>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-yellow-800">Client Approval Status</h4>
            <p className="text-sm text-yellow-700 mt-1">
              Pam has approved all items in this proposal. Select which items to convert to projects.
            </p>
          </div>
        </div>
      </div>

      {approvedItems.size > 0 && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-green-800">Selected for Project Creation</h4>
                <p className="text-sm text-green-700">
                  {approvedItems.size} items selected • ${totalApprovedAmount.toLocaleString()} CAD total
                </p>
              </div>
              <Button 
                onClick={() => createProposalMutation.mutate()}
                disabled={createProposalMutation.isPending || approvedItems.size === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                {createProposalMutation.isPending ? "Creating Projects..." : "Create Projects"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h4 className="font-medium text-gray-900">Proposal Items</h4>
        
        {[1, 2, 3].map(phase => (
          <div key={phase} className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant={phase === 1 ? "default" : phase === 2 ? "secondary" : "outline"}>
                Phase {phase}
              </Badge>
              {approvedByPhase[phase] > 0 && (
                <span className="text-sm text-green-600 font-medium">
                  {approvedByPhase[phase]} item{approvedByPhase[phase] > 1 ? 's' : ''} selected
                </span>
              )}
            </div>
            
            {LIVE_DISEASE_FREE_ITEMS
              .filter(item => item.phase === phase)
              .map((item) => (
                <Card 
                  key={item.id} 
                  className={`border-l-4 cursor-pointer transition-all ${
                    approvedItems.has(item.id) 
                      ? 'border-l-green-500 bg-green-50' 
                      : 'border-l-gray-300 hover:border-l-blue-400 hover:bg-blue-50'
                  }`}
                  onClick={() => toggleItemApproval(item.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={approvedItems.has(item.id)}
                        onChange={() => {}} // Handled by card click
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {item.icon}
                          <h5 className="font-medium">{item.title}</h5>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">{item.description}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            ${item.amount.toLocaleString()} CAD
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {item.timeline}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button 
          onClick={() => setApprovedItems(new Set(LIVE_DISEASE_FREE_ITEMS.map(item => item.id)))}
          variant="secondary"
        >
          Select All Items
        </Button>
      </div>
    </div>
  );
}