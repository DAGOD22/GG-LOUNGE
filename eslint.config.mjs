import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // vendored game code and build output are not ours to lint
    ignores: ['public/**', '.next/**', 'scripts/proxy-runtime/**', 'public/customization-game.js'],
  },
];
