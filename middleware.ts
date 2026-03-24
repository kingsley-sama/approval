import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { signToken, verifyToken } from '@/lib/auth/session';

const protectedRoutes = ['/projects', '/project'];
const publicRoutes = ['/', '/sign-in', '/sign-up', '/login'];

function matchesRoute(pathname: string, route: string) {
  if (route === '/') {
    return pathname === '/';
  }

  return pathname === route || pathname.startsWith(`${route}/`);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('session');

  const isProtectedRoute = protectedRoutes.some(
    (route) => matchesRoute(pathname, route)
  );
  const isPublicRoute = publicRoutes.some((route) => matchesRoute(pathname, route));

  if (isProtectedRoute && !sessionCookie) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  // Redirect authenticated users away from public pages
  if (isPublicRoute && sessionCookie) {
    try {
      await verifyToken(sessionCookie.value);
      if (pathname === '/') {
        return NextResponse.redirect(new URL('/projects', request.url));
      }
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
