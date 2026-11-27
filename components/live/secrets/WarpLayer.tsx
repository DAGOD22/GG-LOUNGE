'use client';

/**
 * The warp engine.
 *
 * Takes the list of currently enabled warps and does two things:
 *
 *   1. applies the document-level effects — filter chains, transforms and
 *      zoom are combined into inline styles on <html>, class warps toggle
 *      their `gg-warp-*` class — and cleans all of it up when the list
 *      empties, so switching every warp off restores the site exactly;
 *   2. mounts the per-secret components: the screen overlays (weather,
 *      creatures, the clock) and the behaviour hosts (launcher rewires,
 *      wake locks, the visitor counter).
 *
 * Multiple filter warps compose ("Negative World" + "Night Shift" genuinely
 * stacks), which is half the fun of a warp system.
 */

import { useCallback, useEffect, type ReactElement } from 'react';
import { SECRETS, type SecretId, type WarpEffect } from '@/lib/secrets';
import { BEHAVIOR_COMPONENTS } from './Behaviors';
import { CodeRain, RetroMode, Snowfall, Spotlight, TimeWarp } from './Overlays';
import {
  BatSwarm,
  Bubbles,
  CherryBlossom,
  ClickRipples,
  ClockOverlay,
  ConfettiRain,
  EmberRise,
  Fireflies,
  FireworksShow,
  MeteorShower,
  PartyClicks,
  RainbowTrail,
  Rainfall,
  StarrySky,
  Thunderstorm,
  UFOVisit,
  VisitorCounter,
} from './Particles';

/** Mounted component per secret id: screen overlays and behaviour hosts. */
const MOUNTED: Partial<Record<SecretId, () => ReactElement | null>> = {
  konami: RetroMode,
  matrix: CodeRain,
  snow: Snowfall,
  xyzzy: Spotlight,
  timewarp: TimeWarp,
  meteor: MeteorShower,
  starry: StarrySky,
  fireworks: FireworksShow,
  rainfall: Rainfall,
  thunder: Thunderstorm,
  fireflies: Fireflies,
  bubbles: Bubbles,
  embers: EmberRise,
  blossom: CherryBlossom,
  confetti: ConfettiRain,
  bats: BatSwarm,
  ufo: UFOVisit,
  trail: RainbowTrail,
  ripples: ClickRipples,
  party: PartyClicks,
  clock: ClockOverlay,
  counter: VisitorCounter,
  ...BEHAVIOR_COMPONENTS,
};

const WARP_BY_ID = new Map(SECRETS.map(secret => [secret.id, secret]));

export function WarpLayer({ active }: { active: SecretId[] }) {
  const activeKey = active.join(',');

  /* ---- document-level effects -------------------------------------------- */
  const apply = useCallback(
    (ids: SecretId[]) => {
      const root = document.documentElement;
      const filters: string[] = [];
      const transforms: string[] = [];
      const classes: string[] = [];
      let zoomProduct = 1;

      for (const id of ids) {
        const warp: WarpEffect | undefined = WARP_BY_ID.get(id)?.warp;
        if (!warp) continue;
        switch (warp.kind) {
          case 'filter':
            filters.push(warp.value);
            break;
          case 'transform':
            transforms.push(warp.value);
            break;
          case 'zoom':
            zoomProduct *= warp.value;
            break;
          case 'class':
            classes.push(`gg-warp-${id}`);
            break;
          default:
            break;
        }
      }

      root.style.filter = filters.join(' ');
      root.style.transformOrigin = 'center center';
      root.style.transform = transforms.join(' ');
      // `zoom` is an old, non-standard-ish property that every modern browser
      // now implements — and it is the only thing that shrinks *layout* rather
      // than merely scaling paint, which is what "Mini Mode" promises.
      (root.style as CSSStyleDeclaration & { zoom: string }).zoom = zoomProduct === 1 ? '' : String(zoomProduct);
      const wanted = new Set(classes);
      for (const cls of [...root.classList]) {
        if (cls.startsWith('gg-warp-') && !wanted.has(cls)) root.classList.remove(cls);
      }
      for (const cls of wanted) root.classList.add(cls);

      return () => {
        root.style.filter = '';
        root.style.transform = '';
        (root.style as CSSStyleDeclaration & { zoom: string }).zoom = '';
        for (const cls of wanted) root.classList.remove(cls);
      };
    },
    [],
  );

  useEffect(() => {
    const ids = activeKey ? activeKey.split(',') as SecretId[] : [];
    return apply(ids);
  }, [apply, activeKey]);

  /* ---- overlays ------------------------------------------------------------ */
  const ids = activeKey ? (activeKey.split(',') as SecretId[]) : [];

  return (
    <>
      {ids.map(id => {
        const Mounted = MOUNTED[id];
        return Mounted ? <Mounted key={id} /> : null;
      })}
    </>
  );
}

/** Exported for tests: which of the given ids mount a component. */
export function mountedIdsFor(ids: SecretId[]): SecretId[] {
  return ids.filter(id => MOUNTED[id]);
}
