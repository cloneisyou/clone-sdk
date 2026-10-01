# Feedback loop

SDK 0.6.1 adds `FeedbackTracker`, bounded event delivery, explicit rejection/evaluation/task outcomes, and clearing. These features require the API feedback deployment. Older clients and their five observation kinds remain supported. Missing or failed delivery is unknown, not negative feedback.

## Host integration

```ts
import { FeedbackTracker, createEventTransport } from '@clone-ai/tab-completion';

const feedback = new FeedbackTracker(createEventTransport('/api/clone/events'), {
  collectSubmittedText: false, // default: no submitted text collection
  onDelivery: receipt => diagnostics.record(receipt), // content-free
});
// Supply onEvent to the composer component/controller.
const onEvent = event => feedback.observe(event, composer.value);
// Observe SDK insertion and later human input changes.
composer.addEventListener('input', () => feedback.input(composer.value));
// Call only AFTER the existing host send succeeds.
function onHostSendSucceeded(text) {
  const origin = feedback.submitted(text);
  conversation.append({ role: 'user', content: text, origin });
}
```

The authenticated host route calls `clone.recordEvent(session.user.id, body)`; Python uses `client.record_event(session.user.id, body)`. The server supplies the subject, never the browser body. Keep app keys on the server. Installing a package cannot connect your authentication, send or task-result callbacks automatically; wire these once in the host.

Call `feedback.reset()` on logout/account/thread/connection changes before rebinding context. Old-scope delivery is aborted and local attribution cleared. Undo back to the original draft or clearing removes attribution without calling it quality rejection. Submission and collection must never trigger a send.

## Explicit feedback

```ts
feedback.rejected(requestId, { reason: 'too_long' });
feedback.feedback(requestId, { rating: 'positive' });
// Only when the host has opted into content collection for this user:
feedback.feedback(requestId, {
  rating: 'negative', guidance: 'Keep it to one short sentence.', content_opt_in: true,
});
feedback.outcome(requestId, 'succeeded'); // the host must observe the actual task result
```

Kinds: `presented`, `accepted`, `edited`, `dismissed`, `submitted`, `rejected`, `feedback`, `outcome`. Presented means offered, not read; accepted means inserted, not sent. Escape/blur/expiry/silence is not explicit rejection. Sending is not task success. Automatic prompts are agent-origin, not manual acceptance or independently human-written preferences.

Ratings: `positive`, `negative`. Reasons: `too_long`, `too_short`, `wrong_intent`, `wrong_language`, `incorrect`, `other`. Guidance has a 1,000-character limit and requires `content_opt_in: true`. With `collectSubmittedText: true`, the tracker sends `final_text` only after an edited prediction-assisted draft is successfully sent. The API limits it to 4,000 characters. It never uploads per-character text, an unfinished edit or unchanged generated text. The API validates field/kind combinations.

## Server memory and forgetting

Only explicit evaluations/rejections and opted-in edited successful submissions enter encrypted memory. Behavior counts and host-reported outcomes are separate observations, not automatic preference labels. At most six recent records from the same app/user/connection grant enter the next new prediction. Basic and connected evidence stay separate. Current input, conversation and supplied preferences get the token envelope first. Feedback is untrusted evidence; edited submissions are past-task examples, not permanent preferences. No cross-customer pooling or model-weight training occurs.

The response's `feedback_revision` identifies the records actually injected; empty means none. `feedback_enabled: false` omits feedback for a baseline/control. Replay retains its original response and revision. Memory expires after 30 days, with at most 50 records per app/user and hourly expiry cleanup.

```ts
await clone.clearFeedback(session.user.id); // authenticated host server
```

```python
client.clear_feedback(authenticated_user_id)  # or await the async client
```

Clearing removes evidence and advances a user-scoped fence. Late old-prediction events cannot restore it. Replays and in-flight results that used cleared evidence are rejected. Content-free behavior receipts and billing remain intact; feedback does not generate or reverse a billable prediction.

## Delivery and validation

The browser transport has a two-second deadline per attempt and at most four concurrent deliveries. Network/429/5xx failures get at most two retries with the same event ID/body. Terminal identity/validation errors are not retried. Delivery is in-memory best effort, not a durable offline queue. `onDelivery` reports recorded/failed/cancelled without text. Input and host send remain independent.

Verify edited send, Undo, rejection versus dismissal, duplicate/conflicting IDs, app/user/grant isolation, expiry, clearing during generation and late delivery. Compare feedback on/off using the same input/model configuration and fresh request IDs. Record the injected revision, human acceptance, edited submission and downstream results separately. Fixture comparisons prove wiring; quality uplift requires held-out or controlled live customer evaluation.
