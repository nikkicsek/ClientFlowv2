import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Service, ServiceCategory } from "@shared/schema";

interface EditServiceModalProps {
  service: Service | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditServiceModal({ service, isOpen, onClose }: EditServiceModalProps) {
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

  useEffect(() => {
    if (service && serviceCategories.length > 0) {
      // Find the category ID based on the service's category name
      const matchingCategory = serviceCategories.find(cat => cat.name === service.category);
      
      setFormData({
        name: service.name,
        category: service.category,
        categoryId: matchingCategory?.id || "",
        description: service.description || "",
        isActive: service.isActive ?? true,
      });
    }
  }, [service, serviceCategories]);

  const updateServiceMutation = useMutation({
    mutationFn: async (serviceData: typeof formData) => {
      if (!service) throw new Error("No service selected");

      // Find the selected category to get both name and ID
      const selectedCategory = sortedCategories.find(cat => cat.id === serviceData.categoryId);
      
      const cleanData = {
        name: serviceData.name.trim(),
        category: selectedCategory?.name || serviceData.category, // Keep for backwards compatibility
        categoryId: serviceData.categoryId,
        description: serviceData.description?.trim() || null,
        isActive: serviceData.isActive,
      };

      console.log("Updating service with data:", cleanData);

      const response = await apiRequest("PUT", `/api/services/${service.id}`, cleanData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update service");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Service Updated",
        description: "Service has been updated successfully",
      });
      onClose();
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

  const deleteServiceMutation = useMutation({
    mutationFn: async () => {
      if (!service) throw new Error("No service selected");

      const response = await apiRequest("DELETE", `/api/services/${service.id}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete service");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Service Deleted",
        description: "Service has been deleted successfully",
      });
      onClose();
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
    updateServiceMutation.mutate(formData);
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this service? This action cannot be undone.")) {
      deleteServiceMutation.mutate();
    }
  };

  if (!service) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Service</DialogTitle>
          <DialogDescription>
            Update the service details or delete the service.
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

          <div className="flex justify-between">
            <Button 
              type="button" 
              variant="destructive" 
              onClick={handleDelete}
              disabled={deleteServiceMutation.isPending}
            >
              {deleteServiceMutation.isPending ? "Deleting..." : "Delete Service"}
            </Button>
            <div className="space-x-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateServiceMutation.isPending}>
                {updateServiceMutation.isPending ? "Updating..." : "Update Service"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}