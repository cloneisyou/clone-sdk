import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

for (const setting of ['reviewMs', 'requestTimeoutMs']) {
  test(`changing ${setting} retains the pending host send guard`, async ({ page }) => {
    await page.goto('/');
    await page.addScriptTag({ type: 'module', url: `/@fs/${resolve('tests/browser/clone-mode-options.tsx')}` });
    const fixture = page.getByRole('region', { name: 'Options fixture' });
    await fixture.getByRole('button', { name: 'Start fixture' }).click();
    await expect(fixture.getByTestId('fixture-status')).toContainText('submitting');
    await expect(fixture.getByTestId('fixture-receipts')).toHaveText('1');
    await fixture.getByRole('button', { name: `Change ${setting}`, exact: true }).click();
    await expect(fixture.getByTestId('fixture-status')).toHaveText('stopped: settings_changed');
    await fixture.getByRole('button', { name: 'Start fixture' }).click();
    await page.waitForTimeout(2100);
    await expect(fixture.getByTestId('fixture-receipts')).toHaveText('1');
    await expect(fixture.getByTestId('fixture-status')).toHaveText('stopped: settings_changed');
    await fixture.getByRole('button', { name: 'Settle host receipt' }).click();
    await fixture.getByRole('button', { name: 'Start fixture' }).click();
    await expect(fixture.getByTestId('fixture-receipts')).toHaveText('2');
  });

  test(`changing ${setting} cancels an unsent preview`, async ({ page }) => {
    await page.goto('/');
    await page.addScriptTag({ type: 'module', url: `/@fs/${resolve('tests/browser/clone-mode-options.tsx')}` });
    const fixture = page.getByRole('region', { name: 'Options fixture' });
    await fixture.getByRole('button', { name: 'Start fixture' }).click();
    await expect(fixture.getByTestId('fixture-status')).toContainText('reviewing');
    await fixture.getByRole('button', { name: `Change ${setting}`, exact: true }).click();
    await expect(fixture.getByTestId('fixture-status')).toHaveText('stopped: settings_changed');
    await page.waitForTimeout(2100);
    await expect(fixture.getByTestId('fixture-receipts')).toHaveText('0');
  });
}

test('Clone mode waits for a host completion, and Stop cancels the next preview', async ({ page }) => {
  await page.goto('/?clone-mode=1');
  await expect(page.getByRole('status')).toContainText('off');
  await page.getByRole('button', { name: 'Start Clone mode', exact: true }).click();
  await expect(page.getByTestId('clone-preview')).toHaveText('이 영상을 30초로 줄이고 핵심 장면부터 보여줘.');
  await expect(page.getByRole('heading', { name: 'Host send receipts: 0' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('waiting', { timeout: 6000 });
  await expect(page.getByRole('heading', { name: 'Host send receipts: 1' })).toBeVisible();
  await page.waitForTimeout(3300);
  await expect(page.getByRole('heading', { name: 'Host send receipts: 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Complete fixture agent turn' }).click();
  await expect(page.getByRole('status')).toContainText('reviewing');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByTestId('clone-preview')).toHaveCount(0);
  await page.waitForTimeout(3300);
  await expect(page.getByRole('heading', { name: 'Host send receipts: 1' })).toBeVisible();
});

test('typing cancels automatic sending; a hung prediction never blocks manual send', async ({ page }) => {
  await page.goto('/?clone-mode=1');
  await page.getByRole('button', { name: 'Start Clone mode', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('reviewing');
  const input = page.getByRole('textbox', { name: 'Instruction' });
  await input.fill('직접 수정');
  await expect(page.getByRole('status')).toContainText('user_input');
  await page.getByLabel('Prediction service').selectOption('pending');
  await input.fill('서버 장애 중에도 전송');
  await page.waitForTimeout(1700);
  await input.press('Enter');
  await expect(page.getByRole('heading', { name: 'Host send receipts: 1' })).toBeVisible();
  await expect(page.getByText('human: 서버 장애 중에도 전송')).toBeVisible();
  await expect(page.getByTestId('clone-preview')).toHaveCount(0);
});
