import type { Metadata } from "next";
import "@/frontend/styles/globals.css";

export const metadata: Metadata = {
  title: "ทะเบียนครุภัณฑ์ · คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม",
  description: "ทะเบียนครุภัณฑ์ การตรวจนับ การโอนย้าย และการอนุมัติ มหาวิทยาลัยกาฬสินธุ์",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
