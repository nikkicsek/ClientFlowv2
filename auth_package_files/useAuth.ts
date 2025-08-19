import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  // Check session status first
  const { data: authStatus, isLoading: authLoading, error: authError } = useQuery({
    queryKey: ["/auth/status"],
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Get user data only if session exists and no auth errors
  const { data: user, isLoading: userLoading, error: userError } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    enabled: !!(authStatus as any)?.sessionExists && !authError
  });

  return {
    user,
    isLoading: authLoading || ((authStatus as any)?.sessionExists && userLoading),
    isAuthenticated: (authStatus as any)?.sessionExists && !!user,
    authStatus,
    error: authError || userError
  };
}
