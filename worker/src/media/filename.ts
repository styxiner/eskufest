import type { AllowedContentType } from './types';
import { mediaType } from './types';

const MAX_NAME_LENGTH = 200;

/**
 * Normalizes a user-supplied file name for DISPLAY and download names only. It is
 * never used to build storage keys. Returns null when the extension does not match
 * the declared type.
 */
export function sanitizeFileName(raw: unknown, contentType: AllowedContentType): string | null {
  if (typeof raw !== 'string') return null;
  // Keep only the last path segment, drop control / bidi / zero-width characters.
  const lastSegment = raw.normalize('NFC').split(/[\\/]/).at(-1) ?? '';
  const cleaned = lastSegment
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const dot = cleaned.lastIndexOf('.');
  if (dot <= 0 || dot === cleaned.length - 1) return null;
  const extension = cleaned.slice(dot + 1).toLowerCase();
  if (!(mediaType(contentType).extensions as readonly string[]).includes(extension)) return null;

  const base = cleaned.slice(0, dot).slice(0, MAX_NAME_LENGTH - extension.length - 1).trim() || 'archivo';
  return `${base}.${extension}`;
}

/** RFC 6266 Content-Disposition with an ASCII fallback and the UTF-8 name (RFC 5987). */
export function contentDisposition(type: 'inline' | 'attachment', fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\;%]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
