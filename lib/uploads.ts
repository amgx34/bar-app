/**
 * Upload validation.
 *
 * The four import inputs constrain files with an `accept` attribute, which is a
 * hint to the file picker — a client can send anything regardless. Parsing runs
 * server-side, so the real gate belongs there.
 *
 * Files are never persisted: they are read in the browser and posted as text.
 * So this validates *content*, not storage.
 */

/** Above this, it is not a POS export. Also the ceiling on what reaches a model. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMPORT_EXTENSIONS = ['.csv', '.txt', '.text', '.tsv'] as const;

export class InvalidUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUploadError';
  }
}

/** Extension check, used on both sides — the client for a fast message, the server to enforce. */
export function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_IMPORT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Rejects content that cannot be a text report.
 *
 * Extension and MIME type are both attacker-controlled, so neither is trusted on
 * its own — this looks at the bytes. A NUL byte in the first block is the
 * cheapest reliable signal that something binary was renamed to .csv.
 */
export function assertParsableTextUpload(
  content: string,
  filename?: string,
): void {
  if (content.length === 0) {
    throw new InvalidUploadError('That file is empty.');
  }

  const bytes = new TextEncoder().encode(content).length;
  if (bytes > MAX_IMPORT_BYTES) {
    throw new InvalidUploadError(
      `That file is ${(bytes / 1024 / 1024).toFixed(1)}MB. Imports are limited to ${MAX_IMPORT_BYTES / 1024 / 1024}MB — check you selected the right file.`,
    );
  }

  if (filename && !hasAllowedExtension(filename)) {
    throw new InvalidUploadError(
      `${filename} is not a supported type. Upload a ${ALLOWED_IMPORT_EXTENSIONS.join(', ')} file.`,
    );
  }

  // Binary sniff over the first block — enough to catch a renamed PDF, image or
  // archive without scanning a large file end to end.
  const head = content.slice(0, 8192);
  if (head.includes('\u0000')) {
    throw new InvalidUploadError(
      'That file looks binary, not a text report. Export it as CSV or plain text first.',
    );
  }

  // Reports are overwhelmingly ASCII. A high proportion of replacement
  // characters means it was decoded as text but is not.
  const replacementChars = (head.match(/\uFFFD/g) ?? []).length;
  if (replacementChars > head.length * 0.1) {
    throw new InvalidUploadError(
      'That file could not be read as text. Export it as CSV or plain text first.',
    );
  }
}
