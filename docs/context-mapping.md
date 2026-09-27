# Customer context mappings

These are integration examples, not claims about private customer code. Find each value's actual source in that customer's repository. Send concise text summaries, not raw video, images or slide binaries. No visual quality assessment is performed.

| Contract | Video editor | Slide editor |
|---|---|---|
| `user_preferences` | Product-known editing/language preferences | Product-known audience, tone and formatting preferences |
| `session_id` | Active editing/chat session | Active deck/chat session |
| `context_revision` | Revision of combined messages + timeline + selection | Revision of messages + deck + slide selection |
| `artifact.kind` | `video` | `slides` |
| `artifact.id` | Project/timeline ID | Deck ID |
| `artifact.revision` | Last stable timeline state revision | Last stable deck state revision |
| `artifact.selection` | Selected clip IDs and time interval | Selected slide IDs/numbers |
| `artifact.summary` | Known duration, cuts, captions, intended style | Known audience, outline, selected slide text, intended style |
| `messages` | Current user/agent editing dialogue | Current user/agent slide dialogue |

Only include state the application actually knows. Mark unavailable information as unavailable in the summary. Do not infer clip content or visual quality from a filename. Include the most recent human correction verbatim within the token envelope and update outdated preferences before sending. `origin` distinguishes `human`, `agent`, `accepted_prediction`, `edited_prediction`, `unknown`; acceptance does not transform generated text into independently observed user preference.

```ts
const artifact = {
  kind: 'video' as const, id: timeline.id, revision: String(timeline.revision),
  selection: selectedClipIds.join(', '),
  summary: `Duration: ${timeline.durationSeconds}s. Captions: ${captionSummary}`,
};
// For slide editors use kind:'slides', deck revision, selected slide IDs and known slide text.
```

The host increments `context_revision` immediately when messages or selection change, even while no prediction request is running. Do not wait for the next agent response. Keep `artifact.revision` tied to actual artifact edits, independently of conversation changes. The SDK invalidates a displayed candidate on that change. Increment the context revision when user preferences change too. App-only responses have `connection_id: null`, `profile_revision: ""` and `grant_revision: 0`. For optional personalized responses, treat `profile_revision` and `grant_revision` as opaque service-issued values; do not derive or supply them yourself.
