import { get, ref, set } from 'firebase/database';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { auth, db } from '../../firebaseConfig';
import { DarkColors, LightColors } from './DesignSystem';

export type ThemeColors = typeof LightColors;

interface ThemeContextType {
    isDark: boolean;
    colors: ThemeColors;
    toggleTheme: () => void;
    setThemePref: (pref: 'light' | 'dark' | 'system') => void;
    themePref: 'light' | 'dark' | 'system';
}

const ThemeContext = createContext<ThemeContextType>({
    isDark: false,
    colors: LightColors,
    toggleTheme: () => {},
    setThemePref: () => {},
    themePref: 'light'
});

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const systemColorScheme = useColorScheme();
    const [themePref, setThemePrefState] = useState<'light' | 'dark' | 'system'>('light');
    const currentUserId = auth.currentUser?.uid || null;

    useEffect(() => {
        const loadTheme = async () => {
            if (currentUserId) {
                try {
                    const snap = await get(ref(db, `users/${currentUserId}/settings/themePref`));
                    if (snap.exists()) {
                        setThemePrefState(snap.val());
                    }
                } catch {
                    console.error("Failed to load theme preference");
                }
            }
        };
        loadTheme();
    }, [currentUserId]);

    const setThemePref = async (pref: 'light' | 'dark' | 'system') => {
        setThemePrefState(pref);
        if (currentUserId) {
            try {
                await set(ref(db, `users/${currentUserId}/settings/themePref`), pref);
            } catch {
                console.error("Failed to save theme preference");
            }
        }
    };

    const isDark = themePref === 'system' ? systemColorScheme === 'dark' : themePref === 'dark';
    
    // Toggle function for easy switching between light/dark explicitly
    const toggleTheme = () => {
        setThemePref(isDark ? 'light' : 'dark');
    };

    const colors = isDark ? DarkColors : LightColors;

    return (
        <ThemeContext.Provider value={{ isDark, colors, toggleTheme, setThemePref, themePref }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
