import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'images/', 'node_modules/'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', package: 'node:test', name: ['describe', 'it', 'test'] },
          ],
        },
      ],
    },
  },
  {
    files: ['src/panel/**'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
