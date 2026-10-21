import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RuzBox — Your Files, Your Cloud",
  description: "File Manager Online untuk mengelola file dengan integrasi TeraBox dan database Supabase.",
  applicationName: "RuzBox",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id" data-theme="dark"><body>{children}</body></html>;
}
