import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
  },
  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, 'localhost.key')),
      cert: fs.readFileSync(path.resolve(__dirname, 'localhost.crt')),
    },
    host: true,
  },
});
