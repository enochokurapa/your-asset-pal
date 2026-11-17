import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions:{
      queries:{
        // Reuse recently viewed pages, while writes still invalidate affected queries.
        staleTime:45_000,
        gcTime:5*60_000,
        refetchOnWindowFocus:false,
        refetchOnReconnect:true,
        retry:1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload:"intent",
    defaultPreloadDelay:90,
    defaultPreloadStaleTime:30_000,
    defaultPendingMs:150,
    defaultPendingMinMs:200,
  });

  return router;
};
