import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  // Use the working auth status route
  const { data: authStatus, isLoading: authLoading } = useQuery({
    queryKey: ["/auth/status"],
    retry: 2,
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const sessionExists = (authStatus as any)?.sessionExists === true;
  const user = (authStatus as any)?.user || null;
  const isAuthenticated = (authStatus as any)?.isAuthenticated === true;

  return {
    user,
    isLoading: authLoading,
    isAuthenticated,
    authStatus,
    error: null
  };
}
