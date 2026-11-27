'use client';

/**
 * Read one secret's switch as reactive state.
 *
 * Page code (the launcher, the catalogue) needs to *change what it does*
 * while a behaviour warp is on — Roulette re-rolls launches, Incognito stops
 * the history writes, Backwards reverses the list. This hook subscribes to
 * the secret store so a flip in the vault (or a typed code) lands in already
 * mounted page code within one tick.
 *
 * Server render always says `false`: the store lives in localStorage, and a
 * server render that guessed would disagree with the browser and make React
 * re-render the whole page. The flag snaps to its real value after mount.
 */

import { useEffect, useState } from 'react';
import { isToggled, subscribeSecrets, type SecretId } from '@/lib/secrets';

export function useSecretFlag(id: SecretId): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const sync = () => setOn(isToggled(id));
    sync();
    return subscribeSecrets(sync);
  }, [id]);

  return on;
}
