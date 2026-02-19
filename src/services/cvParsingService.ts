import { PDFParse } from 'pdf-parse';
import { logger } from '../utils/logger.js';

/**
 * Downloads a PDF from a URL and extracts its text content using pdf-parse v2.
 * Designed for Supabase Storage URLs but works with any accessible PDF URL.
 *
 * @param fileUrl - Public URL of the PDF file (e.g. Supabase Storage URL)
 * @returns Extracted text content from the PDF
 * @throws Error if download fails, PDF is invalid, or text extraction yields empty content (scanned PDF)
 */
export async function extractTextFromPdf(fileUrl: string): Promise<string> {
  logger.info('Downloading PDF for text extraction', { fileUrl });

  const response = await fetch(fileUrl);

  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && !contentType.includes('pdf') && !contentType.includes('octet-stream')) {
    throw new Error(`Unexpected content type: ${contentType}. Expected a PDF file.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  if (data.length === 0) {
    throw new Error('Downloaded file is empty');
  }

  logger.info('PDF downloaded, extracting text', { sizeBytes: data.length });

  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const text = result.text?.trim();

    if (!text || text.length < 20) {
      throw new CvParsingError(
        'scanned_pdf',
        'Could not extract text from the PDF. This usually means the PDF is a scanned image rather than a text-based document. Please upload a text-based PDF.',
      );
    }

    logger.info('PDF text extraction complete', {
      pages: result.total,
      textLength: text.length,
    });

    return text;
  } finally {
    await parser.destroy();
  }
}

/**
 * Custom error class for CV parsing errors with a machine-readable error code.
 */
export class CvParsingError extends Error {
  constructor(
    public readonly code: 'scanned_pdf' | 'extraction_failed' | 'ai_failed',
    message: string,
  ) {
    super(message);
    this.name = 'CvParsingError';
  }
}
