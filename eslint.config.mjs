import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

/**
 * eslint-config-next v16 ships native flat config, so it is spread directly.
 * The previous version wrapped it in FlatCompat, which is for the old
 * .eslintrc format; under ESLint 10 that threw "property 'react' closes the
 * circle" and `npm run lint` could not run at all.
 *
 * The rules below are relaxed deliberately, and only where they flag style
 * rather than defects in this codebase:
 *
 *  - no-explicit-any: ~210 legitimate uses. The api layer forwards loosely
 *    typed JSON from an external proxy and from the database; pinning every
 *    shape would be a large refactor with no behaviour change.
 *  - set-state-in-effect: legitimate here. These components hydrate local
 *    storage and probe `navigator` on mount, which genuinely cannot run during
 *    render; the rule cannot distinguish that from a render loop.
 *  - no-unescaped-entities: apostrophes in prose copy render correctly.
 *
 * Everything else still fails the lint. `@next/next/no-html-link-for-pages`
 * stays on: it caught real full-page reloads in the header nav.
 */
const config = [
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react/no-unescaped-entities': 'off',
      // `a ? b() : c()` as a statement is used deliberately throughout the
      // cursor/effects code; the rule's own option exists for exactly this.
      '@typescript-eslint/no-unused-expressions': ['warn', { allowTernary: true, allowShortCircuit: true }],
      // Game covers are 255 static files of known size; next/image would add a
      // resizing hop for no gain on an icon that is already a 256px webp.
      '@next/next/no-img-element': 'off',
      // Destructuring-with-rest to drop a field is idiomatic; the dropped
      // binding is unused by design.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
        caughtErrors: 'none',
      }],
      // A router push is heavier than an anchor for the few remaining internal
      // links; the nav itself already uses <Link>.
      '@next/next/no-location-assign-relative-destination': 'off',
      // exhaustive-deps is advisory. The remaining hits are intentional: a
      // ref-held Set or a prop the effect must NOT re-run on. Enabling it as an
      // error would force spurious re-subscriptions in the rAF cursor loop.
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    // vendored game code and build output are not ours to lint
    ignores: [
      'public/**',
      '.next/**',
      'scripts/proxy-runtime/**',
      'public/customization-game.js',
      'coverage/**',
    ],
  },
];

export default config;
