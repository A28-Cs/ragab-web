# Ragab Pharmacy — رجب (Product Ecosystem Monorepo)

Production-grade frontend ecosystem and brand design system for **Ragab Pharmacy — رجب**, a local pharmacy in **Aleem Village, Abu Hammad Center, Sharqia Governorate, Egypt**. Forked from the Ragab Pharmacy codebase as an independent project with its own database.

Note: internal package names (`@ragab/*`) and component names (e.g. `RagabLogo`) were kept as-is — they are technical identifiers inherited from the source codebase, not user-facing branding.

---

## 1. Monorepo Architecture

```text
ragab/
├── apps/
│   ├── web/                # Customer-facing Next.js 14 Web Application
│   ├── admin/              # Store Operations & Admin Dashboard shell
│   └── mobile/             # React Native / Expo Mobile Application scaffold
│
├── packages/
│   ├── brand/              # Pure SVG vector logo system, brand tokens & materials
│   ├── ui/                 # Shared UI component primitives (@ragab/ui)
│   ├── types/              # Domain TypeScript interfaces & models (@ragab/types)
│   ├── api-client/         # Unified API client abstraction with Mock/HTTP adapters
│   ├── config/             # Store config & environment variables (@ragab/config)
│   ├── i18n/               # Shared Arabic & English dictionaries (@ragab/i18n)
│   ├── utils/              # Currency formatters & class merge helpers (@ragab/utils)
│   └── validation/         # Egyptian phone & address validation rules (@ragab/validation)
│
├── docs/                   # Full documentation (brand, architecture, product, ADRs)
├── package.json            # Root workspace config (npm workspaces / Turborepo)
├── turbo.json              # Turborepo task pipeline
├── tsconfig.base.json      # Base TypeScript configuration
└── CONTRIBUTING.md         # Development guidelines
```

---

## 2. Quick Start & Running Applications

### Environment Setup

Ensure Node.js is on your PATH:

```powershell
$env:PATH = "C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Microsoft\VisualStudio\NodeJs;" + $env:PATH
```

### Install Dependencies

```bash
npm install
```

### Run Web Application (`apps/web`)

```bash
npm run dev:web
```
Access at `http://localhost:3000`.

### Run Admin Dashboard (`apps/admin`)

```bash
npm run dev:admin
```
Access at `http://localhost:3001`.

### Build Production Bundles

```bash
npm run build
```

---

## 3. Brand Identity & Logo System

The brand system is built on **Pharmacy Identity**:
- **Primary Teal**: `#14b8a6`
- **Secondary Teal**: `#0d9488`
- **Slate (Dark)**: `#1e293b`
- **Soft Background**: `#F5F2EC`
- **Typography**: `Cairo` (Arabic primary), `Poppins` (English secondary).

### Using the Logo Component

```tsx
import { RagabLogo } from '@ragab/brand';

// Render bilingual logo
<RagabLogo variant="bilingual" size="md" showTagline={true} />

// Render compact icon
<RagabLogo variant="mark" size="sm" />
```

Interactive Brand Showcase & QA page is available at `/brand-preview` in `apps/web`.
