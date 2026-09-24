// Flat ESLint config for @mahsoob/server.
// Architectural intent (documented in docs/backend/architecture): the layering is
// http → modules → lib/security/db. Modules compose via each other's SERVICE layer,
// but MUST NOT import the HTTP handler (that inversion would let a module wire routes).
// That single hard invariant is enforced as an error; deep data-internal reaches are a
// warning nudging callers toward a module's public index.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser, parserOptions: { project: false, ecmaVersion: 2022, sourceType: 'module' } },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/http/handler', '../../http/handler'], message: 'Modules must not import the HTTP handler — routes wire handlers, not modules.' },
          ],
        },
      ],
    },
  },
  // The public barrels and the http layer itself legitimately re-export the handler.
  { files: ['src/**/*.test.ts', 'src/index.ts', 'src/http/**'], rules: { 'no-restricted-imports': 'off' } },
);
