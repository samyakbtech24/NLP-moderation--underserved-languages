import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Noto_Sans_Bengali,
  Noto_Sans_Devanagari,
  Noto_Sans_Kannada,
  Space_Grotesk,
} from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display-face",
  subsets: ["latin"],
  weight: ["600", "800"],
  display: "swap",
});

const body = Space_Grotesk({
  variable: "--font-body-face",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

// Indic faces so Hindi / Marathi / Kannada / Bengali render consistently everywhere.
const deva = Noto_Sans_Devanagari({ variable: "--font-deva", subsets: ["devanagari"], weight: ["400", "700"], display: "swap" });
const knda = Noto_Sans_Kannada({ variable: "--font-knda", subsets: ["kannada"], weight: ["400", "700"], display: "swap" });
const beng = Noto_Sans_Bengali({ variable: "--font-beng", subsets: ["bengali"], weight: ["400", "700"], display: "swap" });

export const metadata: Metadata = {
  title: "FairMod — Explainable moderation for Indic languages",
  description:
    "Explainable abusive-comment detection for Hindi, Kannada, Marathi, and Bengali with Integrated Gradients word highlights.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${display.variable} ${body.variable} ${deva.variable} ${knda.variable} ${beng.variable} antialiased`}
      >
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
