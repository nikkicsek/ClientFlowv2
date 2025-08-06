import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, Trash2, Plus, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ServiceCategory, InsertServiceCategory } from "@shared/schema";

const serviceCategorySchema = z.object({
  name: z.string().min(1, "Category name is required").max(100, "Name too long"),
  description: z.string().optional(),
});

type ServiceCategoryFormData = z.infer<typeof serviceCategorySchema>;

interface EditCategoryFormProps {
  category: ServiceCategory;
  onClose: () => void;
}

function EditCategoryForm({ category, onClose }: EditCategoryFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ServiceCategoryFormData>({
    resolver: zodResolver(serviceCategorySchema),
    defaultValues: {
      name: category.name,
      description: category.description || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<InsertServiceCategory>) =>
      apiRequest(`/api/service-categories/${category.id}`, {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-categories"] });
      toast({ title: "Category updated successfully!" });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update category. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/service-categories/${category.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-categories"] });
      toast({ title: "Category deleted successfully!" });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete category. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: ServiceCategoryFormData) => {
    updateMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Digital Marketing" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Brief description of this service category..."
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <div className="flex w-full justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (window.confirm("Are you sure you want to delete this category? This action cannot be undone.")) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateMutation.isPending}
                className="min-w-[100px]"
              >
                {updateMutation.isPending ? "Updating..." : "Update Category"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </form>
    </Form>
  );
}

function CreateCategoryForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ServiceCategoryFormData>({
    resolver: zodResolver(serviceCategorySchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertServiceCategory) =>
      apiRequest("/api/service-categories", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-categories"] });
      toast({ title: "Category created successfully!" });
      onClose();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create category. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: ServiceCategoryFormData) => {
    createMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Digital Marketing" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (Optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Brief description of this service category..."
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={createMutation.isPending}
            className="min-w-[100px]"
          >
            {createMutation.isPending ? "Creating..." : "Create Category"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export function ServiceCategoryModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["/api/service-categories"],
    enabled: isOpen,
  });

  const handleClose = () => {
    setIsOpen(false);
    setEditingCategory(null);
    setShowCreateForm(false);
  };

  const handleCreateNew = () => {
    setEditingCategory(null);
    setShowCreateForm(true);
  };

  const handleEditCategory = (category: ServiceCategory) => {
    setShowCreateForm(false);
    setEditingCategory(category);
  };

  const showCategoryList = !showCreateForm && !editingCategory;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="w-4 h-4 mr-2" />
          Manage Categories
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {showCreateForm ? "Create Service Category" : 
             editingCategory ? "Edit Service Category" : 
             "Manage Service Categories"}
          </DialogTitle>
          <DialogDescription>
            {showCreateForm ? "Add a new service category to organize your services." :
             editingCategory ? "Update the service category details." :
             "Organize your services by creating and managing categories."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {showCreateForm && <CreateCategoryForm onClose={handleClose} />}
          
          {editingCategory && (
            <EditCategoryForm 
              category={editingCategory} 
              onClose={handleClose} 
            />
          )}
          
          {showCategoryList && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  {categories.length} categories
                </p>
                <Button onClick={handleCreateNew} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Button>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-8">
                  <div className="text-sm text-gray-500">Loading categories...</div>
                </div>
              ) : categories.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">No service categories yet.</p>
                  <Button onClick={handleCreateNew}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Category
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 max-h-96 overflow-y-auto">
                  {categories.map((category: ServiceCategory) => (
                    <Card key={category.id} className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{category.name}</h4>
                          {category.description && (
                            <p className="text-sm text-gray-600 mt-1">{category.description}</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditCategory(category)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {showCategoryList && (
                <DialogFooter>
                  <Button variant="outline" onClick={handleClose}>
                    Close
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}