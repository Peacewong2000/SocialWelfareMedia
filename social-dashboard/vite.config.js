import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 這裡設定代理，讓 /api 開頭的請求自動轉發給 Python 後端
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000', // Python 後端的地址
        changeOrigin: true,
        secure: false,
      }
    }
  }
})