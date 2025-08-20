import { useState, useEffect } from "react";

let authCache: { user: any; timestamp: number; isAuthenticated: boolean } | null = null;
const CACHE_DURATION = 60000; // 1 minute

export function useAuth() {
  const [state, setState] = useState<{
    user: any;
    isLoading: boolean;
    isAuthenticated: boolean;
    error: any;
  }>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    error: null
  });

  useEffect(() => {
    // Check cache first
    if (authCache && Date.now() - authCache.timestamp < CACHE_DURATION) {
      setState({
        user: authCache.user,
        isLoading: false,
        isAuthenticated: authCache.isAuthenticated,
        error: null
      });
      return;
    }

    // Only make one request
    let isCancelled = false;
    
    fetch('/api/auth/user', {
      credentials: 'include'
    })
    .then(response => {
      if (!isCancelled) {
        if (response.ok) {
          return response.json();
        } else {
          throw new Error('Unauthorized');
        }
      }
    })
    .then(user => {
      if (!isCancelled) {
        authCache = {
          user,
          timestamp: Date.now(),
          isAuthenticated: true
        };
        setState({
          user,
          isLoading: false,
          isAuthenticated: true,
          error: null
        });
      }
    })
    .catch(error => {
      if (!isCancelled) {
        authCache = {
          user: null,
          timestamp: Date.now(),
          isAuthenticated: false
        };
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          error
        });
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  return {
    user: state.user,
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    authStatus: { user: state.user, isAuthenticated: state.isAuthenticated },
    error: state.error
  };
}
