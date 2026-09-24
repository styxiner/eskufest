/** Server-side allowlist of accepted media. Nothing outside this table is ever stored. */
export type MediaKind = 'image' | 'video';

export interface MediaType {
  kind: MediaKind;
  extensions: readonly string[];
  /** Container family detected from the first bytes of the file (see sniff.ts). */
  signature: 'jpeg' | 'png' | 'gif' | 'webp' | 'isobmff' | 'webm';
}

export const MEDIA_TYPES = {
  'image/jpeg': { kind: 'image', extensions: ['jpg', 'jpeg'], signature: 'jpeg' },
  'image/png': { kind: 'image', extensions: ['png'], signature: 'png' },
  'image/webp': { kind: 'image', extensions: ['webp'], signature: 'webp' },
  'image/gif': { kind: 'image', extensions: ['gif'], signature: 'gif' },
  'video/mp4': { kind: 'video', extensions: ['mp4', 'm4v'], signature: 'isobmff' },
  // MOV is stored and downloadable; in-page playback depends on the browser/codec.
  'video/quicktime': { kind: 'video', extensions: ['mov'], signature: 'isobmff' },
  'video/webm': { kind: 'video', extensions: ['webm'], signature: 'webm' },
} as const satisfies Record<string, MediaType>;

export type AllowedContentType = keyof typeof MEDIA_TYPES;

export function isAllowedContentType(value: unknown): value is AllowedContentType {
  return typeof value === 'string' && Object.hasOwn(MEDIA_TYPES, value);
}

export function mediaType(contentType: AllowedContentType): MediaType {
  return MEDIA_TYPES[contentType];
}
