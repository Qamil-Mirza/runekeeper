import type { Metadata } from "next";
import { Newsreader, Work_Sans } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-label",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Runekeeper",
  description: "Plan your week through conversation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${newsreader.variable} ${workSans.variable}`}>
      <body className="bg-surface text-on-surface antialiased">
        {/* Skip navigation */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-tertiary focus:text-on-tertiary focus:px-4 focus:py-2 font-label text-label-md"
        >
          Skip to main content
        </a>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
