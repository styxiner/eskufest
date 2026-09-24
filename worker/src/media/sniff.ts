import type { MediaType } from './types';

/** Number of leading bytes needed to recognize every supported container. */
export const SNIFF_BYTES = 64;

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

const startsWith = (bytes: Uint8Array, prefix: readonly number[]) =>
  bytes.length >= prefix.length && prefix.every((byte, i) => bytes[i] === byte);

/**
 * Detects the real container of a file from its first bytes. Never trusts the declared
 * Content-Type or the file extension. Returns null for anything not supported.
 */
export function sniffSignature(bytes: Uint8Array): MediaType['signature'] | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) return 'gif';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';
  // ISO base media (MP4/MOV): box size (4 bytes) + 'ftyp'.
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') return 'isobmff';
  // EBML header whose DocType is "webm" (plain Matroska .mkv is not accepted).
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) && ascii(bytes, 0, bytes.length).includes('webm')) return 'webm';
  return null;
}
