/**
 * enrichment/holeheProvider.js — shell-free subprocess invocation.
 *
 * Audit 2026-07-04 (defense-in-depth): discoverPlatforms() shells out to the
 * `holehe` OSINT tool with a user-supplied email. It was `exec('holehe ' +
 * email + ' ...')` (a shell string). The safeEmail sanitizer already stripped
 * shell metacharacters, so there was no live injection — but the shell was
 * unnecessary. This pins the hardened form:
 *   - execFile (no shell) is used, and
 *   - the email is passed as a DISCRETE argv entry, never concatenated into a
 *     command string.
 * The sanitizer is kept as belt-and-suspenders and is asserted too.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:child_process so execFile is a spy we can inspect. Implement it in
// Node's callback style (file, args, options, cb) so the module's real
// promisify(execFile) resolves normally to { stdout }.
const execFileMock = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args) => execFileMock(...args),
}));

vi.mock('../../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { discoverPlatforms } = await import(
  '../../../api/services/enrichment/holeheProvider.js'
);

/** Make execFileMock succeed on the FIRST (CLI) call with the given stdout. */
function cliSucceeds(stdout) {
  execFileMock.mockImplementationOnce((_file, _args, _opts, cb) => {
    cb(null, { stdout, stderr: '' });
  });
}

describe('holeheProvider discoverPlatforms — execFile invocation', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns [] for empty email without spawning anything', async () => {
    const out = await discoverPlatforms('');
    expect(out).toEqual([]);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('calls execFile with the binary + an ARGV ARRAY (no shell string)', async () => {
    cliSucceeds('[+] amazon.com\n[+] spotify.com\n');
    await discoverPlatforms('alice@example.com');

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [file, args, options] = execFileMock.mock.calls[0];

    // Binary is a bare command name — NOT "holehe alice@... --only-used ...".
    expect(file).toBe('holehe');
    expect(file).not.toContain(' ');

    // Args is a real array; email is ONE discrete element, flags are separate.
    expect(Array.isArray(args)).toBe(true);
    expect(args).toEqual(['alice@example.com', '--only-used', '--no-color']);

    // Options preserved (the 30s timeout).
    expect(options).toMatchObject({ timeout: 30000 });
  });

  it('parses holehe stdout unchanged (found platforms normalized)', async () => {
    cliSucceeds('[+] amazon.com\n[+] en.gravatar.com\n[-] github.com\n[+] spotify.com\n');
    const out = await discoverPlatforms('bob@example.com');
    // amazon.com → amazon, en.gravatar.com → gravatar, spotify.com → spotify.
    expect(out).toEqual(['amazon', 'gravatar', 'spotify']);
  });

  it('falls back to `python -m holehe` as an argv array when the CLI errors', async () => {
    // First (CLI) call throws — module catches and tries the python fallback.
    execFileMock
      .mockImplementationOnce((_file, _args, _opts, cb) => cb(new Error('holehe: not found')))
      .mockImplementationOnce((_file, _args, _opts, cb) => cb(null, { stdout: '[+] reddit.com\n', stderr: '' }));

    const out = await discoverPlatforms('carol@example.com');
    expect(out).toEqual(['reddit']);

    expect(execFileMock).toHaveBeenCalledTimes(2);
    const [file2, args2] = execFileMock.mock.calls[1];
    expect(file2).toBe('python');
    expect(Array.isArray(args2)).toBe(true);
    // "-m holehe" are separate argv items; email stays a discrete element.
    expect(args2).toEqual(['-m', 'holehe', 'carol@example.com', '--only-used', '--no-color']);
  });

  it('sanitizes shell metacharacters OUT of the email before it reaches the arg', async () => {
    let capturedEmailArg;
    execFileMock.mockImplementationOnce((_file, args, _opts, cb) => {
      capturedEmailArg = args[0];
      cb(null, { stdout: '', stderr: '' });
    });

    // Classic injection payload. The sanitizer keeps only [A-Za-z0-9@._+-], so
    // every shell metacharacter (; $ ( ) | & ` / # < > \ ' " * and whitespace)
    // is stripped. (Bare alphanumerics/hyphens like the letters in "rm -rf"
    // survive as inert characters — harmless because no shell ever sees them.)
    await discoverPlatforms('a@b.com; rm -rf / #$(whoami)`id` && curl x|sh');

    // No shell metacharacter or whitespace survives into the argv entry.
    expect(capturedEmailArg).not.toMatch(/[;$()|&`/#<>\\'"*\s]/);
    // The legitimate email prefix is preserved intact.
    expect(capturedEmailArg.startsWith('a@b.com')).toBe(true);
  });

  it('leaves a legitimate email with + and . addressing untouched', async () => {
    let capturedEmailArg;
    execFileMock.mockImplementationOnce((_file, args, _opts, cb) => {
      capturedEmailArg = args[0];
      cb(null, { stdout: '', stderr: '' });
    });
    await discoverPlatforms('First.Last+tag@sub.example.co.uk');
    expect(capturedEmailArg).toBe('First.Last+tag@sub.example.co.uk');
  });

  it('returns [] gracefully when both CLI and python fallback fail', async () => {
    execFileMock
      .mockImplementationOnce((_file, _args, _opts, cb) => cb(new Error('holehe missing')))
      .mockImplementationOnce((_file, _args, _opts, cb) => cb(new Error('python missing')));

    const out = await discoverPlatforms('dave@example.com');
    expect(out).toEqual([]);
    expect(execFileMock).toHaveBeenCalledTimes(2);
  });
});
