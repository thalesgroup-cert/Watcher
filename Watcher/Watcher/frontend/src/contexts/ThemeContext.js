import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import preferencesService from '../services/preferencesService';

const ThemeContext = createContext();

export const THEMES = {
    bootstrap: { name: 'Watcher Default', description: 'Classic blue theme', dark: false, hidden: true },
    flatly: { name: 'Flatly', description: 'Flat and modern', dark: false },
    cosmo: { name: 'Cosmo', description: 'An ode to Metro', dark: false },
    lux: { name: 'Lux', description: 'A touch of class', dark: false },
    minty: { name: 'Minty', description: 'Fresh & clean', dark: false },
    morph: { name: 'Morph', description: 'Skeuomorphism in the digital age', dark: false },
    sandstone: { name: 'Sandstone', description: 'A touch of warmth', dark: false },
    united: { name: 'United', description: 'Ubuntu-inspired, orange passion', dark: false },
    yeti: { name: 'Yeti', description: 'A cool, friendly theme', dark: false },
    cyborg: { name: 'Cyborg', description: 'Jet black and electric blue', dark: true },
    darkly: { name: 'Darkly', description: 'Flatly in night mode', dark: true },
    slate: { name: 'Slate', description: 'Shades of gunmetal grey', dark: true },
    solar: { name: 'Solar', description: 'A spin on Solarized', dark: true },
    superhero: { name: 'Superhero', description: 'The brave and the blue', dark: true },
    brite: { name: 'Brite', description: 'Bright and colorful', dark: false }
};

function applyTheme(themeName) {
    if (window.AVAILABLE_THEMES && window.AVAILABLE_THEMES[themeName]) {
        const themeLink = document.getElementById('theme-stylesheet');
        if (themeLink) themeLink.href = window.AVAILABLE_THEMES[themeName];
    }
}

export const ThemeProvider = ({ children }) => {
    const [currentTheme, setCurrentTheme] = useState('bootstrap');

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            axios
                .get('/api/auth/profile', { headers: { Authorization: `Token ${token}` } })
                .then(res => {
                    // init preferences cache from server
                    preferencesService.init(res.data.preferences || {});
                    // clean up ALL watcher_* localStorage keys (everything is now in DB)
                    Object.keys(localStorage)
                        .filter(k => k.startsWith('watcher_'))
                        .forEach(k => localStorage.removeItem(k));
                    const serverTheme = res.data.theme;
                    if (serverTheme && THEMES[serverTheme]) {
                        applyTheme(serverTheme);
                        setCurrentTheme(serverTheme);
                    }
                })
                .catch(() => {
                    preferencesService.init({});
                });
        }
    }, []);

    const changeTheme = (themeName) => {
        if (!THEMES[themeName]) return;
        if (!window.AVAILABLE_THEMES || !window.AVAILABLE_THEMES[themeName]) return;
        applyTheme(themeName);
        setCurrentTheme(themeName);
        const token = localStorage.getItem('token');
        if (token) {
            axios
                .patch('/api/auth/profile', { theme: themeName }, { headers: { Authorization: `Token ${token}` } })
                .catch(() => {});
        }
    };

    const value = {
        currentTheme,
        currentThemeConfig: THEMES[currentTheme] || THEMES.flatly,
        availableThemes: THEMES,
        changeTheme
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within a ThemeProvider');
    return context;
};
