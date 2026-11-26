import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Django serves frontend/static/frontend/main.js (+ main.css) through the `{% static %}` tag.
const frontendDir = path.resolve(__dirname, 'Watcher/frontend');

export default defineConfig(({ mode }) => ({
    plugins: [react()],
    define: {
        'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production'),
    },
    base: '/static/frontend/',
    build: {
        outDir: path.join(frontendDir, 'static/frontend'),
        emptyOutDir: false, // the folder also holds committed images
        sourcemap: true,
        cssCodeSplit: false,
        chunkSizeWarningLimit: 6000,
        rolldownOptions: {
            input: path.join(frontendDir, 'src/index.tsx'),
            output: {
                format: 'iife',
                entryFileNames: 'main.js',
                assetFileNames: (asset) =>
                    asset.names?.some((n) => n.endsWith('.css')) ? 'main.css' : 'assets/[name]-[hash][extname]',
                codeSplitting: false,
            },
        },
    },
}));
