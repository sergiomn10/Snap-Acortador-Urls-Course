import { request } from './client.ts';
import type { AuthResult, LoginInput, RegisterInput } from './types.ts';

export function register(input: RegisterInput): Promise<AuthResult> {
  return request<AuthResult>('POST', '/auth/register', { body: input });
}

export function login(input: LoginInput): Promise<AuthResult> {
  return request<AuthResult>('POST', '/auth/login', { body: input });
}
