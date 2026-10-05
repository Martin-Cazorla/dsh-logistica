import './globals.scss';
import { ReactNode } from 'react';
import { AuthProvider } from '@/context/AuthContext';

export const metadata = {
  title: 'DSH Logística - WMS / ERP',
  description: 'Sistema de Gestión de Almacenes y Envíos Mayoristas',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
