# Ragab Architecture Overview

## Ecosystem Structure

```
ragab/
├── apps/
│   ├── web/        # Next.js 14 customer web app
│   ├── admin/      # Store operations & admin dashboard shell
│   └── mobile/     # Expo / React Native app scaffold
└── packages/
    ├── brand/      # SVG vector logo system & brand tokens
    ├── ui/         # Shared UI primitives & design tokens
    ├── types/      # Shared domain TypeScript models
    ├── api-client/ # Unified API client with Mock/HTTP adapters
    ├── config/     # Store config & environment variables
    ├── i18n/       # Arabic & English localization dictionaries
    ├── utils/      # Shared formatters & class merge helpers
    └── validation/ # Egyptian phone & address validation
```

## Dependency Hierarchy

```
apps (web, admin, mobile)
  └── packages (brand, ui, types, api-client, config, i18n, utils, validation)
```
*Shared packages MUST NOT depend on applications.*
