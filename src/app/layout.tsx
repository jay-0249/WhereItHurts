import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Public_Sans, JetBrains_Mono } from "next/font/google";
import { en } from "@/i18n/en";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-bricolage",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-public-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: en.app.name,
  description: en.app.description,
};

export const viewport: Viewport = {
  themeColor: "#F6F8F7",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${publicSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">
        {children}
        <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-0 px-5 pb-2 text-center">
          <p className="text-chip text-slate">{en.app.disclaimer}</p>
        </footer>
      </body>
    </html>
  );
}
