import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next";

import { TRPCReactProvider } from "@/trpc/client";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meet.AI",
  description:
    "AI-powered meetings — an agent that joins your call, listens, answers, and writes the summary.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
        <body className={`${inter.className} antialiased`}>
          <NuqsAdapter>
        <TRPCReactProvider>
          <Toaster />
          {children}
        </TRPCReactProvider>
        </NuqsAdapter>
        </body>
      </html>
    
  );
}
