import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import AppNav from "@/components/AppNav";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import ChatProvider from "@/components/chat/ChatProvider";
import ChatShell from "@/components/chat/ChatShell";
import ChatPanel from "@/components/chat/ChatPanel";

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
        <ServiceWorkerRegistration />
        {/* Le provider porte l'état ouvert/fermé du panneau d'assistant ;
            les pages restent des Server Components (slot children). */}
        <ChatProvider>
          <AppNav />
          <ChatShell>{children}</ChatShell>
          <ChatPanel />
        </ChatProvider>
      </body>
    </html>
  );
}
