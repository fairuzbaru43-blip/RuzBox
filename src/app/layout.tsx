import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RuzBox — Your Files, Your Cloud",
  description: "Pengelola file online untuk menjelajahi folder bersama melalui TeraBox dengan autentikasi Supabase.",
  applicationName: "RuzBox",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id" data-theme="dark"><body>{children}</body></html>;
}
