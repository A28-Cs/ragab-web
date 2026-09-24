# Contributing to Ragab Pharmacy — رجب

Thank you for contributing to the **Ragab Pharmacy** product ecosystem!

## Monorepo Package Rules

1. **Dependency Direction**:
   - `apps/*` may depend on `packages/*`.
   - `packages/*` MUST NOT depend on `apps/*`.
   - Primitive UI components belong in `@ragab/ui`.
   - Feature-specific UI components belong in `apps/web/src/features/`.

2. **Naming Conventions**:
   - React Components: `PascalCase`
   - Utility Functions: `camelCase`
   - TypeScript Types: `PascalCase`
   - Workspace Packages: `@ragab/<package-name>`

3. **Pre-PR Quality Checks**:
   ```bash
   npm run build
   ```
