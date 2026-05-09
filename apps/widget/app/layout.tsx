import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "OnePWS AI Chat Widget",
  description: "Embeddable multilingual chatbot for OnePWS enterprise enquiries.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={beVietnamPro.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
