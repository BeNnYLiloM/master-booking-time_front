import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'html-transform',
      transformIndexHtml(html) {
        return html.replace(
          '%VITE_YANDEX_MAPS_KEY%',
          process.env.VITE_YANDEX_MAPS_KEY || ''
        );
      },
    },
  ],
  server: {
    host: true,
    allowedHosts: ['localhost', '.loca.lt', '.trycloudflare.com', '.lhr.life', '.pinggy.link', '.serveo.net', '.localhost.run', '.ngrok-free.app', '.ngrok-free.dev', '.ngrok.io'],
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
})
