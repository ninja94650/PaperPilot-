import type { Metadata } from "next";
import "./globals.css";
import "./auth.css";

export const metadata: Metadata = {
  title: "PaperPilot — Every document, one workspace",
  description: "A calmer way to edit, organize, sign and transform your documents.",
  applicationName: "PaperPilot",
  keywords: ["PDF editor", "PDF tools", "document converter", "merge PDF", "sign PDF"]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
