import { describe, expect, it } from 'vitest';
import { ComposerEvents } from '../examples/react/composer-events.js';
import type { ComposerEvent } from '../examples/react/composer-events.js';

describe('host observation attribution', () => {
  it('records insertion separately from a later edit and explicit submission, without text', () => {
    const events: ComposerEvent[] = [];
    const tracker = new ComposerEvents(event => events.push(event));
    tracker.observe({ request_id: 'r1', kind: 'presented' }, 'draft');
    tracker.observe({ request_id: 'r1', kind: 'accepted' }, 'draft');
    tracker.input('draft suggestion');
    tracker.input('draft suggestion');
    tracker.input('draft suggestion edited');
    tracker.input('draft suggestion edited again');
    expect(tracker.submitted('draft suggestion edited again')).toBe('edited_prediction');
    expect(tracker.submitted('draft suggestion edited again')).toBe('human');
    expect(events.map(event => event.kind)).toEqual(['presented', 'accepted', 'edited', 'submitted']);
    expect(new Set(events.map(event => event.event_id)).size).toBe(4);
    expect(events.every(event => !event.final_text && !event.guidance)).toBe(true);
    expect(events.at(-1)?.submission_origin).toBe('edited_prediction');
  });
  it.each(['undo', 'clear', 'context-change'])('does not attribute unrelated submissions after %s', reason => {
    const events: ComposerEvent[] = [];
    const tracker = new ComposerEvents(event => events.push(event));
    tracker.observe({ request_id: 'r1', kind: 'accepted' }, 'draft');
    tracker.input('draft suggestion');
    if (reason === 'context-change') tracker.reset();
    else tracker.input(reason === 'undo' ? 'draft' : '');
    tracker.input('new human message');
    expect(tracker.submitted('new human message')).toBe('human');
    expect(events.map(event => event.kind)).toEqual(['accepted']);
  });
  it('does not block input when the telemetry sink fails', () => {
    const tracker = new ComposerEvents(() => { throw new Error('offline'); });
    expect(() => {
      tracker.observe({ request_id: 'r1', kind: 'accepted' }, '');
      tracker.input('suggestion'); tracker.input('edited'); tracker.submitted('edited');
    }).not.toThrow();
  });
  it('reports an unchanged accepted draft as prediction-assisted, including after undoing an edit', () => {
    const tracker = new ComposerEvents(() => {});
    tracker.observe({ request_id: 'r1', kind: 'accepted' }, 'draft');
    tracker.input('draft suggestion');
    tracker.input('draft suggestion edited');
    tracker.input('draft suggestion');
    expect(tracker.submitted('draft suggestion')).toBe('accepted_prediction');
  });
});
