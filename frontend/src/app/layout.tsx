import type { Metadata } from "next";
import { elMessiri, ibmPlexSans } from "./fonts";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Becan — Your personal course tutor",
  description:
    "Becan explains your university course by voice, writes on a board as it goes, and asks questions to check your understanding.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ibmPlexSans.variable} ${elMessiri.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-ground font-sans">{children}</body>
    </html>
  );
}
