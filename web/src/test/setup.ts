import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Node 25 trae su propio localStorage global (experimental, sin métodos si no se arranca
// con --localstorage-file) y tapa el de jsdom. Se sustituye por uno en memoria.
class MemoryStorage implements Storage {
  #items = new Map<string, string>();

  get length() {
    return this.#items.size;
  }

  clear() {
    this.#items.clear();
  }

  getItem(key: string) {
    return this.#items.get(key) ?? null;
  }

  key(index: number) {
    return [...this.#items.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.#items.delete(key);
  }

  setItem(key: string, value: string) {
    this.#items.set(key, String(value));
  }
}

Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
