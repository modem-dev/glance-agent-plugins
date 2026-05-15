import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function clearConfigEnv() {
  delete process.env.GLANCE_TTL_MINUTES;
  delete process.env.GLANCE_MAX_UPLOAD_MB;
  delete process.env.GLANCE_UPLOAD_TOKEN_TTL_SECONDS;
  delete process.env.GLANCE_CLEANUP_BATCH_SIZE;
  delete process.env.AGENTPASTE_TTL_MINUTES;
  delete process.env.AGENTPASTE_MAX_UPLOAD_MB;
  delete process.env.AGENTPASTE_UPLOAD_TOKEN_TTL_SECONDS;
  delete process.env.AGENTPASTE_CLEANUP_BATCH_SIZE;
}

async function loadConfig() {
  vi.resetModules();
  return import('./config');
}

describe('config env parsing', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    clearConfigEnv();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('falls back for non-numeric env values', async () => {
    process.env.GLANCE_TTL_MINUTES = 'abc';
    process.env.GLANCE_MAX_UPLOAD_MB = 'NaN';

    const config = await loadConfig();

    expect(config.SHARE_TTL_MINUTES).toBe(30);
    expect(config.MAX_UPLOAD_MB).toBe(15);
  });

  it('clamps values to configured minimums', async () => {
    process.env.GLANCE_TTL_MINUTES = '1';
    process.env.GLANCE_MAX_UPLOAD_MB = '0';
    process.env.GLANCE_UPLOAD_TOKEN_TTL_SECONDS = '1';
    process.env.GLANCE_CLEANUP_BATCH_SIZE = '0';

    const config = await loadConfig();

    expect(config.SHARE_TTL_MINUTES).toBe(5);
    expect(config.MAX_UPLOAD_MB).toBe(1);
    expect(config.UPLOAD_TOKEN_TTL_MS).toBe(60_000);
    expect(config.CLEANUP_BATCH_SIZE).toBe(1);
  });

  it('clamps values to configured maximums', async () => {
    process.env.GLANCE_TTL_MINUTES = '99999';
    process.env.GLANCE_MAX_UPLOAD_MB = '999';
    process.env.GLANCE_UPLOAD_TOKEN_TTL_SECONDS = '99999';
    process.env.GLANCE_CLEANUP_BATCH_SIZE = '99999';

    const config = await loadConfig();

    expect(config.SHARE_TTL_MINUTES).toBe(1440);
    expect(config.MAX_UPLOAD_MB).toBe(64);
    expect(config.UPLOAD_TOKEN_TTL_MS).toBe(3_600_000);
    expect(config.CLEANUP_BATCH_SIZE).toBe(1000);
  });

  it('renders hour TTL labels when divisible by 60', async () => {
    process.env.GLANCE_TTL_MINUTES = '120';

    const config = await loadConfig();

    expect(config.SHARE_TTL_LABEL).toBe('2h');
  });

  it('keeps AGENTPASTE env names as compatibility fallbacks', async () => {
    process.env.AGENTPASTE_TTL_MINUTES = '60';
    process.env.AGENTPASTE_MAX_UPLOAD_MB = '20';

    const config = await loadConfig();

    expect(config.SHARE_TTL_MINUTES).toBe(60);
    expect(config.MAX_UPLOAD_MB).toBe(20);
  });

  it('prefers GLANCE env names over legacy AGENTPASTE names', async () => {
    process.env.GLANCE_TTL_MINUTES = '45';
    process.env.AGENTPASTE_TTL_MINUTES = '60';

    const config = await loadConfig();

    expect(config.SHARE_TTL_MINUTES).toBe(45);
  });
});
