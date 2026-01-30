import React, { createContext, useContext, useState } from 'react';
import { resources, LocaleKey } from './locales';

type Language = 'en' | 'zh';

interface I18nContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: LocaleKey | string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const [language, setLanguage] = useState<Language>(() => {
        const saved = localStorage.getItem('app_language') as Language;
        if (saved && (saved === 'en' || saved === 'zh')) {
            return saved;
        }

        const browserLang = navigator.language.toLowerCase();
        if (browserLang.startsWith('en')) {
            return 'en';
        }
        // Start with 'zh' or default to 'zh'
        if (browserLang.startsWith('zh')) {
            return 'zh';
        }

        return 'zh'; // Default fallback
    });



    const changeLanguage = (lang: Language) => {
        setLanguage(lang);
        localStorage.setItem('app_language', lang);
    };

    const t = (key: string) => {
        let value: any = resources[language];

        // Simple traversal: support 'common.key' or just 'key' (looking in common)
        if (value.common && value.common[key]) {
            return value.common[key];
        }

        // Support nested keys just in case, but structure is currently flat in common
        const keys = key.split('.');
        let current = value;
        for (const k of keys) {
            if (current && current[k]) {
                current = current[k];
            } else {
                current = null;
                break;
            }
        }

        if (current && typeof current === 'string') {
            return current;
        }

        // Fallback to English
        if (language !== 'en') {
            let enCurrent: any = resources['en'];
            if (enCurrent.common && enCurrent.common[key]) {
                return enCurrent.common[key];
            }

            let enTraverse = enCurrent;
            for (const k of keys) {
                if (enTraverse && enTraverse[k]) {
                    enTraverse = enTraverse[k];
                } else {
                    enTraverse = null;
                    break;
                }
            }
            if (enTraverse && typeof enTraverse === 'string') {
                return enTraverse;
            }
        }

        return key;
    };

    return (
        <I18nContext.Provider value={{ language, setLanguage: changeLanguage, t }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useTranslation() {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useTranslation must be used within an I18nProvider');
    }
    return context;
}
