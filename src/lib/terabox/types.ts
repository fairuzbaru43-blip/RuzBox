export type TeraboxFile = {
  fs_id: string | number;
  path: string;
  server_filename: string;
  size: number;
  isdir: number;
  category?: number;
  server_mtime?: number;
  local_mtime?: number;
  md5?: string;
  thumbs?: { url1?: string; url2?: string; url3?: string };
};

export type TokenBundle = { access_token: string; refresh_token: string; expires_at: number };
export type TeraboxConnection = TokenBundle & { api_domain: string; upload_domain: string; terabox_user_id?: string };
