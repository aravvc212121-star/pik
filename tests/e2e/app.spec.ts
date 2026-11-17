/**
 * PicBeam E2E tests
 */
import { test, expect } from '@playwright/test';

test.describe('PicBeam App', () => {
  test('loads and shows Send tab by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Send' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Drop photos here')).toBeVisible();
  });

  test('switches to Receive tab', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Receive' }).click();
    await expect(page.getByRole('tab', { name: 'Receive' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText("Can't scan?")).toBeVisible();
  });

  test('opens and closes Private sheet', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Privacy settings' }).click();
    await expect(page.getByText('Private by design')).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByText('Private by design')).not.toBeVisible();
  });

  test('Private sheet has correct defaults', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Privacy settings' }).click();

    // Remove location data should be on by default
    const locationSwitch = page.getByRole('switch', { name: 'Remove location data' });
    await expect(locationSwitch).toHaveAttribute('aria-checked', 'true');

    // Hide IP should be off by default
    const ipSwitch = page.getByRole('switch', { name: 'Hide my IP address' });
    await expect(ipSwitch).toHaveAttribute('aria-checked', 'false');
  });

  test('code input accepts only 6 digits', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Receive' }).click();

    const input = page.getByLabel('6-digit connection code');
    await input.fill('123456');
    await expect(input).toHaveValue('123 456');
  });

  test('no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    
    const body = page.locator('body');
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('no third-party requests', async ({ page }) => {
    const thirdPartyRequests: string[] = [];
    
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (
        url.hostname !== 'localhost' &&
        !url.hostname.includes('127.0.0.1') &&
        !url.hostname.includes('stun.cloudflare.com')
      ) {
        thirdPartyRequests.push(request.url());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    expect(thirdPartyRequests).toEqual([]);
  });
});

test.describe('Responsive', () => {
  test('phone layout at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByText('Drop photos here')).toBeVisible();
  });

  test('desktop layout at 1280x800', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.getByText('Drop photos here')).toBeVisible();
  });
});
