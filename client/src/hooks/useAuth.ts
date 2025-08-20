import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  // Use the existing working auth/user endpoint
  const { data: user, isLoading: authLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: 2,
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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
