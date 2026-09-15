import { member } from '@/backend/auth/sessions';
import { ApiError } from '@/backend/services/errors';
import { readFileBytes } from '@/backend/storage/files';
import { prisma } from '@/backend/db/client';
import { fail } from './data';

export async function GET(request: Request) {
  try {
    await member(request);
    const s = new URL(request.url).searchParams.get('source');
    const f = await prisma.importFile.findUnique({ where: { id: s || '' } });
    if (!f) throw new ApiError('ไม่พบไฟล์', 404);
    const body = (await readFileBytes(f.objectKey)) as unknown as BodyInit;
    const name = f.name;
    return new Response(body, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(name),
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    return fail(e);
  }
}

