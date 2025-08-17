import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import AdminDashboard from "@/pages/admin-dashboard";
import ClientView from "@/pages/client-view";
import NotFound from "@/pages/not-found";
import InvitationPage from "@/pages/invitation-page";
import { MyTasksPage } from "@/pages/my-tasks";

function Router() {
  const { user, isAuthenticated, isLoading, authStatus } = useAuth();

  if (isLoading) {
    return <Landing />;
  }

  return (
    <Switch>
      {/* Public invitation route - accessible without auth */}
      <Route path="/invite/:token" component={InvitationPage} />
      
      {!isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/my-tasks" component={MyTasksPage} />
          <Route path="*" component={Landing} />
        </>
      ) : (
        <>
          <Route path="/client-view" component={ClientView} />
          <Route path="/my-tasks" component={MyTasksPage} />
          {(user as any)?.role === 'admin' ? (
            <>
              <Route path="/" component={AdminDashboard} />
              <Route path="/admin" component={AdminDashboard} />
            </>
          ) : (
            <Route path="/" component={Dashboard} />
          )}
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
