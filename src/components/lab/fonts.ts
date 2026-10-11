import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

// The Lab's own typefaces, exposed as CSS variables on the Lab's root only.
const labSans = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-lab-sans",
  display: "swap",
  weight: ["400", "500", "600"],
});

const labMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-lab-mono",
  display: "swap",
  weight: ["400", "500"],
});

export const labFontClasses = `${labSans.variable} ${labMono.variable}`;
