import { logout, sessionCookie } from '@/backend/auth/sessions';
import { ApiError } from '@/backend/services/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    return await logout(request);
  } catch (err: unknown) {
    if (err instanceof ApiError && err.status < 500) {
      return Response.json({ error: err.message }, { status: err.status, headers: { 'Cache-Control': 'no-store' } });
    }
    console.error('Logout error:', err);
    return Response.json({ error: 'ล้างการเข้าสู่ระบบบนอุปกรณ์นี้แล้ว แต่ยังยืนยันการปิดเซสชันบนเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่ภายหลัง' }, {
      status: 503, headers: { 'Set-Cookie': sessionCookie('', 0), 'Cache-Control': 'no-store' },
    });
  }
}

