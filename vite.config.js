import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

export default defineConfig(({ mode }) => ({
  server: {
    ...(mode === 'development' && {
      https: {
        key: fs.readFileSync(path.resolve(__dirname, 'localhost.key')),
        cert: fs.readFileSync(path.resolve(__dirname, 'localhost.crt')),
      }
    }),
    host: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['wamjamparty.i3s.univ-cotedazur.fr']
  },
  build: {
    target: "es2022"
  },
  esbuild: {
    target: "es2022"
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    esbuildOptions: {
      target: "es2022",
    }
  },
  assetsInclude: ['**/*.wasm'],
  worker: {
    format: 'es'
  }
}))
