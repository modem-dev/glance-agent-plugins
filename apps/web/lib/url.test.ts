import { beforeEach, describe, expect, it, vi } from 'vitest';

const headerState = vi.hoisted(() => ({
  values: new Map<string, string>(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get(key: string) {
      return headerState.values.get(key) ?? null;
    },
  })),
}));

import { getBaseUrl } from './url';

describe('getBaseUrl', () => {
  beforeEach(() => {
    headerState.values.clear();
  });

  it('returns empty string without host headers', async () => {
    await expect(getBaseUrl()).resolves.toBe('');
  });

  it('prefers forwarded host + proto and strips www', async () => {
    headerState.values.set('x-forwarded-host', 'www.glance.sh');
    headerState.values.set('x-forwarded-proto', 'https');

    await expect(getBaseUrl()).resolves.toBe('https://glance.sh');
  });

  it('uses http for localhost when proto missing', async () => {
    headerState.values.set('host', 'localhost:3000');

    await expect(getBaseUrl()).resolves.toBe('http://localhost:3000');
  });

  it('uses https for non-local hosts when proto missing', async () => {
    headerState.values.set('host', 'glance.sh');

    await expect(getBaseUrl()).resolves.toBe('https://glance.sh');
  });
});
