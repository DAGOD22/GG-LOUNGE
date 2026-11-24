'use client';

/**
 * Copy the whole directory as plain text.
 *
 * A page of 1,000 links is useless if the only way to keep them is to select
 * them by hand, and the thing most people actually want is a list they can
 * paste into a doc or a group chat. The text is built on the server from the
 * same catalogue the page renders, so a copied list can never contain a game
 * the page does not show.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyDirectoryButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2400);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      // Clipboard access is denied in some embedded webviews and over plain
      // http. Say so rather than pretending it worked.
      setState('failed');
    }
  }, [text]);

  return (
    <button className="doc-copy" onClick={copy} type="button">
      {state === 'copied' ? <Check size={14} /> : <Copy size={14} />}
      {state === 'copied'
        ? 'Copied the whole list'
        : state === 'failed'
          ? 'Copy blocked — select the text instead'
          : 'Copy every link as text'}
    </button>
  );
}
