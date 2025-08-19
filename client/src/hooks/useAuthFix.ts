import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";

export function useAuth() {
  const [userQueryDisabled, setUserQueryDisabled] = useState(false);

  // Check session status first - light, cacheable check
  const statusQuery = useQuery({
    queryKey: ["/auth/status"],
    retry: false,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const sessionExists = (statusQuery.data as any)?.sessionExists === true;

  // Get user data only when session confirmed to exist - STRICT enabling with disable on unauthorized
  const userQuery = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    enabled: sessionExists && !userQueryDisabled
  });

  // Disable future queries if we get unauthorized
  useEffect(() => {
    if ((userQuery.data as any)?.__unauthorized === true) {
      setUserQueryDisabled(true);
    }
  }, [userQuery.data]);

  // Reset disabled state when session status changes
  useEffect(() => {
    if (!sessionExists) {
      setUserQueryDisabled(false);
    }
  }, [sessionExists]);

  const isUnauthorized = (userQuery.data as any)?.__unauthorized === true;

  return {
    user: isUnauthorized ? null : userQuery.data,
    isLoading: statusQuery.isLoading || (sessionExists && userQuery.isLoading && !isUnauthorized && !userQueryDisabled),
    isAuthenticated: sessionExists && !!userQuery.data && !isUnauthorized,
    authStatus: statusQuery.data,
    error: statusQuery.error || userQuery.error
  };
}