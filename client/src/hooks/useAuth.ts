import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  // Check session status first
  const { data: authStatus, isLoading: authLoading } = useQuery({
    queryKey: ["/auth/status"],
    retry: false,
  });

  // Get user data only if session exists
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: (authStatus as any)?.sessionExists
  });

  return {
    user,
    isLoading: authLoading || ((authStatus as any)?.sessionExists && userLoading),
    isAuthenticated: (authStatus as any)?.sessionExists && !!user,
    authStatus
  };
}
