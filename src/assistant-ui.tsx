'use client';

import { unstable_useComposerInput } from '@assistant-ui/react';
import { useState } from 'react';
import { TabCompletionInput } from './react.js';
import type { TabCompletionInputProps } from './react.js';

/** Place inside your existing assistant-ui ComposerPrimitive.Root/runtime.
 * Only reads/writes composer text; submission stays with the existing host form.
 */
export function CloneComposerInput(props: Omit<TabCompletionInputProps, 'value' | 'onValueChange'>) {
  // This version-pinned public hook flushes external-store input updates before
  // React restores the DOM, preserving native Undo and composition behavior.
  const composer = unstable_useComposerInput({ disabled: props.disabled });
  // Native edits also need immediate local state: an external store can render
  // after React has already restored the old controlled value during execCommand.
  const [local, setLocal] = useState({ value: composer.value, external: composer.value });
  if (local.external !== composer.value) setLocal({ value: composer.value, external: composer.value });
  return <TabCompletionInput {...props} value={local.external === composer.value ? local.value : composer.value}
    onValueChange={value => { setLocal({ value, external: composer.value }); composer.setText(value); }}
    disabled={composer.isDisabled}
    onKeyDown={event => {
      props.onKeyDown?.(event);
      if (!event.defaultPrevented && event.key === 'Enter' && !event.shiftKey
        && !event.nativeEvent.isComposing && event.keyCode !== 229 && composer.canSend) {
        event.preventDefault();
        composer.send();
      }
    }} />;
}
