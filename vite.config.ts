import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// GitHub Pages はサブパス（/otoerabi/）配信のため、本番ビルドのみ base を付ける。
// 開発サーバは '/' のまま。サンプル等のパスは import.meta.env.BASE_URL 経由で追従する。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/otoerabi/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5180, host: true },
}));
