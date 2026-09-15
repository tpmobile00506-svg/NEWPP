import { member, checkOrigin } from '../auth/sessions';
import { getData, upload, ApiError } from '../services/asset-service';
import { mutate } from '../services/asset-mutations';
import { json } from '../db/client';
export function fail(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return Response.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 });
  const code = (error as { code?: string })?.code;
  if (['P2002', 'P2004', 'P2034'].includes(code || '')) return Response.json({ error: 'ข้อมูลซ้ำ หรือมีผู้อื่นแก้ไขแล้ว กรุณาโหลดข้อมูลใหม่' }, { status: 409 });
  console.error('Asset API failed', { code, type: error instanceof Error ? error.name : 'unknown' });
  return Response.json({ error: 'ระบบไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง' }, { status: 503 });
}
function response(value: unknown) { return new Response(json(value), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
export async function GET(request: Request) {
  try { return response(await getData(await member(request), new URL(request.url))); } catch (error) { return fail(error); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await member(request);
    if (Number(request.headers.get('content-length')) > 4.25 * 1024 * 1024) throw new ApiError('ไฟล์ต้องไม่เกิน 4 MB', 413);
    const value = request.headers.get('content-type')?.includes('multipart/form-data') ? await upload(user, await request.formData()) : await mutate(user, await request.json());
    return response(value);
  } catch (error) { return fail(error); }
}
