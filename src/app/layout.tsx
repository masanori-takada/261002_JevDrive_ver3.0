import type { ReactNode } from 'react';

export const metadata = { title: 'JevDrive' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#111', color: '#eee' }}>
        {children}
      </body>
    </html>
  );
}
