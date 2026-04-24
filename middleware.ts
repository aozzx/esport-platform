import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Generate a per-request nonce. Modern browsers ignore 'unsafe-inline' when
  // a nonce is present, so this effectively removes unsafe-inline for script-src.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' propagates trust to scripts loaded by nonce-bearing scripts
    // (required for Next.js dynamic chunk imports).
    // 'unsafe-inline' is listed only for browsers that don't support nonces (CSP2)
    // — all modern browsers ignore it when a nonce is present.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // style-src: 'unsafe-inline' removed. If JSX style={{}} props cause CSP
    // violations, individual components must switch to Tailwind classes.
    "style-src 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-ancestors 'none'",
  ].join("; ");

  // Forward the nonce to the layout via request headers so Next.js can apply
  // it to its own inline hydration scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  // ── Admin route protection ─────────────────────────────────────────────────
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request: { headers: requestHeaders } });
            response.headers.set("Content-Security-Policy", csp);
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      // Authenticated user has no profile row — could be a new user whose profile
      // trigger hasn't fired, an orphaned auth record, or an RLS misconfiguration.
      console.error(
        `[middleware] admin access denied: no profile row for user ${user.id}`,
        profileError?.message ?? "profile is null"
      );
      return NextResponse.redirect(new URL("/", request.url));
    }

    if (profile.role !== "owner" && profile.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  // Run on all routes except Next.js internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.png$|.*\\.ico$).*)"],
};
