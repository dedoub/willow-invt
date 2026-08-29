import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { LayoutWrapper } from "@/components/layout/layout-wrapper";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // template은 하위 라우트가 title을 정했을 때만 쓰인다. 각 화면은 제 이름만 적고
  // 회사 이름은 여기서 한 번만 붙인다 — 탭을 여러 개 띄워도 어느 화면인지 앞에서 읽힌다.
  title: {
    default: "Willow Investments",
    template: "%s · Willow Investments",
  },
  description: "윌로우인베스트먼트 사내 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <Providers>
          <LayoutWrapper>{children}</LayoutWrapper>
        </Providers>
      </body>
    </html>
  );
}
