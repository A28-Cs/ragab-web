# @ragab/brand

Centralized Brand System and SVG Vector Logo Library for **Ragab Pharmacy — رجب**.

## Features

- Pure React SVG Vector Logo components (`RagabLogo`, `RagabMark`, `RagabWordmarkArabic`, `RagabWordmarkEnglish`).
- 11 Supported Logo Variants (`primary_ar`, `bilingual`, `wordmark_ar`, `wordmark_en`, `mark`, `horizontal`, `stacked`, `dark`, `light`, `mono_dark`, `mono_light`).
- Single source of truth for colors (`RAGAB_BRAND_COLORS`) and typography (`RAGAB_BRAND_TYPOGRAPHY`).
- Exported raw SVG vector assets in `packages/brand/assets/`.

## Usage

```tsx
import { RagabLogo, RAGAB_BRAND_COLORS } from '@ragab/brand';

// Primary Arabic Horizontal Logo
<RagabLogo variant="horizontal" size="md" />

// Bilingual Lockup with Tagline
<RagabLogo variant="bilingual" size="lg" showTagline={true} />

// Dark Surface (White text & logo)
<RagabLogo variant="dark" size="md" />

// Compact Brand Icon
<RagabLogo variant="mark" size="sm" />
```
