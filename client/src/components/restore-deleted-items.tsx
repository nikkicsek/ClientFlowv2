import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RotateCcw, Trash2, Calendar, User } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DeletedItem {
  id: string;
  type: "organization" | "user" | "project" | "service" | "task" | "proposal";
  name: string;
  deletedAt: string;
  deletedBy: string;
  deletedByName?: string;
}

interface RestoreDeletedItemsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RestoreDeletedItems({ isOpen, onClose }: RestoreDeletedItemsProps) {
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch deleted items
  const { data: deletedItems, isLoading } = useQuery<DeletedItem[]>({
    queryKey: ["/api/admin/deleted-items"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/deleted-items");
      return response.json();
    },
    enabled: isOpen,
  });

  // Restore item mutation
  const restoreItemMutation = useMutation({
    mutationFn: async ({ itemId, itemType }: { itemId: string; itemType: string }) => {
      const response = await apiRequest("POST", `/api/admin/restore/${itemType}/${itemId}`);
      return response.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Item Restored",
        description: `The ${variables.itemType} has been successfully restored.`,
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/admin/deleted-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/proposals"] });
      
      setRestoringId(null);
    },
    onError: (error) => {
      toast({
        title: "Restore Failed",
        description: error.message || "Failed to restore item. Please try again.",
        variant: "destructive",
      });
      setRestoringId(null);
    },
  });

  const handleRestore = (item: DeletedItem) => {
    setRestoringId(item.id);
    restoreItemMutation.mutate({
      itemId: item.id,
      itemType: item.type,
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "organization": return "bg-purple-100 text-purple-700";
      case "user": return "bg-blue-100 text-blue-700";
      case "project": return "bg-green-100 text-green-700";
      case "service": return "bg-orange-100 text-orange-700";
      case "task": return "bg-indigo-100 text-indigo-700";
      case "proposal": return "bg-pink-100 text-pink-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Restore Deleted Items
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-16 bg-gray-200 rounded-lg"></div>
                </div>
              ))}
            </div>
          ) : !deletedItems || deletedItems.length === 0 ? (
            <div className="text-center py-8">
              <Trash2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Deleted Items</h3>
              <p className="text-gray-600">
                There are no deleted items to restore at this time.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {deletedItems.map((item) => (
                <Card key={item.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Badge className={getTypeColor(item.type)}>
                            {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                          </Badge>
                          <h4 className="font-medium text-gray-900">{item.name}</h4>
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Deleted {new Date(item.deletedAt).toLocaleDateString()}</span>
                          </div>
                          {item.deletedByName && (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              <span>by {item.deletedByName}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestore(item)}
                        disabled={restoringId === item.id || restoreItemMutation.isPending}
                        className="text-green-600 hover:text-green-700 border-green-300 hover:bg-green-50"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        {restoringId === item.id ? "Restoring..." : "Restore"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Separator className="my-4" />
        
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}