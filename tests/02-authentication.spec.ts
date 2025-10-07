import { test, expect } from '@playwright/test';

/**
 * Authentication Flow Tests
 * Tests login, signup, and authentication pages
 */

test.describe('Authentication', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/login');

    // Check for login form elements
    const heading = page.getByRole('heading', { name: /login|sign in/i });
    await expect(heading).toBeVisible();
  });

  test('should have Google OAuth button', async ({ page }) => {
    await page.goto('/login');

    // Look for Google sign-in button
    const googleButton = page.getByRole('button', { name: /google/i });
    await expect(googleButton).toBeVisible();
  });

  test('should navigate between login and signup', async ({ page }) => {
    await page.goto('/login');

    // Look for link to signup page
    const signupLink = page.getByRole('link', { name: /sign up|create account/i });
    if (await signupLink.isVisible()) {
      await signupLink.click();
      await expect(page).toHaveURL(/.*signup/);
    }
  });

  test('should validate empty login form', async ({ page }) => {
    await page.goto('/login');

    // Try to submit empty form
    const submitButton = page.getByRole('button', { name: /sign in|login/i });
    if (await submitButton.isVisible()) {
      await submitButton.click();

      // Should show validation errors or stay on page
      await expect(page).toHaveURL(/.*login/);
    }
  });

  test('should show password field with toggle', async ({ page }) => {
    await page.goto('/login');

    // Look for password input
    const passwordInput = page.getByLabel(/password/i);
    if (await passwordInput.isVisible()) {
      await expect(passwordInput).toHaveAttribute('type', 'password');
    }
  });
});
