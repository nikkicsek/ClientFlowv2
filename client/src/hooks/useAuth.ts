import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  // Check session status first - light, cacheable check
  const statusQuery = useQuery({
    queryKey: ["/auth/status"],
    retry: false,
  });

  // Get user data only when session confirmed to exist
  const userQuery = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: (statusQuery.data as any)?.sessionExists === true
  });

  // Don't re-enable userQuery if it receives unauthorized response
  const isUnauthorized = (userQuery.data as any)?.__unauthorized === true;

  return {
    user: isUnauthorized ? null : userQuery.data,
    isLoading: statusQuery.isLoading || ((statusQuery.data as any)?.sessionExists && userQuery.isLoading),
    isAuthenticated: (statusQuery.data as any)?.sessionExists && !!userQuery.data && !isUnauthorized,
    authStatus: statusQuery.data,
    error: statusQuery.error || userQuery.error
  };
}
