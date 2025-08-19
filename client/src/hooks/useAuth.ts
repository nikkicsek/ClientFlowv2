import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  // Check session status first - light, cacheable check
  const { data: authStatus, isLoading: authLoading } = useQuery({
    queryKey: ["/auth/status"],
    retry: false,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // COMPLETELY DISABLE user query - since /auth/status already returns user data
  const sessionExists = (authStatus as any)?.sessionExists === true;
  const user = (authStatus as any)?.user || null;

  return {
    user,
    isLoading: authLoading,
    isAuthenticated: sessionExists && !!user,
    authStatus,
    error: null
  };
}
