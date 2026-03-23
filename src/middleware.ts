import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

/**
 * Middleware uses the lightweight auth config (no DB adapter, no pg)
 * so it can run in Edge Runtime.
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isAuth = !!req.auth;
  const isPlanner = req.nextUrl.pathname.startsWith("/planner");
  const isApi = req.nextUrl.pathname.startsWith("/api");
  const isAuthApi = req.nextUrl.pathname.startsWith("/api/auth");

  // Allow auth API routes through
  if (isAuthApi) return;

  // Protect planner and non-auth API routes
  if (!isAuth) {
    if (isApi) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return Response.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/planner/:path*", "/api/:path*"],
};
