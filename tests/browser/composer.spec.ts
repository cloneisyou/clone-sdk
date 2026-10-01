import { expect, test } from '@playwright/test';
import type { CompletionRequest } from '@clone-ai/tab-completion';

for (const assistant of [false, true]) {
  test.describe(assistant ? 'assistant-ui' : 'React textarea', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/?fixture=1' + (assistant ? '&assistant=1' : ''));
    });
    test('Tab inserts, Undo restores, explicit Enter sends once', async ({ page }) => {
      const input = page.getByRole('textbox', { name: 'Instruction' });
      await input.fill('이 장면을');
      await expect(page.locator('[data-clone-suggestion] span')).toHaveText(' 더 짧게 편집해줘.');
      await input.press('Tab');
      await expect(input).toHaveValue('이 장면을 더 짧게 편집해줘.');
      await expect(page.getByTestId('receipt-count')).toHaveText('0');
      await input.press('ControlOrMeta+z');
      await expect(input).toHaveValue('이 장면을');
      await expect(page.locator('[data-clone-suggestion] span')).not.toBeEmpty();
      await input.press('Tab');
      await input.press('Enter');
      await expect(page.getByTestId('receipt-count')).toHaveText('1');
      await expect(input).toHaveValue('');
    });
    test('empty next prompt, Escape, focus traversal and repeated Tab', async ({ page }) => {
      const input = page.getByRole('textbox', { name: 'Instruction' });
      await input.focus();
      await expect(page.locator('[data-clone-suggestion] span')).not.toBeEmpty();
      await input.press('Escape');
      await expect(page.locator('[data-clone-suggestion] span')).toBeEmpty();
      await input.press('Tab');
      await expect(input).not.toBeFocused();
      await input.fill('다음');
      await expect(page.locator('[data-clone-suggestion] span')).not.toBeEmpty();
      await input.press('Tab');
      await input.press('Tab');
      await expect(input).toHaveValue('다음 더 짧게 편집해줘.');
      await expect(page.getByTestId('receipt-count')).toHaveText('0');
    });
    test('composition, selected text and context change invalidate suggestions', async ({ page }) => {
      const input = page.getByRole('textbox', { name: 'Instruction' });
      await input.fill('편집');
      await expect(page.locator('[data-clone-suggestion] span')).not.toBeEmpty();
      await input.dispatchEvent('compositionstart', { data: '한' });
      await expect(page.locator('[data-clone-suggestion] span')).toBeEmpty();
      await input.dispatchEvent('keydown', { key: 'Tab', isComposing: true, keyCode: 229 });
      await expect(input).toHaveValue('편집');
      await input.dispatchEvent('compositionend', { data: '한' });
      await expect(page.locator('[data-clone-suggestion] span')).not.toBeEmpty();
      await input.press('Shift+ArrowLeft');
      await expect(page.locator('[data-clone-suggestion] span')).toBeEmpty();
      await page.getByRole('combobox', { name: 'Context' }).selectOption('slides');
      await input.focus(); await input.press('ArrowRight');
      await expect(page.locator('[data-clone-suggestion] span')).toHaveText(' 결론부터 정리해줘.');
      await input.press('Tab');
      await expect(input).toHaveValue('편집 결론부터 정리해줘.');
      await page.screenshot({ path: `test-results/${assistant ? 'assistant-ui' : 'react'}-slides.png`, fullPage: true });
    });
    test('records acceptance, human edit and explicit submission separately', async ({ page }) => {
      const input = page.getByRole('textbox', { name: 'Instruction' });
      const readEvents = async () => JSON.parse(await page.getByTestId('observation-events').textContent() ?? '[]');
      await input.fill('초안');
      await expect(page.locator('[data-clone-suggestion] span')).not.toBeEmpty();
      await input.press('Tab');
      expect((await readEvents()).map((event: { kind: string }) => event.kind)).toEqual(['presented', 'accepted']);
      await input.pressSequentially('!');
      await expect(input).toHaveValue('초안 더 짧게 편집해줘.!');
      await input.press('Enter');
      await expect(page.getByTestId('receipt-count')).toHaveText('1');
      const events = await readEvents();
      expect(events.map((event: { kind: string }) => event.kind)).toEqual(['presented', 'accepted', 'edited', 'submitted']);
      expect(new Set(events.map((event: { request_id: string }) => event.request_id)).size).toBe(1);
      expect(events.every((event: { delivery: string }) => event.delivery === 'fixture')).toBe(true);
      expect(JSON.stringify(events)).not.toContain('초안');
    });
    test('opted-in edited submission retains attribution and final text', async ({ page }) => {
      await page.getByText('Feedback loop · test fixture', { exact: true }).click();
      await page.getByRole('checkbox', { name: 'Share edited submission text (optional)' }).check();
      const input = page.getByRole('textbox', { name: 'Instruction' });
      await input.fill('초안');
      await expect(page.locator('[data-clone-suggestion] span')).not.toBeEmpty();
      await input.press('Tab'); await input.pressSequentially('!'); await input.press('Enter');
      await expect(page.getByTestId('receipt-count')).toHaveText('1');
      const events = JSON.parse(await page.getByTestId('observation-events').textContent() ?? '[]');
      expect(events.find((event: { kind: string }) => event.kind === 'submitted')).toMatchObject({
        submission_origin: 'edited_prediction', content_opt_in: true, final_text: '초안 더 짧게 편집해줘.!',
      });
    });
    test('explicit rejection and evaluation do not send the draft', async ({ page }) => {
      await page.getByText('Feedback loop · test fixture', { exact: true }).click();
      const input = page.getByRole('textbox', { name: 'Instruction' });
      await input.fill('초안');
      await expect(page.locator('[data-clone-suggestion] span')).not.toBeEmpty();
      await page.getByRole('button', { name: 'Reject: too long' }).click();
      await expect(page.getByTestId('receipt-count')).toHaveText('0');
      await page.getByRole('checkbox', { name: 'Share edited submission text (optional)' }).check();
      await page.getByRole('textbox', { name: 'Feedback guidance' }).fill('Use one sentence.');
      await page.getByRole('button', { name: 'Send feedback', exact: true }).click();
      const events = JSON.parse(await page.getByTestId('observation-events').textContent() ?? '[]');
      expect(events.find((event: { kind: string }) => event.kind === 'rejected')).toMatchObject({ reason: 'too_long' });
      expect(events.find((event: { kind: string }) => event.kind === 'feedback')).toMatchObject({
        guidance: 'Use one sentence.', content_opt_in: true,
      });
      await expect(page.getByTestId('receipt-count')).toHaveText('0');
    });
    test('does not attribute manual submission after Undo removes the completion', async ({ page }) => {
      const input = page.getByRole('textbox', { name: 'Instruction' });
      await input.fill('초안');
      await expect(page.locator('[data-clone-suggestion] span')).not.toBeEmpty();
      await input.press('Tab');
      await input.press('ControlOrMeta+z');
      await expect(input).toHaveValue('초안');
      await input.press('Enter');
      await expect(page.getByTestId('receipt-count')).toHaveText('1');
      const events = JSON.parse(await page.getByTestId('observation-events').textContent() ?? '[]');
      expect(events.some((event: { kind: string }) => event.kind === 'submitted')).toBe(false);
    });
    test('failed telemetry delivery does not block explicit host submission', async ({ page }) => {
      await page.route('**/api/clone/state', route => route.fulfill({ json: { connection_id: 'test-connection' } }));
      await page.route('**/api/clone/predict', async route => {
        const request = route.request().postDataJSON();
        await route.fulfill({ json: {
          request_id: request.request_id, prediction_id: 'test-prediction', connection_id: request.connection_id,
          session_id: request.session_id, draft_revision: request.draft.revision, context_revision: request.context_revision,
          profile_revision: 'fixture', grant_revision: 1, status: 'suggested', completion: ' suggestion',
          expires_at: Math.floor(Date.now() / 1000) + 60, context_truncated: false, usage: { prediction_units: 1 },
        } });
      });
      await page.route('**/api/clone/events', route => route.fulfill({ status: 503, json: { detail: { code: 'offline' } } }));
      await page.goto('/?connected=1' + (assistant ? '&assistant=1' : ''));
      const input = page.getByRole('textbox', { name: 'Instruction' });
      await expect(page.getByTestId('connection')).toHaveText('Connected');
      await input.fill('draft');
      await expect(page.locator('[data-clone-suggestion] span')).not.toBeEmpty();
      await input.press('Tab');
      await input.press('Enter');
      await expect(page.getByTestId('receipt-count')).toHaveText('1');
      await expect(input).toHaveValue('');
      await page.getByRole('combobox', { name: 'Context' }).focus();
      await expect.poll(async () => {
        const events = JSON.parse(await page.getByTestId('observation-events').textContent() ?? '[]');
        return events.filter((event: { delivery: string }) => event.delivery === 'failed').length;
      }).toBe(3);
    });
    test('next prediction receives submitted text, origin and a new conversation revision', async ({ page }) => {
      const requests: CompletionRequest[] = [];
      await page.route('**/api/clone/state', route => route.fulfill({ json: { connection_id: 'test-connection' } }));
      await page.route('**/api/clone/events', route => route.fulfill({ json: { status: 'recorded' } }));
      await page.route('**/api/clone/predict', async route => {
        const request = route.request().postDataJSON();
        requests.push(request);
        await route.fulfill({ json: {
          request_id: request.request_id, prediction_id: 'test-prediction', connection_id: request.connection_id,
          session_id: request.session_id, draft_revision: request.draft.revision, context_revision: request.context_revision,
          profile_revision: 'fixture', grant_revision: 1, status: 'suggested', completion: ' suggestion',
          expires_at: Math.floor(Date.now() / 1000) + 60, context_truncated: false, usage: { prediction_units: 1 },
        } });
      });
      await page.goto('/?connected=1' + (assistant ? '&assistant=1' : ''));
      await expect(page.getByTestId('connection')).toHaveText('Connected');
      const input = page.getByRole('textbox', { name: 'Instruction' });
      await input.fill('draft');
      await expect(page.locator('[data-clone-suggestion] span')).not.toBeEmpty();
      const before = requests.at(-1);
      await input.press('Tab');
      await input.pressSequentially(' edited');
      await expect(input).toHaveValue('draft suggestion edited');
      await input.press('Enter');
      await expect(page.getByTestId('receipt-count')).toHaveText('1');
      await input.fill('follow up');
      await expect.poll(() => requests.at(-1)?.draft.text).toBe('follow up');
      const after = requests.at(-1);
      if (!before?.artifact || !after?.artifact || !after.messages) {
        throw new Error('Expected prediction requests with artifact and conversation context');
      }
      expect(after.messages.at(-1)).toEqual({ role: 'user', content: 'draft suggestion edited', origin: 'edited_prediction' });
      expect(after.context_revision).not.toBe(before.context_revision);
      expect(after.artifact.revision).toBe(before.artifact.revision);
      expect(after.session_id).toBe(before.session_id);
      await input.fill('manual correction');
      await input.press('Enter');
      await expect(page.getByTestId('receipt-count')).toHaveText('2');
      await input.fill('another follow up');
      await expect.poll(() => requests.at(-1)?.draft.text).toBe('another follow up');
      expect(requests.at(-1)?.messages?.slice(-2)).toEqual([
        { role: 'user', content: 'draft suggestion edited', origin: 'edited_prediction' },
        { role: 'user', content: 'manual correction', origin: 'human' },
      ]);
    });
  });
}

for (const assistant of [false, true]) {
  test(`product context works before connecting and after disconnecting (${assistant ? 'assistant-ui' : 'React'})`, async ({ page }) => {
    let connection: string | null = null;
    const requests: CompletionRequest[] = [];
    await page.route('**/api/clone/state', route => route.fulfill({ json: { connection_id: connection } }));
    await page.route('**/api/clone/events', route => route.fulfill({ json: { status: 'recorded' } }));
    await page.route('**/api/clone/connect', () => { throw new Error('Basic mode must not initiate Clone login'); });
    await page.route('**/api/clone/disconnect', route => { connection = null; return route.fulfill({ json: { status: 'revoked' } }); });
    await page.route('**/api/clone/predict', route => {
      const request = route.request().postDataJSON(); requests.push(request);
      return route.fulfill({ json: { request_id: request.request_id, prediction_id: 'p-' + request.request_id,
        connection_id: request.connection_id ?? null, session_id: request.session_id,
        draft_revision: request.draft.revision, context_revision: request.context_revision,
        profile_revision: request.connection_id ? 'profile' : '', grant_revision: request.connection_id ? 1 : 0,
        status: 'suggested', completion: request.connection_id ? ' personalized' : ' product suggestion',
        expires_at: Math.floor(Date.now() / 1000) + 60, context_truncated: false, usage: { prediction_units: 1 } } });
    });
    await page.goto('/?connected=1' + (assistant ? '&assistant=1' : ''));
    const input = page.getByRole('textbox', { name: 'Instruction' });
    await input.focus();
    await expect(page.locator('[data-clone-suggestion] span')).toHaveText(' product suggestion');
    expect(requests.at(-1)?.mode).toBe('next_prompt');
    expect(requests.at(-1)?.connection_id).toBeNull();
    await input.fill('draft');
    await expect(page.locator('[data-clone-suggestion] span')).toHaveText(' product suggestion');
    await input.press('Tab');
    await expect(input).toHaveValue('draft product suggestion');
    await expect(page.getByTestId('receipt-count')).toHaveText('0');
    await input.press('Enter');
    await expect(page.getByTestId('receipt-count')).toHaveText('1');
    await page.getByText('Optional personalization', { exact: true }).click();
    connection = 'approved-test-grant';
    await page.getByRole('button', { name: 'Refresh connection' }).click();
    await input.fill('new draft');
    await expect(page.locator('[data-clone-suggestion] span')).toHaveText(' personalized');
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page.getByTestId('connection')).toHaveText('Product context');
    await expect(page.locator('[data-clone-suggestion] span')).toBeEmpty();
    await input.fill('after disconnect');
    await expect(page.locator('[data-clone-suggestion] span')).toHaveText(' product suggestion');
    expect(requests.at(-1)?.connection_id).toBeNull();
    await page.screenshot({ path: `test-results/optional-clone-${assistant ? 'assistant' : 'react'}.png`, fullPage: true });
  });
}
