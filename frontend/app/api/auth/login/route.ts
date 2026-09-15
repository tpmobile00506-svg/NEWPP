import { login } from '@/backend/auth/sessions';
import { ApiError } from '@/backend/services/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    return await login(request);
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status < 500) {
      return Response.json({ error: err.message }, { status: err.status, headers: { 'Cache-Control': 'no-store', ...(err.status === 429 ? { 'Retry-After': '900' } : {}) } });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Login error:', msg);
    return Response.json({ error: 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

