import { QueryClient } from "@tanstack/solid-query";

/**
 * Single QueryClient instance for the whole app. Defaults tuned for our use:
 *
 *  - staleTime 5 min  → data stays fresh between navigations without refetch,
 *                       Realtime subscriptions push targeted updates anyway.
 *  - gcTime    30 min → keep unused data around long enough that returning to
 *                       a page after a detour shows cached data instantly.
 *  - refetchOnWindowFocus false → Realtime owns liveness; tab focus refetches
 *                       are redundant and add load.
 *  - retry 1          → a single retry for transient network blips; longer
 *                       chains just make errors feel slow.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
