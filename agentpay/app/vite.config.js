import { defineConfig } from 'vite';

export default defineConfig({
  root: 'agentpay/app',
  base: '/agentpay/',
  build: {
    outDir: '../../docs',
    emptyOutDir: true,
  },
});
