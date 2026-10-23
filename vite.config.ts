import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          import: path.resolve(__dirname, 'import.html'),
        },
      },
    },
    server: {
      // السماح بالوصول عبر نطاقات المعاينة/الاستضافة (بدون هذا تُرفض الطلبات بـ 403
      // عند فتح التطبيق من دومين غير localhost).
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              // استبعاد مجلد قاعدة البيانات: كان أي كتابة في data/ تُعيد تحميل الصفحة
              // بالكامل أثناء الاستخدام (فتضيع الحالة وتظهر شاشة البداية من جديد).
              ignored: ['**/data/**'],
            },
    },
  };
});
