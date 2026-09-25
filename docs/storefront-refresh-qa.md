# Storefront and dashboard refresh — verification

## Behavior

- Removed the storefront announcement strip. Header starts at the top of the viewport.
- Reworked desktop navigation and mobile search/account access; preserved staff quick actions.
- Replaced the four large hero benefit cards with catalog product imagery and a compact service row.
- Added prominent drawer account shortcuts and direct logout, using the existing auth provider.
- Storefront sticky sidebars now follow the measured header height through `--header-h`.
- Shared dropdowns render through a body portal, measure available space, flip vertically, clamp horizontally, and support scrolling, Escape, outside click, arrow keys, and one open menu at a time.

## Dashboard definitions

`GET /api/v1/admin/dashboard` requires authentication; the service requires a staff principal and applies each existing resource permission separately. Unauthorized metrics are null, never zero.

- Today's orders: Cairo calendar day, with separately converted local-midnight boundaries for DST.
- Revenue: all-time net collected payments from the existing `collectedTotals` implementation, after refunds.
- Customers: registered non-staff users, matching the existing customer service definition.
- Low stock: the existing catalog `countProducts` low-stock filter, including each product's threshold and reserved stock handling.

No schema or permission changes. No browser-side credentials or database aggregation.

## Verification

- Final web TypeScript check passed (run with a reduced-memory Node configuration).
- 14 unit tests passed across overview, permissions, and roles.
- 9 browser component tests passed with mocked API responses: widths 320/390/768/1024/1440; header measurement; account/logout; menu flipping, viewport clamping, internal scrolling, Escape/focus restoration and outside click; zero/error dashboard data; delayed loading and direct refresh.
- The browser run used the actual application components in an isolated esbuild preview. Next navigation/image wrappers and API responses were test adapters. This is not a full Next.js integration or real-database run; next/font was not loaded in this preview.
- The full Next.js run could not complete because the host ran out of virtual memory during compilation. The Playwright web-server command was corrected to use the actual `apps/web` project directory.
- Full server typechecking reports existing errors in `packages/server/src/db/scripts/seed-fake.ts` (uuid declarations and seed objects inconsistent with the schema); that file was not modified.
- Database integration verification remains pending: no DATABASE_URL, SESSION_SECRET, or CSRF_SECRET is configured in this checkout/environment.

## Reproduce with the normal application

```powershell
npm run typecheck:web
npm --prefix packages/server run test -- src/modules/reports/overview.test.ts src/security/permissions.test.ts src/security/roles.test.ts
npx playwright test e2e/storefront-refresh.spec.ts
```

The browser suite mocks APIs and does not mutate a live database. Separately verify the dashboard against a configured test database, including Cairo midnight/DST, paid/refunded/cancelled orders, registered customers and stock reservations, before considering production QA complete.