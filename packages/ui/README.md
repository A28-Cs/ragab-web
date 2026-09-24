# @ragab/ui

> **⚠️ Deprecated for `apps/web`.** The customer web app's design system now lives in
> `apps/web/src/components/ui/` — those components use `cn()` (clsx + tailwind-merge),
> the `ragab-brand-*` / `ragab-ink-*` token scales, and logical (RTL-safe) utilities.
> This package is currently consumed only by the `/brand-preview` showcase page.
> New shared components should be authored in `apps/web` first and promoted here
> (with `'use client'` + `cn()`) only when `admin`/`mobile` actually need them.

Shared UI Design System Component Primitives for **Ragab Pharmacy — رجب**.

## Design System Principles

- Brand Palette: Ragab Yellow (`#F4C430`), Soft Cream (`#FFF6E1`), Soft Background (`#F5F2EC`), Dark Charcoal (`#1F1F1F`).
- Arabic-First Typography: Google Font `Tajawal` (Arabic) & `Poppins` (English).
- Clean, accessible, touch-friendly components.

## Available Components

- `Button`
- `IconButton`
- `Badge`
- `Price`
- `QuantitySelector`
- `SectionHeader`
- `Modal`
- `Drawer`
- `Skeleton`
- `EmptyState`

## Usage

```tsx
import { Button, Price, Badge } from '@ragab/ui';

<Button variant="primary" size="md">أضف إلى السلة</Button>
<Price amount={45.50} oldAmount={55.00} />
<Badge variant="yellow">خصم 15%</Badge>
```
