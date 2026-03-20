import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { LightColors, DarkColors } from './DesignSystem';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, get, set } from 'firebase/database';
import { db, auth } from '../../firebaseConfig';

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

    useEffect(() => {
        const loadTheme = async () => {
            if (auth.currentUser) {
                try {
                    const snap = await get(ref(db, `users/${auth.currentUser.uid}/settings/themePref`));
                    if (snap.exists()) {
                        setThemePrefState(snap.val());
                    }
                } catch (e) {
                    console.error("Failed to load theme preference");
                }
            }
        };
        loadTheme();
    }, [auth.currentUser]);

    const setThemePref = async (pref: 'light' | 'dark' | 'system') => {
        setThemePrefState(pref);
        if (auth.currentUser) {
            try {
                await set(ref(db, `users/${auth.currentUser.uid}/settings/themePref`), pref);
            } catch (e) {
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
