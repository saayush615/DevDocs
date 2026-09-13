import { prisma } from '../lib/prisma.js';
import { Errors } from '../lib/errorFactory.js';
import { ingestDocument } from './aiClient.service.js';

export async function ingestUploadedFile(userId: string, originalname: string, buffer: Buffer) {
  const sourceType = originalname.endsWith('.md') ? 'markdown' : 'text';

  // 1. Pending row first so UI has something immediately.
  const doc = await prisma.document.create({
    data: { userId, title: originalname, sourceType, status: 'pending' },
  });

  try {
    // 2. Mark chunking + extract text from memory buffer.
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'chunking' } });
    const content = buffer.toString('utf-8').trim();
    if (!content) throw Errors.badRequest('Empty file');

    // 3. Forward to FastAPI (chunks + embeds + Qdrant).
    const result = await ingestDocument({
      document_id: doc.id,
      user_id: userId,
      content,
      source_type: 'text',
    });

    // 4. AI returns 200 even on failure — must check the status field.
    if (result.status !== 'embedded') throw Errors.aiService('AI ingest returned failed');

    // 5. Success -> embedded + count.
    return await prisma.document.update({
      where: { id: doc.id },
      data: { status: 'embedded', chunkCount: result.chunks_created },
    });
  } catch (err) {
    // 6. Any failure -> failed (visible in UI, never silently stuck at chunking).
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'failed' } });
    throw err;
  }
}
