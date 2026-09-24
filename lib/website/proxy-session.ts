import { SignJWT, jwtVerify } from 'jose';
import { supabaseAdmin } from '@/lib/supabase';
import { getUser } from '@/lib/db/queries';
import { validateShareToken } from '@/app/actions/share-links';
import { proxyPrefix } from '@/lib/website/proxy-path';

/**
 * A short-lived pass for one website review's proxy.
 *
 * A proxied page pulls tens to hundreds of assets, and each used to repeat the
 * full access check — a share-token lookup or a session read plus two queries —
 * before fetching a single byte. The document request still does that check
 * once; it then sets this cookie, scoped to the review's proxy path, and every
 * asset only has to verify a signature.
 *
 * The audience claim keeps it from ever being mistaken for a login session,
 * which is signed with the same secret.
 */

const key = new TextEncoder().encode(process.env.AUTH_SECRET);
const AUDIENCE = 'rv-proxy';
const TTL_SECONDS = 60 * 60;

export function proxyCookieName(projectId: string): string {
  return `rv_px_${projectId.replace(/-/g, '')}`;
}

export async function signProxyPass(projectId: string): Promise<string> {
  return new SignJWT({ pid: projectId })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key);
}

export async function verifyProxyPass(token: string | undefined, projectId: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], audience: AUDIENCE });
    return payload.pid === projectId;
  } catch {
    return false;
  }
}

export function proxyCookieOptions(projectId: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: proxyPrefix(projectId),
    maxAge: TTL_SECONDS,
  };
}

/**
 * The full check: a share token for this review, an admin, or a member who
 * has been given the review. Mirrors hasWebsiteProjectAccess, plus tokens.
 */
export async function canOpenWebsiteProject(projectId: string, token: string | null): Promise<boolean> {
  if (token) {
    const { success, shareLink } = await validateShareToken(token);
    if (success && shareLink && shareLink.resourceId === projectId) return true;
  }
  const user = await getUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!user.email) return false;
  const { data } = await supabaseAdmin
    .from('website_project_access')
    .select('project_id')
    .eq('project_id', projectId)
    .eq('user_email', user.email)
    .maybeSingle();
  return Boolean(data);
}
