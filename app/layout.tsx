import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenAI-Native Diagram and Image Editor",
  description: "Stateful multimodal editing prototype with versioned persistence."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
