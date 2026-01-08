import { ko } from './locales/ko'
import { en } from './locales/en'

type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends object
      ? DeepStringify<T[K]>
      : T[K]
}

export type TranslationKeys = DeepStringify<typeof ko>
export type Language = 'ko' | 'en'

export const translations: Record<Language, TranslationKeys> = {
  ko,
  en,
}

export const supportedLanguages: { code: Language; name: string; flag: string }[] = [
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
]
