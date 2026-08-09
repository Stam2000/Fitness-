import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

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
        <div className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 safe-bottom">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
