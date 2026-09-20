/**
 * What the sign-in routes accept (M1-2, legacy slice, 2026-09-20). The handlers keep their own
 * required-field checks and messages ("Valid email is required"), which the sign-in page
 * shows; these schemas bound what may arrive at all: a type, a length, nothing more. A
 * 10 KB "email" is a 400 before any handler reads it.
 */
import { z } from 'zod';

const loose = (shape) => z.object(shape).passthrough();
const text = (max) => z.string().max(max).optional().nullable();

export const SIGNUP = loose({ email: text(254), password: text(1024), firstName: text(100), lastName: text(100), inviteCode: text(64), client: text(32) });
export const SIGNIN = loose({ email: text(254), password: text(1024), client: text(32) });
export const REFRESH = loose({ refreshToken: text(4096) });
export const MAGIC_LINK = loose({ email: text(254), inviteCode: text(64), redirect: text(500) });
export const LOGOUT = loose({ refreshToken: text(4096) });
export const OAUTH_CALLBACK = loose({ code: text(4096), state: text(8192), provider: text(32), inviteCode: text(64) });
