import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { signToken, verifyToken } from '@/lib/auth/session';

// Routes that redirect logged-in users away (auth pages only)
const authOnlyRoutes = ['/', '/sign-in', '/sign-up', '/login', '/landing'];
// Routes that are publicly accessible but do NOT redirect logged-in users
const publicPrefixes = ['/share', '/api/share', '/panoramas/embed', '/tours/embed'];

function isPublicPath(pathname: string): boolean {
  if (authOnlyRoutes.some((route) => pathname === route)) return true;
  if (publicPrefixes.some((prefix) => pathname.startsWith(prefix))) return true;
  return false;
}

function isAuthOnlyPath(pathname: string): boolean {
  return authOnlyRoutes.some((route) => pathname === route);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('session');

  const isPublicRoute = isPublicPath(pathname);
  const isProtectedRoute = !isPublicRoute;

  if (isProtectedRoute && !sessionCookie) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  // Redirect authenticated users away from auth-only pages (sign-in, sign-up, etc.)
  // Share pages are intentionally excluded — logged-in users must be able to open them.
  if (isAuthOnlyPath(pathname) && sessionCookie) {
    try {
      await verifyToken(sessionCookie.value);
      return NextResponse.redirect(new URL('/projects', request.url));
    } catch {
      // Invalid token — let them through to the login page
    }
  }

  let res = NextResponse.next();

  // Refresh the session cookie on every GET request
  if (sessionCookie && request.method === 'GET') {
    try {
      const parsed = await verifyToken(sessionCookie.value);
      const expiresInOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
      res.cookies.set({
        name: 'session',
        value: await signToken({
          ...parsed,
          expires: expiresInOneDay.toISOString(),
        }),
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        expires: expiresInOneDay,
      });
    } catch {
      res.cookies.delete('session');
      if (isProtectedRoute) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
      }
    }
  }

  return res;
}

export const config = {
  // Static files in /public must be excluded, not just /_next. Without the
  // extension guard, a request for /logo.png is treated as a protected route
  // and redirected to /sign-in — including the image optimizer's own internal
  // fetch, which then receives HTML and fails with "isn't a valid image".
  // That broke the logo on every workspace page and every guest share view.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|css|js|mjs|map|txt|xml|json|woff|woff2|ttf|otf|eot|mp4|webm|ogv|mov|pdf)$).*)',
  ],
  runtime: 'nodejs',
};
