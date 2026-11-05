import { request } from './client.ts';
import type { CreateUrlInput, MyUrl, ShortUrl } from './types.ts';

export function listMyUrls(token: string): Promise<MyUrl[]> {
  return request<MyUrl[]>('GET', '/urls/mine', { token });
}

export function createUrl(token: string, input: CreateUrlInput): Promise<ShortUrl> {
  return request<ShortUrl>('POST', '/urls', { token, body: input });
}
