import type { Metadata, Viewport } from "next";
import { Fraunces, Newsreader, Source_Sans_3, Space_Grotesk } from "next/font/google";
import { DEFAULT_VISUAL_THEME, visualThemeInitScript } from "@/lib/visual-theme";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
  preload: false,
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Sorta",
  description: "A Trello-style ranking board for games, movies, shows, and more.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff4d6" },
    { media: "(prefers-color-scheme: dark)", color: "#1f2937" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_VISUAL_THEME}
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${fraunces.variable} ${sourceSans.variable} ${newsreader.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: visualThemeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
