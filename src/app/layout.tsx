import type { Metadata } from "next";
import localFont from "next/font/local";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

// Bundled files (src/fonts), so the build fetches nothing.
const newsreader = localFont({
  src: [
    { path: "../fonts/newsreader-latin.woff2", weight: "200 800", style: "normal" },
    { path: "../fonts/newsreader-italic-latin.woff2", weight: "200 800", style: "italic" },
  ],
  variable: "--font-newsreader",
  display: "swap",
});

const workSans = localFont({
  src: "../fonts/work-sans-latin.woff2",
  variable: "--font-work-sans",
  display: "swap",
  weight: "100 900",
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
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-tertiary focus:text-white focus:px-4 focus:py-2 font-label text-label-md"
        >
          Skip to main content
        </a>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
