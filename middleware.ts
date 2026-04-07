import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { signToken, verifyToken } from '@/lib/auth/session';

// Routes that redirect logged-in users away (auth pages only)
const authOnlyRoutes = ['/', '/sign-in', '/sign-up', '/login', '/landing'];
// Routes that are publicly accessible but do NOT redirect logged-in users
const publicPrefixes = ['/share', '/api/share'];

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
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
  runtime: 'nodejs',
};
