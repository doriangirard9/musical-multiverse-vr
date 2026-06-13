import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

export default defineConfig(({ mode }) => ({
  server: {
    ...(process.env.HTTPS && {
      https: {
        key: fs.readFileSync(path.resolve(__dirname, 'localhost.key')),
        cert: fs.readFileSync(path.resolve(__dirname, 'localhost.crt')),
      }
    }),
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['wamjamparty.i3s.univ-cotedazur.fr'],
  },
  build: {
    target: "es2022"
  },
  esbuild: {
    target: "es2022"
  },
  // Polyfill du global Node pour les dépendances transitives de Magenta
  // (typedarray-pool, ndarray-fft, ndarray-resample assument `global`).
  // Sans ça : ReferenceError au moment du chargement du chunk Magenta.
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    // Pré-bundle des SOUS-MODULES Magenta (pas le barrel complet qui tire
    // l'audio → OfflineAudioContext, incompatible worker) + TF.js + backend
    // WASM. Leur format mixte ESM/CJS exige le pré-bundling esbuild.
    include: [
      '@magenta/music/esm/music_rnn',
      '@magenta/music/esm/music_vae',
      '@magenta/music/esm/core/sequences',
      '@tensorflow/tfjs',
      '@tensorflow/tfjs-backend-wasm',
    ],
    esbuildOptions: {
      target: "es2022",
    }
  },
  assetsInclude: ['**/*.wasm'],
  worker: {
    format: 'es'
  }
}))
