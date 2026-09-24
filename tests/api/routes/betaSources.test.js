/**
 * The pilot's front door asks for what the ledger reads, and nothing else.
 * ======================================================================
 * Until 2026-09-25 /beta read "Join the beta. Your AI twin that acts for you." and asked
 * which of Spotify, Google Calendar, YouTube, Whoop, Discord, Gmail and GitHub you used.
 * Every one of them has answered 410 since the twin was parked (D20) and was deleted with it
 * (M2-B), so the first screen a person invited to the money pilot met was collecting
 * interest in things nobody could connect, and the welcome mail that arrived on sign-in told
 * them their digital twin was live and learning. These pin the vocabulary in both places.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');
const route = read('api/_app/routes/beta.js');
const page = read('src/pages/BetaSignupPage.tsx');
const mail = read('api/_app/services/emailService.js');

/* The eight the form used to offer. 'calendar' is deliberately absent: it is still a source,
   now meaning the class calendar rather than the twin's Google Calendar scope. */
const RETIRED = ['spotify', 'youtube', 'whoop', 'discord', 'gmail', 'github', 'instagram', 'outlook'];
const SOURCES = ['bank', 'phone_alerts', 'receipts', 'statements', 'calendar', 'whatsapp'];

describe('what /beta accepts', () => {
  it('accepts every source the ledger reads from', () => {
    for (const id of SOURCES) expect(route).toMatch(new RegExp(`'${id}'`));
  });

  it('accepts no retired OAuth platform', () => {
    const list = route.slice(route.indexOf('const VALID_PLATFORMS'), route.indexOf('const VALID_PHONES'));
    for (const id of RETIRED) expect(list).not.toMatch(new RegExp(`'${id}'`));
  });

  it('takes one phone, and only a real one', () => {
    expect(route).toMatch(/const VALID_PHONES = \['ios', 'android'\]/);
    /* Unanswered stays null: which phone a person carries is not something to guess. */
    expect(route).toMatch(/\? phone\.toLowerCase\(\) : null/);
  });

  it('stores the phone with the application', () => {
    const insert = route.slice(route.indexOf('insertApplication({'), route.indexOf("status: 'approved'"));
    expect(insert).toMatch(/phone: safePhone/);
  });
});

describe('what /beta says', () => {
  it('offers the six sources by name and no retired platform', () => {
    for (const id of SOURCES) expect(page).toMatch(new RegExp(`id: '${id}'`));
    for (const id of RETIRED) expect(page.slice(page.indexOf('const SOURCES'))).not.toMatch(new RegExp(`id: '${id}'`));
  });

  it('sells money, not a twin', () => {
    expect(page).toContain('Your money, read to you.');
    expect(page).not.toContain('Your AI twin that acts for you.');
    expect(page).not.toMatch(/Which platforms do you use\?/);
  });

  it('asks which phone, because it decides how a payment arrives at all', () => {
    expect(page).toContain('Which phone?');
    expect(page).toMatch(/id: 'ios'[\s\S]*id: 'android'/);
  });
});

describe('what the mail that meets a new person says', () => {
  const welcome = mail.slice(mail.indexOf('export async function sendWelcomeEmail'), mail.indexOf('export async function sendBetaInvite'));
  const invite = mail.slice(mail.indexOf('export async function sendBetaInvite'), mail.indexOf('export async function sendPlatformNudge'));

  it('the welcome mail names the money product and lands on its page', () => {
    expect(welcome).toContain('TwinMe Money');
    expect(welcome).toContain('${APP_URL}/money');
    expect(welcome).not.toMatch(/digital twin/i);
    expect(welcome).not.toMatch(/Spotify|YouTube|Gmail/);
  });

  it('the invite mail promises what the product does, and what it cannot do', () => {
    expect(invite).toContain('TwinMe Money');
    expect(invite).toMatch(/can never move money/);
    expect(invite).not.toMatch(/an AI twin that actually knows you|twin journey/);
  });
});
