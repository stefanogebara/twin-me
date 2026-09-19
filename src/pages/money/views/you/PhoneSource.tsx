/**
 * Your phone as a source: the key, and the three ways to wire it.
 * The page was one 1,200-line component; since 2026-09-19 (M2-2) the reads and actions live in
 * useMoneyAccount and each view is its own file. The words on the page did not move.
 */

import { useState } from 'react';
import { Smartphone } from 'lucide-react';
import Chevron from '../../Chevron';
import { APK_URL } from '@/lib/downloads';
import type { MoneyAccount } from '../../useMoneyAccount';

export default function PhoneSource({ m }: { m: MoneyAccount }) {
  const { t, busy, makeKey } = m;
  const key = m.captureKey;
  /* Which phone recipe is open: the app on Android, the Shortcut on iPhone, or the raw
     request for anyone wiring their own tool. */
  const [openHow, setOpenHow] = useState<'android' | 'iphone' | 'other' | null>(null);
  return (
              <li>
                <div className="mv-item mv-item--icon">
                  <span className="mv-icon" aria-hidden="true"><Smartphone size={16} /></span>
                  <span className="mv-item-text">
                    <span className="mv-item-title">{t('Your phone')}</span>
                    <span className="mv-item-sub">{t('Use the updated app or Shortcut.')}</span>
                  </span>
                  <span className="mv-item-end">
                    {key ? null : <button type="button" className="mv-pill mv-pill--ghost" onClick={makeKey} disabled={busy === 'key'}>{t('Make a key')}</button>}
                  </span>
                </div>
                <p className="mv-body mv-body--icon mv-quiet">{t('Undated notifications are kept for review, outside your spending.')}</p>
                {key ? (
                  <div className="mv-body mv-body--icon">
                    <code className="mv-code">{key}</code>
                    <p className="mv-quiet">{t('Shown once. The iPhone shortcut asks for it; the Android app makes its own.')}</p>
                  </div>
                ) : null}
                <ul className="mv-sublist">
                  {/* Android reads the bank's own notifications, which is one switch and then
                      nothing to think about. iPhone cannot: no app may read another app's
                      notifications, so it is a Shortcut on Apple Pay. The two are not equal and
                      the page says so rather than implying they are. */}
                  <li>
                    <button type="button" className="mv-item mv-item--sub" aria-expanded={openHow === 'android'} onClick={() => setOpenHow((o) => (o === 'android' ? null : 'android'))}>
                      <span className="mv-item-text">
                        <span className="mv-item-title">{t('Android: the TwinMe app')}</span>
                        <span className="mv-item-sub">{t('It reads your bank app and sends each payment on.')}</span>
                      </span>
                      <span className="mv-item-end"><Chevron /></span>
                    </button>
                    {openHow === 'android' ? (
                      <ol className="mv-steps">
                        <li>
                          {APK_URL
                            ? <a className="mv-link" href={APK_URL}>{t('Download the app')}</a>
                            : t('The app is not out yet; ask for it and it comes by email.')}
                        </li>
                        <li>{t('Open it and sign in with this email.')}</li>
                        <li>{t('Allow notification access when it asks. Android shows a long list; TwinMe is in it.')}</li>
                        <li>{t('Nothing else. Each bank alert is read and sent, and it keeps any it could not send.')}</li>
                      </ol>
                    ) : null}
                  </li>
                  <li>
                    <button type="button" className="mv-item mv-item--sub" aria-expanded={openHow === 'iphone'} onClick={() => setOpenHow((o) => (o === 'iphone' ? null : 'iphone'))}>
                      <span className="mv-item-text">
                        <span className="mv-item-title">{t('iPhone: a Shortcut')}</span>
                        <span className="mv-item-sub">{t('Apple Pay only. No app on iPhone may read notifications.')}</span>
                      </span>
                      <span className="mv-item-end"><Chevron /></span>
                    </button>
                    {openHow === 'iphone' ? (
                      <ol className="mv-steps">
                        <li>{t('Make a key above and copy it.')}</li>
                        <li><a className="mv-link" href="/downloads/TwinMe-payments.shortcut">{t('Add the shortcut')}</a>{t(', and paste the key when it asks.')}</li>
                        <li>{t('Open Shortcuts, tap Automation at the bottom, then New Automation. Search for Wallet, the one that says when I tap a Wallet card or pass.')}</li>
                        <li>{t('Pick your card, choose Run Immediately, and tap Next.')}</li>
                        <li>{t('Choose the TwinMe payments shortcut. The first time it runs, tap Allow.')}</li>
                      </ol>
                    ) : null}
                  </li>
                  <li>
                    <button type="button" className="mv-item mv-item--sub" aria-expanded={openHow === 'other'} onClick={() => setOpenHow((o) => (o === 'other' ? null : 'other'))}>
                      <span className="mv-item-text"><span className="mv-item-title">{t('Any other tool')}</span></span>
                      <span className="mv-item-end"><Chevron /></span>
                    </button>
                    {openHow === 'other' ? (
                      <ol className="mv-steps">
                        <li>
                          {/* The sentence is one line in the dictionary; its three holes are code, so the
                              translated line is split on them and each hole rendered as <code>. */}
                          {t('Action: HTTP request, POST to {url}, header {header} with the key, body {body}.').split(/(\{url\}|\{header\}|\{body\})/).map((piece, i) => (
                            piece === '{url}' ? <code key={i}>{`${window.location.origin}/api/money/capture`}</code>
                            : piece === '{header}' ? <code key={i}>X-TwinMe-Key</code>
                            : piece === '{body}' ? <code key={i}>{'{"text": "[notification]", "receivedAt": "[original ISO date]"}'}</code>
                            : piece
                          ))}
                        </li>
                        <li>{t('Bizum and SMS alerts work the same way. They are read in Spanish: amount, shop, card, and whether it went out or came in.')}</li>
                      </ol>
                    ) : null}
                  </li>
                </ul>
              </li>
  );
}
