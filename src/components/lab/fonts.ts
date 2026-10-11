import localFont from "next/font/local";

// The Lab's own typefaces, exposed as CSS variables on the Lab's root only.
// Bundled files (src/fonts), so the build fetches nothing.
const labSans = localFont({
  src: "../../fonts/space-grotesk-latin.woff2",
  variable: "--font-lab-sans",
  display: "swap",
  weight: "300 700",
});

const labMono = localFont({
  src: "../../fonts/jetbrains-mono-latin.woff2",
  variable: "--font-lab-mono",
  display: "swap",
  weight: "100 800",
});

export const labFontClasses = `${labSans.variable} ${labMono.variable}`;
