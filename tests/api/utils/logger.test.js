/**
 * Tests for api/utils/logger.js
 * Pure utility — no DB or LLM dependencies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture NODE_ENV before import so we can reset
const originalEnv = process.env.NODE_ENV;
const originalLogLevel = process.env.LOG_LEVEL;

describe('createLogger', () => {
  let createLogger;

  beforeEach(async () => {
    vi.resetModules();
    // Default to development for tests
    process.env.NODE_ENV = 'development';
    process.env.LOG_LEVEL = 'debug';
    const mod = await import('../../../api/utils/logger.js');
    createLogger = mod.createLogger;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.LOG_LEVEL = originalLogLevel;
    vi.restoreAllMocks();
  });

  it('returns an object with debug, info, warn, error methods', () => {
    const log = createLogger('TestService');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('calls console.log for info-level messages', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = createLogger('MyService');
    log.info('hello');
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0];
    expect(output).toContain('MyService');
    expect(output).toContain('hello');
  });

  it('calls console.error for error-level messages', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = createLogger('ErrorTest');
    log.error('something broke');
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0];
    expect(output).toContain('ErrorTest');
    expect(output).toContain('something broke');
  });

  it('calls console.warn for warn-level messages', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = createLogger('WarnTest');
    log.warn('caution');
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0];
    expect(output).toContain('caution');
  });

  it('includes context object in output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = createLogger('CtxTest');
    log.info('request', { userId: 'abc', durationMs: 42 });
    const output = spy.mock.calls[0][0];
    expect(output).toContain('userId');
    expect(output).toContain('abc');
  });

  it('serializes Error objects in context', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = createLogger('ErrCtx');
    const err = new Error('test failure');
    err.code = 'ERR_TEST';
    log.error('failed', { error: err });
    const output = spy.mock.calls[0][0];
    expect(output).toContain('test failure');
    expect(output).toContain('ERR_TEST');
  });

  it('handles missing context gracefully', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = createLogger('NoCtx');
    log.info('no context');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('createLogger — production mode', () => {
  let createLogger;

  beforeEach(async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'debug';
    const mod = await import('../../../api/utils/logger.js');
    createLogger = mod.createLogger;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.LOG_LEVEL = originalLogLevel;
    vi.restoreAllMocks();
  });

  it('outputs valid JSON in production', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = createLogger('ProdTest');
    log.info('json test', { key: 'value' });
    const output = spy.mock.calls[0][0];
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe('info');
    expect(parsed.service).toBe('ProdTest');
    expect(parsed.msg).toBe('json test');
    expect(parsed.key).toBe('value');
    expect(parsed.ts).toBeDefined();
  });

  it('omits stack traces in production error logs', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = createLogger('ProdErr');
    const err = new Error('prod fail');
    log.error('crashed', { error: err });
    const parsed = JSON.parse(spy.mock.calls[0][0]);
    expect(parsed.error.message).toBe('prod fail');
    expect(parsed.error.stack).toBeUndefined();
  });
});

describe('createLogger — log level filtering', () => {
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.LOG_LEVEL = originalLogLevel;
    vi.restoreAllMocks();
  });

  it('suppresses debug when LOG_LEVEL=info', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'development';
    process.env.LOG_LEVEL = 'info';
    const { createLogger } = await import('../../../api/utils/logger.js');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = createLogger('FilterTest');
    log.debug('should not appear');
    expect(spy).not.toHaveBeenCalled();
  });

  it('still outputs error when LOG_LEVEL=error', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'development';
    process.env.LOG_LEVEL = 'error';
    const { createLogger } = await import('../../../api/utils/logger.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = createLogger('ErrorOnly');
    log.debug('nope');
    log.info('nope');
    log.warn('nope');
    log.error('yes');
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledTimes(1);
  });
});

describe('requestLogger middleware', () => {
  let requestLogger;

  beforeEach(async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'development';
    process.env.LOG_LEVEL = 'debug';
    const mod = await import('../../../api/utils/logger.js');
    requestLogger = mod.requestLogger;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.LOG_LEVEL = originalLogLevel;
    vi.restoreAllMocks();
  });

  it('returns a middleware function', () => {
    const mw = requestLogger();
    expect(typeof mw).toBe('function');
    expect(mw.length).toBe(3); // (req, res, next)
  });

  it('calls next immediately', () => {
    const mw = requestLogger();
    const next = vi.fn();
    const req = { method: 'GET', originalUrl: '/test', ip: '127.0.0.1' };
    const res = { on: vi.fn() };
    mw(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('logs on response finish', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mw = requestLogger();
    const next = vi.fn();
    const req = { method: 'GET', originalUrl: '/api/test', ip: '127.0.0.1' };

    // Capture the 'finish' callback
    let finishCb;
    const res = {
      statusCode: 200,
      on: vi.fn((event, cb) => { if (event === 'finish') finishCb = cb; }),
    };

    mw(req, res, next);
    expect(finishCb).toBeDefined();

    // Simulate response finishing
    finishCb();
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0];
    expect(output).toContain('GET');
    expect(output).toContain('/api/test');
    expect(output).toContain('200');
  });
});
