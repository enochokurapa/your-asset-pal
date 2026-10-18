import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    // A server function/API must receive an actual error, not an HTML document.
    // Returning HTML here made callers interpret error pages as saved records or arrays.
    const request = getRequest();
    const accept = request.headers.get("accept") ?? "";
    if (request.method !== "GET" || !accept.includes("text/html")) {
      console.error("[Server request failed]", error);
      throw error;
    }
    console.error("[Document render failed]", error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
