import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Header } from "./_components/Header";
import { SessionProvider } from "./_components/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Brightline Ops Requests",
  description: "Submit a request to the Brightline Ops team and follow it through to done.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={geistSans.variable} suppressHydrationWarning>
      <body>
        <SessionProvider>
          <Header />
          <main className="container">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
