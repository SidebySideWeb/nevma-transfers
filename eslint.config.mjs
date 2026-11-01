import eslint from '@eslint/js';
import eslintPluginAstro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.astro/**',
      '**/.vercel/**',
      '**/.turbo/**',
      '**/node_modules/**',
      'apps/studio/**',
      'packages/db/**',
      'design/**',
      'seed/**',
      '**/sanity.types.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,astro}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/web/src/lib/booking/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/lib/server', '**/lib/server/*', '../server', '../server/*', './server/*'],
              message: 'lib/booking must stay pure: no lib/server imports.',
            },
            {
              group: ['@supabase/*'],
              message: 'lib/booking must stay pure: no Supabase imports.',
            },
            {
              group: ['@sanity/*'],
              message: 'lib/booking must stay pure: no Sanity imports.',
            },
          ],
        },
      ],
    },
  },
  // AC-34: no hard-coded user-facing copy in kit 2 chrome / sections.
  {
    files: [
      'apps/web/src/components/sections/**/*.{astro,tsx,jsx}',
      'apps/web/src/components/Header.astro',
      'apps/web/src/components/Footer.astro',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/\\S/]',
          message:
            'AC-34: no hard-coded copy in sections/Header/Footer — use t() or CMS props (empty strings and class names are fine).',
        },
      ],
    },
  },
);
