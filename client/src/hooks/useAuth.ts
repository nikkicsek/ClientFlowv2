import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  // Use the existing working auth/user endpoint with conservative settings
  const { data: user, isLoading: authLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: 1,
    staleTime: 60_000, // Cache for 1 minute
    refetchOnMount: false, // Prevent excessive requests
    refetchOnWindowFocus: false, // Prevent excessive requests
    refetchOnReconnect: false, // Prevent excessive requests
    refetchInterval: false, // No automatic polling
  });

  const isAuthenticated = !!user && !error;

  return {
    user,
    isLoading: authLoading,
    isAuthenticated,
    authStatus: { user, isAuthenticated },
    error
  };
}
