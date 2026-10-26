import type { SupabaseClient } from '@supabase/supabase-js';

export type MediaKind = 'image' | 'video' | 'audio' | 'file';
export type MediaDimensions = { width: number | null; height: number | null; durationSeconds: number | null };

export function mediaKind(file: File | Blob): MediaKind {
  const type = file.type || '';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

export function safeFileName(name: string): string {
  const base = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-100);
  return base || 'media.bin';
}

export async function inspectMedia(file: File | Blob): Promise<MediaDimensions> {
  const kind = mediaKind(file);
  if (kind === 'file') return { width: null, height: null, durationSeconds: null };
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const finish = (result: MediaDimensions) => { URL.revokeObjectURL(url); resolve(result); };
    if (kind === 'image') {
      const image = new Image();
      image.onload = () => finish({ width: image.naturalWidth || null, height: image.naturalHeight || null, durationSeconds: null });
      image.onerror = () => finish({ width: null, height: null, durationSeconds: null });
      image.src = url;
      return;
    }
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => finish({ width: video.videoWidth || null, height: video.videoHeight || null, durationSeconds: Number.isFinite(video.duration) ? video.duration : null });
    video.onerror = () => finish({ width: null, height: null, durationSeconds: null });
    video.src = url;
  });
}

export async function uploadMedia(
  supabase: SupabaseClient,
  bucket: string,
  userId: string,
  ownerId: string,
  file: File | Blob,
  prefix = 'media',
): Promise<string> {
  const name = file instanceof File ? file.name : `${prefix}.webm`;
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin';
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${ext || 'bin'}`;
  const path = `${userId}/${ownerId}/${fileName}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function signedMediaUrl(supabase: SupabaseClient, bucket: string, path?: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const ALLOWED_MEDIA_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/aac',
];
