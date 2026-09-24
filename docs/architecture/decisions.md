# Architecture Decision Record (ADR)

## ADR 001: Monorepo Transformation & Package Extraction

### Context
Ragab Pharmacy is an established pharmacy in Aleem Village, Abu Hammad Center, Sharqia. The product ecosystem will grow to encompass a customer website, a mobile application, and a store operations admin dashboard.

### Decision
Extract shared logic, brand identity, UI components, domain types, API clients, and localization into npm workspace packages (`@ragab/*`).

### Consequences
- **Pros**: Zero code duplication across web, admin, and mobile. Centralized brand identity and design system updates.
- **Cons**: Requires npm workspace / Turborepo build pipeline management.
