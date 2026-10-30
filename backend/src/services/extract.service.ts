import { extractText, getDocumentProxy } from 'unpdf';
import { AppError } from '../lib/AppError.js';
import { Errors } from '../lib/errorFactory.js';

export interface ExtractedPage {
  page: number;
  text: string;
}

export interface ExtractedDocument {
  sourceType: 'markdown' | 'text' | 'pdf';
  content: string;
  sections?: ExtractedPage[];
}

export function sourceTypeForFilename(filename: string): ExtractedDocument['sourceType'] {
  const name = filename.toLowerCase();
  if (name.endsWith('.md')) return 'markdown';
  if (name.endsWith('.txt')) return 'text';
  if (name.endsWith('.pdf')) return 'pdf';
  throw Errors.badRequest('Only .md, .txt, and .pdf files allowed');
}

export async function extractUpload(filename: string, buffer: Buffer): Promise<ExtractedDocument> {
  const sourceType = sourceTypeForFilename(filename);
  if (sourceType === 'pdf') return extractPdf(buffer);

  const content = buffer.toString('utf-8').trim();
  if (!content) throw Errors.badRequest('Empty file');
  return { sourceType, content };
}

async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  if (buffer.subarray(0, 4).toString('latin1') !== '%PDF') {
    throw Errors.badRequest('File is not a valid PDF');
  }

  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: false });
    const sections: ExtractedPage[] = [];
    for (let i = 0; i < text.length; i++) {
      const pageText = text[i]?.trim() ?? '';
      if (!pageText) continue;
      sections.push({ page: i + 1, text: pageText });
    }
    if (sections.length === 0) throw Errors.badRequest('PDF has no extractable text');

    return {
      sourceType: 'pdf',
      content: sections.map((section) => section.text).join('\n\n'),
      sections,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw Errors.badRequest('Could not read this PDF. It may be encrypted or damaged.');
  } finally {
    if (pdf && 'destroy' in pdf && typeof pdf.destroy === 'function') {
      await pdf.destroy();
    }
  }
}
