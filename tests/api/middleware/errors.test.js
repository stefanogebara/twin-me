import { describe, it, expect } from 'vitest';
import {
  PlatformError,
  PlatformNotConnectedError,
  PlatformTokenExpiredError,
  PlatformAPIError,
  InsufficientDataError,
  ValidationError,
  UserNotFoundError,
  RateLimitError,
  asyncHandler,
} from '../../../api/middleware/errors.js';

describe('PlatformError', () => {
  it('sets name, message, statusCode, and details', () => {
    const err = new PlatformError('test message', 400, { foo: 'bar' });
    expect(err.name).toBe('PlatformError');
    expect(err.message).toBe('test message');
    expect(err.statusCode).toBe(400);
    expect(err.details).toEqual({ foo: 'bar' });
  });

  it('defaults statusCode to 500', () => {
    const err = new PlatformError('oops');
    expect(err.statusCode).toBe(500);
  });

  it('toJSON returns structured envelope', () => {
    const err = new PlatformError('bad', 503, { retry: true });
    const json = err.toJSON();
    expect(json.success).toBe(false);
    expect(json.error).toBe('bad');
    expect(json.errorType).toBe('PlatformError');
    expect(json.statusCode).toBe(503);
    expect(json.details).toEqual({ retry: true });
    expect(json.timestamp).toBeDefined();
  });

  it('is an instance of Error', () => {
    expect(new PlatformError('x')).toBeInstanceOf(Error);
  });
});

describe('PlatformNotConnectedError', () => {
  it('produces a 404 with connect action', () => {
    const err = new PlatformNotConnectedError('spotify', 'user-1');
    expect(err.statusCode).toBe(404);
    expect(err.details.platform).toBe('spotify');
    expect(err.details.userId).toBe('user-1');
    expect(err.details.action).toBe('connect_platform');
    expect(err.details.connectUrl).toContain('spotify');
  });
});

describe('PlatformTokenExpiredError', () => {
  it('produces a 401 with reconnect action', () => {
    const err = new PlatformTokenExpiredError('google', 'user-2');
    expect(err.statusCode).toBe(401);
    expect(err.details.action).toBe('reconnect_platform');
    expect(err.details.platform).toBe('google');
  });
});

describe('PlatformAPIError', () => {
  it('wraps the api error message', () => {
    const err = new PlatformAPIError('twitch', 'Rate limited', 429);
    expect(err.statusCode).toBe(429);
    expect(err.message).toContain('twitch');
    expect(err.message).toContain('Rate limited');
    expect(err.details.platform).toBe('twitch');
    expect(err.details.apiError).toBe('Rate limited');
  });
});

describe('InsufficientDataError', () => {
  it('includes min and current counts', () => {
    const err = new InsufficientDataError('whoop', 10, 3);
    expect(err.statusCode).toBe(400);
    expect(err.details.minRequired).toBe(10);
    expect(err.details.currentCount).toBe(3);
    expect(err.message).toContain('10');
    expect(err.message).toContain('3');
  });
});

describe('ValidationError', () => {
  it('wraps single error string in array', () => {
    const err = new ValidationError('Field is required');
    expect(err.statusCode).toBe(400);
    expect(err.details.errors).toEqual(['Field is required']);
  });

  it('accepts pre-formed array', () => {
    const err = new ValidationError(['err1', 'err2']);
    expect(err.details.errors).toHaveLength(2);
  });
});

describe('UserNotFoundError', () => {
  it('includes userId in details', () => {
    const err = new UserNotFoundError('abc-123');
    expect(err.statusCode).toBe(404);
    expect(err.details.userId).toBe('abc-123');
  });
});

describe('RateLimitError', () => {
  it('includes platform and retryAfter', () => {
    const err = new RateLimitError('spotify', 60);
    expect(err.statusCode).toBe(429);
    expect(err.details.platform).toBe('spotify');
    expect(err.details.retryAfter).toBe(60);
  });
});

describe('asyncHandler', () => {
  it('calls next with error when async fn rejects', async () => {
    const boom = new Error('async fail');
    const fn = async () => { throw boom; };
    const wrapped = asyncHandler(fn);

    const next = vi.fn();
    await wrapped({}, {}, next);
    expect(next).toHaveBeenCalledWith(boom);
  });

  it('does not call next when fn resolves', async () => {
    const fn = async (_req, res) => { res.sent = true; };
    const wrapped = asyncHandler(fn);

    const res = {};
    const next = vi.fn();
    await wrapped({}, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.sent).toBe(true);
  });
});
