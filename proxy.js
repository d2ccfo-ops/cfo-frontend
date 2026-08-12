import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next.js 16 renamed the middleware.js convention to proxy.js — same runtime
// behavior, different file/export name. See node_modules/next/dist/docs/
// .../file-conventions/proxy.md.

// /onboarding is intentionally NOT public — it requires sign-in (auth.protect()
// with no options only checks userId, not org membership), since a user has
// to be authenticated before they can create their first organization there.
const isPublicRoute = createRouteMatcher(["/login(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)",
  ],
};
