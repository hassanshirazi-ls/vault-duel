import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Workspace packages export TypeScript source ("exports": "./src/index.ts"), so Vite compiles them like app code
// and JSON/keyword edits reach the HMR graph (D-176).
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
