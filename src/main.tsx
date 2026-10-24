import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// تسجيل Service Worker (للتثبيت على الشاشة الرئيسية والعمل عند انقطاع النت).
// لا يمسّ تسجيل الدخول ولا قاعدة البيانات: كل طلبات Firebase/Google تمرّ للشبكة كما هي.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[PWA] تعذّر تسجيل الـ Service Worker', err);
    });
  });
}
