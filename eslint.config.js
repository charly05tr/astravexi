import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.atl', 'reports', 'research_notes', 'backend'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // Pure core: no UI, 3D, storage or adapter imports; no ambient clock or randomness.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react/*', 'react-dom', 'react-dom/*'], message: 'core must not import React.' },
            { group: ['three', 'three/*', '@react-three/*'], message: 'core must not import three.' },
            { group: ['dexie', 'zustand', 'zustand/*', 'recharts'], message: 'core must not import storage, state or chart libraries.' },
            { group: ['**/adapters', '**/adapters/*', '**/features', '**/features/*', '**/app', '**/app/*'], message: 'core must not import adapters, features or app.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'core must be deterministic: no Date.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'core must be deterministic: no Math.random.' },
        { object: 'Date', property: 'now', message: 'core must be deterministic: no Date.now.' },
      ],
    },
  },
);
