import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Database theme colors - matching the database icons
export const DATABASE_THEME_COLORS: Record<string, string> = {
    'Redis': '#ef4444',      // red-500
    'PostgreSQL': '#3b82f6', // blue-500
    'MySQL': '#f97316',      // orange-500
    'MongoDB': '#22c55e',    // green-500
    'SQLite': '#06b6d4',     // cyan-500
    'default': '#364774'     // default dark blue (original)
};

// Preset theme colors for user selection
export const PRESET_THEME_COLORS = [
    { id: 'default', name: 'Default Blue', color: '#364774' },
    { id: 'midnight', name: 'Midnight', color: '#1e1b4b' },
    { id: 'ocean', name: 'Ocean', color: '#0c4a6e' },
    { id: 'forest', name: 'Forest', color: '#14532d' },
    { id: 'sunset', name: 'Sunset', color: '#7c2d12' },
    { id: 'purple', name: 'Purple Rain', color: '#581c87' },
    { id: 'rose', name: 'Rose', color: '#9f1239' },
    { id: 'slate', name: 'Slate', color: '#334155' }
];

export type ThemeMode = 'auto' | 'preset' | 'custom';

interface ThemeSettings {
    mode: ThemeMode;
    autoFollowDatabase: boolean;   // Whether to follow database theme color
    presetColorId: string;         // Selected preset color ID
    customColor: string;           // Custom color value (hex)
    isStaticBackground: boolean;   // Whether to use a static background instead of an animated one
    staticBackgroundColor: string; // The color for the static background
}

interface ThemeContextType {
    themeSettings: ThemeSettings;
    currentThemeColor: string;      // The actual color being used
    connectedDatabase: string | null;
    setConnectedDatabase: (db: string | null) => void;
    setThemeMode: (mode: ThemeMode) => void;
    setAutoFollowDatabase: (follow: boolean) => void;
    setPresetColor: (colorId: string) => void;
    setCustomColor: (color: string) => void;
    setStaticBackground: (isStatic: boolean) => void;
    setStaticBackgroundColor: (color: string) => void;
    saveThemeSettings: () => void;
}

const defaultSettings: ThemeSettings = {
    mode: 'auto',
    autoFollowDatabase: true,
    presetColorId: 'default',
    customColor: '#364774',
    isStaticBackground: false,
    staticBackgroundColor: '#1b1e27'
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'spectra_theme_settings';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                return { ...defaultSettings, ...JSON.parse(saved) };
            } catch {
                return defaultSettings;
            }
        }
        return defaultSettings;
    });

    const [connectedDatabase, setConnectedDatabase] = useState<string | null>(null);

    // Calculate the current theme color based on settings and connected database
    const currentThemeColor = React.useMemo(() => {
        if (themeSettings.mode === 'custom') {
            return themeSettings.customColor;
        }

        if (themeSettings.mode === 'preset') {
            const preset = PRESET_THEME_COLORS.find(p => p.id === themeSettings.presetColorId);
            return preset?.color || DATABASE_THEME_COLORS.default;
        }

        // Auto mode
        if (themeSettings.autoFollowDatabase && connectedDatabase) {
            return DATABASE_THEME_COLORS[connectedDatabase] || DATABASE_THEME_COLORS.default;
        }

        return DATABASE_THEME_COLORS.default;
    }, [themeSettings, connectedDatabase]);

    const setThemeMode = useCallback((mode: ThemeMode) => {
        setThemeSettings(prev => ({ ...prev, mode }));
    }, []);

    const setAutoFollowDatabase = useCallback((follow: boolean) => {
        setThemeSettings(prev => ({ ...prev, autoFollowDatabase: follow }));
    }, []);

    const setPresetColor = useCallback((colorId: string) => {
        setThemeSettings(prev => ({ ...prev, presetColorId: colorId }));
    }, []);

    const setCustomColor = useCallback((color: string) => {
        setThemeSettings(prev => ({ ...prev, customColor: color }));
    }, []);

    const setStaticBackground = useCallback((isStatic: boolean) => {
        setThemeSettings(prev => ({ ...prev, isStaticBackground: isStatic }));
    }, []);

    const setStaticBackgroundColor = useCallback((color: string) => {
        setThemeSettings(prev => ({ ...prev, staticBackgroundColor: color }));
    }, []);

    const saveThemeSettings = useCallback(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(themeSettings));
    }, [themeSettings]);

    // Auto-save when settings change
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(themeSettings));
    }, [themeSettings]);

    return (
        <ThemeContext.Provider
            value={{
                themeSettings,
                currentThemeColor,
                connectedDatabase,
                setConnectedDatabase,
                setThemeMode,
                setAutoFollowDatabase,
                setPresetColor,
                setCustomColor,
                setStaticBackground,
                setStaticBackgroundColor,
                saveThemeSettings
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
