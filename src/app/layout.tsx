import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import AppNav from "@/components/AppNav";

export const metadata: Metadata = {
  title: "Mon Coach Fitness",
  description:
    "Programmes de fitness générés par IA, adaptés à ton équipement.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Coach Fitness",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b0f14",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppNav />
        {/* Décalage réservé à la barre latérale à partir de md */}
        <div className="flex-1 md:pl-[4.5rem] lg:pl-60">
          <div className="mx-auto w-full max-w-lg px-4 pt-4 safe-bottom md:max-w-3xl md:px-6 md:pt-8 xl:max-w-5xl lg:px-8">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
