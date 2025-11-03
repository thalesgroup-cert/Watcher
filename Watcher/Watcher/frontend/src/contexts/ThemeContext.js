import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const THEMES = {
    bootstrap: {
        name: 'Watcher Default',
        description: 'Classic blue theme',
        preview: '/static/img/themes/bootstrap-preview.png'
    },
    flatly: {
        name: 'Flatly',
        description: 'Flat and modern',
        preview: '/static/img/themes/flatly-preview.png'
    },
    cyborg: {
        name: 'Cyborg',
        description: 'Jet black and electric blue',
        preview: '/static/img/themes/cyborg-preview.png'
    },
    superhero: {
        name: 'Superhero',
        description: 'The brave and the blue',
        preview: '/static/img/themes/superhero-preview.png'
    },
    brite: {
        name: 'Brite',
        description: 'Bright and colorful theme',
        preview: '/static/img/themes/brite-preview.png'
    }
};

export const ThemeProvider = ({ children }) => {
    const [currentTheme, setCurrentTheme] = useState(() => {
        return localStorage.getItem('watcher_localstorage_theme') || 'bootstrap';
    });

    const changeTheme = (themeName) => {
        if (THEMES[themeName] && window.AVAILABLE_THEMES[themeName]) {
            const themeLink = document.getElementById('theme-stylesheet');
            if (themeLink) {
                themeLink.href = window.AVAILABLE_THEMES[themeName];
                setCurrentTheme(themeName);
                localStorage.setItem('watcher_localstorage_theme', themeName);
            }
        }
    };

    useEffect(() => {
        const savedTheme = localStorage.getItem('watcher_localstorage_theme');
        if (savedTheme && THEMES[savedTheme]) {
            changeTheme(savedTheme);
        }
    }, []);

    const value = {
        currentTheme,
        currentThemeConfig: THEMES[currentTheme],
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
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};