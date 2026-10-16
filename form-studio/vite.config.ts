import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env': '{}',
  },
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  build: {
    outDir: 'static/calendar-assets', emptyOutDir: true,
    lib: { entry: 'frontend/calendar.tsx', name: 'FormCalendar', formats: ['iife'], fileName: () => 'calendar.js' },
    rollupOptions: { output: { assetFileNames: 'calendar.[ext]' } },
  },
});
