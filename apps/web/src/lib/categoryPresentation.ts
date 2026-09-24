import { Category } from '../types';

/**
 * Emoji glyph per catalog `iconName` (kebab-case lucide names coming from the API).
 * Used by the category tiles / nav so departments read at a glance.
 */
const EMOJI_BY_ICON: Record<string, string> = {
  'shopping-basket': '🛒',
  'shopping-bag': '🛒',
  milk: '🧀',
  'cup-soda': '🧃',
  coffee: '☕',
  carrot: '🥬',
  apple: '🍎',
  popcorn: '🍿',
  cookie: '🍪',
  croissant: '🥖',
  sparkles: '🧴',
  heart: '🧴',
  'spray-can': '🧼',
  snowflake: '🧊',
  wheat: '🌾',
  'cake-slice': '🍰',
  droplet: '🫒',
  archive: '🥫',
  leaf: '🌿',
  'egg-fried': '🍳',
  candy: '🍫',
  soup: '🍲',
  'scroll-text': '🧻',
  baby: '🍼',
  utensils: '🍽️',
  package: '📦',
  'paw-print': '🐾',
  lightbulb: '💡',
  pencil: '✏️',
  ham: '🥩',
  // Added for the chefaa pharmacy import (§catalog import — chefaa source).
  pill: '💊',
  scissors: '✂️',
  palette: '💄',
  'heart-pulse': '🩺',
  heart: '❤️',
};

export function categoryEmoji(category: Pick<Category, 'iconName'>): string {
  return EMOJI_BY_ICON[category.iconName] ?? '🛍️';
}

/**
 * The departments surfaced on the home page and the header nav.
 * Top-level only; the ones curated with an image come first, then by size.
 */
export function featuredCategories(categories: Category[], limit = 8): Category[] {
  return categories
    .filter((c) => !c.parentId)
    .slice()
    .sort((a, b) => {
      const ai = a.image ? 1 : 0;
      const bi = b.image ? 1 : 0;
      if (ai !== bi) return bi - ai;
      if ((b.featured ? 1 : 0) !== (a.featured ? 1 : 0)) return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
      return b.itemCount - a.itemCount;
    })
    .slice(0, limit);
}
