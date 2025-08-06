import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { UserPlus, Building2 } from "lucide-react";
import { Organization } from "@shared/schema";

export function CreateClientModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    companyName: "",
    phone: "",
    address: "",
    organizationId: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/admin/organizations"],
    enabled: isOpen,
  });

  const createClientMutation = useMutation({
    mutationFn: async (clientData: typeof formData) => {
      // Clean the data before sending
      const cleanData = {
        firstName: clientData.firstName.trim(),
        lastName: clientData.lastName.trim(),
        email: clientData.email.trim().toLowerCase(),
        companyName: clientData.companyName?.trim() || null,
        phone: clientData.phone?.trim() || null,
        address: clientData.address?.trim() || null,
        organizationId: clientData.organizationId || null,
        role: "client"
      };

      console.log("Sending client data:", cleanData);

      const response = await apiRequest("POST", "/api/admin/clients", cleanData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create client");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Client Created",
        description: "New client has been added successfully",
      });
      setIsOpen(false);
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        companyName: "",
        phone: "",
        address: "",
        organizationId: "",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast({
        title: "Missing Information",
        description: "First name, last name, and email are required",
        variant: "destructive",
      });
      return;
    }

    createClientMutation.mutate(formData);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          Add New Client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add New Client
          </DialogTitle>
          <DialogDescription>
            Create a new client account for your agency
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">First Name *</Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleInputChange("firstName", e.target.value)}
                placeholder="Enter first name"
                required
              />
            </div>
            <div>
              <Label htmlFor="lastName">Last Name *</Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleInputChange("lastName", e.target.value)}
                placeholder="Enter last name"
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              placeholder="client@example.com"
              required
            />
          </div>

          <div>
            <Label htmlFor="organizationId">Business Organization</Label>
            <Select value={formData.organizationId} onValueChange={(value) => handleInputChange("organizationId", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select organization (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No Organization (Individual Client)</SelectItem>
                {organizations?.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      <div>
                        <div className="font-medium">{org.name}</div>
                        {org.industry && (
                          <div className="text-xs text-gray-500">{org.industry}</div>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="companyName">Company Name</Label>
            <Input
              id="companyName"
              value={formData.companyName}
              onChange={(e) => handleInputChange("companyName", e.target.value)}
              placeholder="Company or organization name"
            />
          </div>

          <div>
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              placeholder="(555) 123-4567"
            />
          </div>

          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={formData.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              placeholder="Business address (optional)"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button 
              type="submit"
              disabled={createClientMutation.isPending}
              className="flex-1"
            >
              {createClientMutation.isPending ? "Creating..." : "Create Client"}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}