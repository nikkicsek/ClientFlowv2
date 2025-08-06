import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus } from "lucide-react";
import type { ServiceCategory } from "@shared/schema";

export function CreateServiceModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    categoryId: "",
    description: "",
    isActive: true,
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch service categories
  const { data: serviceCategories = [] } = useQuery<ServiceCategory[]>({
    queryKey: ["/api/service-categories"],
    enabled: isOpen,
  });

  // Sort categories alphabetically
  const sortedCategories = [...serviceCategories].sort((a, b) => a.name.localeCompare(b.name));

  const createServiceMutation = useMutation({
    mutationFn: async (serviceData: typeof formData) => {
      // Find the selected category to get both name and ID
      const selectedCategory = sortedCategories.find(cat => cat.id === serviceData.categoryId);
      
      const cleanData = {
        name: serviceData.name.trim(),
        category: selectedCategory?.name || serviceData.category, // Keep for backwards compatibility
        categoryId: serviceData.categoryId,
        description: serviceData.description?.trim() || null,
        isActive: serviceData.isActive,
      };

      console.log("Creating service with data:", cleanData);

      const response = await apiRequest("POST", "/api/services", cleanData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create service");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Service Created",
        description: "New service has been added successfully",
      });
      setIsOpen(false);
      setFormData({
        name: "",
        category: "",
        categoryId: "",
        description: "",
        isActive: true,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.categoryId) {
      toast({
        title: "Validation Error",
        description: "Service name and category are required",
        variant: "destructive",
      });
      return;
    }
    createServiceMutation.mutate(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add New Service
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Service</DialogTitle>
          <DialogDescription>
            Create a new service offering for your agency.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Service Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              placeholder="e.g., Website Design, SEO Optimization"
              required
            />
          </div>

          <div>
            <Label htmlFor="category">Category *</Label>
            <Select value={formData.categoryId} onValueChange={(value) => handleInputChange("categoryId", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select service category" />
              </SelectTrigger>
              <SelectContent>
                {sortedCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange("description", e.target.value)}
              placeholder="Describe what this service includes..."
              rows={3}
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => handleInputChange("isActive", e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="isActive">Service is active</Label>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createServiceMutation.isPending}>
              {createServiceMutation.isPending ? "Creating..." : "Create Service"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}