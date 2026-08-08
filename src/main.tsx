import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { getRouter } from './router.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import './styles.css';

const router = getRouter();

// Register Service Worker and handle background click navigation
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('Service Worker registered successfully:', reg.scope);
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });
  });

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'navigate') {
      router.navigate({ to: event.data.url });
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);

