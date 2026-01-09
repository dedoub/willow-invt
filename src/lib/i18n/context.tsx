'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { translations, Language, TranslationKeys, supportedLanguages } from './translations'

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: TranslationKeys
  supportedLanguages: typeof supportedLanguages
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ko')
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    const savedLang = localStorage.getItem('language') as Language
    if (savedLang && translations[savedLang]) {
      setLanguageState(savedLang)
    } else {
      const browserLang = navigator.language.startsWith('ko') ? 'ko' : 'en'
      setLanguageState(browserLang)
    }
    setIsHydrated(true)
  }, [])

  const setLanguage = (lang: Language) => {
    if (translations[lang]) {
      setLanguageState(lang)
      localStorage.setItem('language', lang)
    }
  }

  const t = translations[language]

  if (!isHydrated) {
    return (
      <I18nContext.Provider value={{ language: 'ko', setLanguage, t: translations.ko, supportedLanguages }}>
        {children}
      </I18nContext.Provider>
    )
  }

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, supportedLanguages }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}
