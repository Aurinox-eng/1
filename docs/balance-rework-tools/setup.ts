const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() };
(globalThis as any).window = { location: { search: '' }, addEventListener() {}, localStorage: (globalThis as any).localStorage, matchMedia: () => ({ matches: false, addEventListener() {} }) };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'ru-RU' }, configurable: true });
(globalThis as any).document = { documentElement: {}, createElement: () => ({}) };
(import.meta as any).env = { DEV: false, MODE: 'production' };
