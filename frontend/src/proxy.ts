import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const SIGNED_IN_ROUTES = ["/dashboard", "/account", "/session"];

/* Sends a visitor without a session cookie to sign-in, remembering where they were going.
   The cookie's presence is only a fast first check: each gated page still verifies the session
   with the backend before it renders. */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const gated = SIGNED_IN_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (gated && !getSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/account/:path*", "/session/:path*"],
};
