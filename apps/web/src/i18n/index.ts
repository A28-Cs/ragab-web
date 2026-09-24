import { ar } from './ar';
import { en } from './en';
import { Language } from '../types';

export const dictionaries = {
  ar,
  en,
};

export const getDictionary = (lang: Language) => dictionaries[lang] || dictionaries.ar;
