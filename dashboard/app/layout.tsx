import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { RunProvider } from "./run-context";
import { RunSelector } from "./run-selector";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nerdy Ad Engine",
  description: "Autonomous ad generation dashboard for Varsity Tutors SAT prep",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <RunProvider>
          <nav className="border-b border-zinc-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-4">
              <Link href="/" className="text-lg font-semibold text-zinc-900">
                Nerdy Ad Engine
              </Link>
              <div className="flex gap-6 text-sm font-medium text-zinc-600">
                <Link href="/" className="hover:text-zinc-900 transition-colors">
                  Ad Library
                </Link>
                <Link href="/trends" className="hover:text-zinc-900 transition-colors">
                  Quality Trends
                </Link>
                <Link href="/showcase" className="hover:text-zinc-900 transition-colors">
                  Showcase
                </Link>
              </div>
              <div className="ml-auto flex items-center gap-5">
                <Link
                  href="/coherence"
                  className="border-l border-zinc-200 pl-5 text-xs font-medium text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  Coherence
                </Link>
                <RunSelector />
              </div>
            </div>
          </nav>
          <main className="mx-auto max-w-7xl px-6 py-8">
            {children}
          </main>
        </RunProvider>
      </body>
    </html>
  );
}
