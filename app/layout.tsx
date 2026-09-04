import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: '흥덕 업무함',
  description: '학교 업무 자료를 빠르게 찾고 다시 쓰는 교사용 자료 허브',
  openGraph: {
    title: '흥덕 업무함',
    description: '학교 업무 자료를 빠르게 찾고 다시 써요',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: '흥덕 업무함',
    description: '학교 업무 자료를 빠르게 찾고 다시 써요',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
