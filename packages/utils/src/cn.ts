import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * twMerge must be taught the project's custom font-size tokens —
 * otherwise it classifies `text-caption` etc. as *color* classes and
 * silently drops a preceding `text-white`/`text-ragab-*`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        'text-display',
        'text-h1',
        'text-h2',
        'text-h3',
        'text-body',
        'text-body-sm',
        'text-label',
        'text-caption',
        'text-price',
        'text-price-lg',
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
