import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperPilot — Advanced Document Workspace & PDF SaaS",
  description: "The modern document platform for merging, editing, converting, signing and optimizing PDFs and Office files with instant browser performance.",
  applicationName: "PaperPilot",
  keywords: [
    "PDF editor",
    "PDF merger",
    "document workspace",
    "PDF tools",
    "sign PDF",
    "compress PDF",
    "convert DOCX to PDF",
    "DraftFlow"
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Great+Vibes&family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
