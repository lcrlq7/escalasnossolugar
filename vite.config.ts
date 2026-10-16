import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          fullcalendar: [
            '@fullcalendar/core', '@fullcalendar/react', '@fullcalendar/daygrid',
            '@fullcalendar/timegrid', '@fullcalendar/list', '@fullcalendar/interaction',
          ],
          charts: ['recharts'],
          pdf: ['jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
})
