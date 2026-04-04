import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
    const isAuthenticated = !!req.auth;
    const { pathname } = req.nextUrl;

    // Public routes (accessible without login)
    const publicRoutes = ["/login", "/register", "/about"];
    const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

    // System routes
    const isApiRoute = pathname.startsWith("/api");
    const isStaticFile =
        pathname.startsWith("/_next") ||
        pathname.startsWith("/images") ||
        pathname.startsWith("/dcv");

    // Allow public routes, API routes, and static files
    if (isPublicRoute || isApiRoute || isStaticFile) {
        return NextResponse.next();
    }

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Allow authenticated users
    return NextResponse.next();
});

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
