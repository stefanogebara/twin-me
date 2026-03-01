import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjE2N2MyN2I1LWE0MGItNDlmYi04ZDAwLWRlYjFiMWM1N2Y0ZCIsImVtYWlsIjoic3RlZmFub2dlYmFyYUBnbWFpbC5jb20iLCJpYXQiOjE3NzIzNzM5MzYsImV4cCI6MTc3NDk2NTkzNn0.yuTHeAeRPaM0HEyxjBd5zfKtgSeBr9K-LSwRMRBqYxc';
const BASE = 'https://twin-ai-learn.vercel.app';
const SS_DIR = 'tests/e2e/screenshots/audit';

const PAGES = [
  { name: '01-landing',        path: '/',                 auth: false },
  { name: '02-auth',           path: '/auth',             auth: false },
  { name: '03-dashboard',      path: '/dashboard',        auth: true  },
  { name: '04-talk-to-twin',   path: '/talk-to-twin',     auth: true  },
  { name: '05-soul-signature', path: '/soul-signature',   auth: true  },
  { name: '06-identity',       path: '/identity',         auth: true  },
  { name: '07-goals',          path: '/goals',            auth: true  },
  { name: '08-brain',          path: '/brain',            auth: true  },
  { name: '09-journal',        path: '/journal',          auth: true  },
  { name: '10-get-started',    path: '/get-started',      auth: true  },
  { name: '11-settings',       path: '/settings',         auth: true  },
  { name: '12-interview',      path: '/interview',        auth: true  },
  { name: '13-eval',           path: '/eval',             auth: true  },
  { name: '14-discover',       path: '/discover',         auth: false },
];

test.describe('Full Platform Audit', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });
  });

  for (const page of PAGES) {
    test(`${page.name} — ${page.path}`, async ({ page: pw }) => {
      if (page.auth) {
        await pw.goto(BASE);
        await pw.evaluate((t) => localStorage.setItem('auth_token', t), TOKEN);
      }

      await pw.goto(`${BASE}${page.path}`);
      await pw.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

      // Collect console errors
      const errors: string[] = [];
      pw.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      // Full-page screenshot
      await pw.screenshot({
        path: `${SS_DIR}/${page.name}.png`,
        fullPage: true,
      });

      // Also get page text for analysis
      const bodyText = await pw.evaluate(() => document.body.innerText);
      fs.writeFileSync(`${SS_DIR}/${page.name}.txt`, bodyText.slice(0, 5000));

      // Basic smoke — page shouldn't be blank
      const textLen = bodyText.trim().length;
      if (textLen < 50) {
        console.warn(`[WARN] ${page.name} body text very short (${textLen} chars)`);
      }

      console.log(`[OK] ${page.name} — ${textLen} chars of body text`);
    });
  }
});
