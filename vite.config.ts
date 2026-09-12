import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
// Local static app: no hosting account, project identifier, or cloud bindings.
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  server: { host: '127.0.0.1', watch: { useFsEvents: false, usePolling: true } },
  plugins: [vinext()],
});
