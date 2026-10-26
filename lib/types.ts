export type Profile = {
  id: string;
  username: string;
  full_name: string;
  bio: string;
  avatar_url: string | null;
  cover_url: string | null;
  avatar_position_x?: number;
  avatar_position_y?: number;
  cover_position_x?: number;
  cover_position_y?: number;
  website: string | null;
  websites?: string[];
  country_code?: string | null;
  country_name?: string | null;
  country_flag?: string | null;
  city: string | null;
  updated_at?: string;
};

export type PostMedia = {
  id: string;
  post_id: string;
  media_type: 'image' | 'video' | 'audio';
  storage_path: string;
  mime_type?: string | null;
  original_filename?: string | null;
  byte_size?: number | null;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  position: number;
  url?: string | null;
};

export type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url'>;
};

export type Post = {
  id: string;
  author_id: string;
  body: string;
  visibility: 'public' | 'friends' | 'private';
  post_type?: 'post' | 'reel';
  group_id?: string | null;
  created_at: string;
  author?: Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url'>;
  media?: PostMedia[];
  reactions_count: number;
  comments: Comment[];
  reacted: boolean;
};

export type Story = {
  id: string;
  author_id: string;
  body: string;
  media_path?: string | null;
  media_type?: 'text' | 'image' | 'video';
  mime_type?: string | null;
  media_width?: number | null;
  media_height?: number | null;
  duration_seconds?: number | null;
  audio_path?: string | null;
  music_path?: string | null;
  music_title?: string | null;
  visibility: 'public' | 'friends';
  created_at: string;
  expires_at: string;
  author?: Pick<Profile, 'id' | 'username' | 'full_name' | 'avatar_url'>;
  media_url?: string | null;
  audio_url?: string | null;
  music_url?: string | null;
};

export function initials(name?: string | null): string {
  const text = (name || 'Jémor Space').trim();
  return text.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'JS';
}

export function timeAgo(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'à l’instant';
  if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)} h`;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(value));
}
