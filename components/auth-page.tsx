// This component is kept for backwards compatibility.
// Authentication now goes through /sign-in and /sign-up which use
// the JWT session system (lib/auth/). The old /login route redirects there.
export { Login as AuthPage } from '@/app/(login)/login';
