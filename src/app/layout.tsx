import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bài Thi Chứng Chỉ Tư Vấn Bán Hàng | Sales Consultant Certificate",
  description:
    "Hệ thống thi trực tuyến chứng chỉ Tư Vấn Bán Hàng chuyên nghiệp. 50 câu hỏi trắc nghiệm, thời gian 30 phút.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
  themeColor: "#0a0e1a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-dvh flex flex-col">{children}</body>
    </html>
  );
}
