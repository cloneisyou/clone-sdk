'use client';

import {
  useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react';
import type { CSSProperties, KeyboardEvent, TextareaHTMLAttributes } from 'react';
import { CompletionController } from './controller.js';
import { CloneModeController } from './clone-mode.js';
import type { CloneModeInput, CloneModeOptions } from './clone-mode.js';
import type { CompletionInput, CompletionOptions } from './controller.js';
import type { CompletionRequest, PredictionTransport } from './types.js';

export interface TabCompletionOptions {
  value: string;
  onValueChange: (value: string) => void;
  context: Omit<CompletionRequest, 'draft' | 'mode' | 'request_id'>;
  transport: PredictionTransport;
  enabled?: boolean;
  debounceMs?: number;
  maxRequestsPerMinute?: number;
  requestTimeoutMs?: number;
  presentation?: 'instant' | 'typewriter';
  onEvent?: CompletionOptions['onEvent'];
}

/** Opt-in only. Render the returned candidate and a visible Stop action before starting. */
export function useCloneMode(options: CloneModeOptions & { input: CloneModeInput }) {
  const current = useRef(options);
  current.current = options;
  const controller = useMemo(() => new CloneModeController({
    transport: (request, settings) => current.current.transport(request, settings),
    onSubmit: (text, metadata) => current.current.onSubmit(text, metadata),
    get reviewMs() { return current.current.reviewMs; },
    get requestTimeoutMs() { return current.current.requestTimeoutMs; },
  }), []);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const settings = useRef({ reviewMs: options.reviewMs, requestTimeoutMs: options.requestTimeoutMs });
  const key = JSON.stringify(options.input);
  useLayoutEffect(() => {
    const changed = !Object.is(settings.current.reviewMs, options.reviewMs)
      || !Object.is(settings.current.requestTimeoutMs, options.requestTimeoutMs);
    settings.current = { reviewMs: options.reviewMs, requestTimeoutMs: options.requestTimeoutMs };
    // Keep the controller's pending-send guard until the host receipt settles.
    if (changed && !['off', 'stopped'].includes(controller.getSnapshot().status)) controller.stop('settings_changed');
    controller.update(current.current.input);
  }, [controller, key, options.reviewMs, options.requestTimeoutMs]);
  useEffect(() => {
    const stopActive = (reason: string) => {
      if (!['off', 'stopped'].includes(controller.getSnapshot().status)) controller.stop(reason);
    };
    const visibility = () => { if (document.hidden) stopActive('page_hidden'); };
    document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('visibilitychange', visibility); stopActive('unmounted'); };
  }, [controller]);
  return { state,
    start: (limits?: { maxTurns?: number; maxDurationMs?: number }) => {
      controller.update(current.current.input);
      return !document.hidden && controller.start(limits);
    },
    stop: () => controller.stop(),
    turnCompleted: () => { controller.update(current.current.input); return controller.turnCompleted(); },
  };
}

export function useTabCompletion(options: TabCompletionOptions) {
  const current = useRef(options);
  current.current = options;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const [interaction, rerender] = useState(0);
  const revision = useRef({ value: options.value, number: 0 });
  if (revision.current.value !== options.value) {
    revision.current = { value: options.value, number: revision.current.number + 1 };
  }
  const controller = useMemo(() => new CompletionController({
    transport: (request, settings) => current.current.transport(request, settings),
    onEvent: event => current.current.onEvent?.(event),
    debounceMs: options.debounceMs, maxRequestsPerMinute: options.maxRequestsPerMinute,
    requestTimeoutMs: options.requestTimeoutMs, presentation: options.presentation,
  }), [options.debounceMs, options.maxRequestsPerMinute, options.requestTimeoutMs, options.presentation]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const snapshot = useCallback((): CompletionInput => {
    const node = inputRef.current;
    return {
      value: current.current.value, revision: revision.current.number, context: current.current.context,
      enabled: current.current.enabled, focused: !!node && node.ownerDocument.activeElement === node,
      composing: composing.current, selectionStart: node?.selectionStart ?? 0, selectionEnd: node?.selectionEnd ?? 0,
    };
  }, []);
  const key = JSON.stringify({ value: options.value, context: options.context, enabled: options.enabled, interaction });
  useLayoutEffect(() => { controller.update(snapshot()); }, [controller, snapshot, key]);
  // dismiss cancels all work without poisoning React StrictMode's effect replay.
  useEffect(() => () => controller.dismiss(false), [controller]);

  const accept = useCallback(() => {
    controller.update(snapshot());
    const accepted = controller.accept();
    const node = inputRef.current;
    if (!accepted || !node) return false;
    // Native insertion preserves Chromium's Undo stack. React state assignment
    // alone is insufficient. Other hosts can use the controller's accepted value.
    const document = node.ownerDocument;
    let inserted = false;
    try { inserted = document.execCommand('insertText', false, accepted.suffix); } catch { /* fallback below */ }
    if (!inserted && node.value !== accepted.value) {
      node.setRangeText(accepted.suffix, node.selectionStart, node.selectionEnd, 'end');
    }
    current.current.onValueChange(node.value);
    rerender(n => n + 1);
    return true;
  }, [controller, snapshot]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    controller.update(snapshot());
    if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && accept()) {
      event.preventDefault(); event.stopPropagation();
    } else if (event.key === 'Escape' && controller.getSnapshot().candidate) {
      controller.dismiss(); event.preventDefault(); event.stopPropagation();
    }
  }, [controller, snapshot, accept]);

  const inputProps = {
    ref: inputRef, value: options.value, onKeyDown,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      current.current.onValueChange(event.currentTarget.value);
      controller.dismiss(false);
    },
    onCompositionStart: () => { composing.current = true; controller.update(snapshot()); },
    onCompositionEnd: () => { composing.current = false; rerender(n => n + 1); },
    onFocus: () => rerender(n => n + 1),
    onBlur: () => { controller.dismiss(false); rerender(n => n + 1); },
    onSelect: () => { controller.update(snapshot()); rerender(n => n + 1); },
  };
  return { inputProps, inputRef, completion: state.visibleCompletion, state,
    canAccept: !!state.candidate && state.visibleCompletion === state.candidate.completion,
    accept, dismiss: () => controller.dismiss() };
}

export type TabCompletionInputProps = TabCompletionOptions & Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'onChange'
>;

/** Drop-in textarea; the parent owns form submission and every explicit send. */
export function TabCompletionInput(props: TabCompletionInputProps) {
  const { value, onValueChange, context, transport, enabled, debounceMs, maxRequestsPerMinute, requestTimeoutMs, presentation,
    onEvent, style, onKeyDown, onFocus, onBlur, onSelect, onCompositionStart, onCompositionEnd, onScroll,
    ...textarea } = props;
  const completion = useTabCompletion({ value, onValueChange, context, transport,
    enabled: enabled !== false && !textarea.disabled && !textarea.readOnly, debounceMs, maxRequestsPerMinute, requestTimeoutMs, presentation, onEvent });
  const ghostRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const shared: CSSProperties = { boxSizing: 'border-box', width: '100%', padding: 12, margin: 0,
    font: 'inherit', lineHeight: '1.5', letterSpacing: 'inherit', whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
    border: '1px solid transparent', borderRadius: 8, ...style };
  return <div style={{ position: 'relative', width: '100%' }}>
    <div ref={ghostRef} aria-hidden="true" data-clone-suggestion="" style={{ ...shared,
      position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', overflow: 'hidden', color: 'transparent',
      background: 'transparent', borderColor: 'transparent' }}>
      {value}<span style={{ color: '#737982' }}>{completion.completion}</span>
    </div>
    <textarea {...textarea} {...completion.inputProps} style={{ ...shared, position: 'relative',
      background: 'transparent', resize: 'vertical', borderColor: '#9ca3af', ...style }}
      aria-describedby={[textarea['aria-describedby'], completion.completion ? id : ''].filter(Boolean).join(' ') || undefined}
      onKeyDown={event => { completion.inputProps.onKeyDown(event); if (!event.defaultPrevented) onKeyDown?.(event); }}
      onFocus={event => { completion.inputProps.onFocus(); onFocus?.(event); }}
      onBlur={event => { completion.inputProps.onBlur(); onBlur?.(event); }}
      onSelect={event => { completion.inputProps.onSelect(); onSelect?.(event); }}
      onCompositionStart={event => { completion.inputProps.onCompositionStart(); onCompositionStart?.(event); }}
      onCompositionEnd={event => { completion.inputProps.onCompositionEnd(); onCompositionEnd?.(event); }}
      onScroll={event => {
        if (ghostRef.current) { ghostRef.current.scrollTop = event.currentTarget.scrollTop;
          ghostRef.current.scrollLeft = event.currentTarget.scrollLeft; }
        onScroll?.(event);
      }}
    />
    {completion.completion && <span id={id} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
      Suggestion: {completion.completion}. {completion.canAccept ? 'Press Tab to accept, Escape to dismiss.' : 'Loading suggestion. Escape to dismiss.'}
    </span>}
  </div>;
}
