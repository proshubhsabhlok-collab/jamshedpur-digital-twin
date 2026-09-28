import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jamshedpur Digital Twin',
  description: 'Interactive 3D smart-city simulation for Jamshedpur, Jharkhand.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
