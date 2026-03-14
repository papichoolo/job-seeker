import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Job Seeker | Where Jobs Come to You",
  description: "Upload your resume and let AI find your perfect job match. Job Seeker uses intelligent profile analysis and smart reranking to bring the best opportunities straight to you.",
  keywords: ["job search", "AI job matching", "resume parser", "career finder", "job seeker", "AI-powered hiring"],
  authors: [{ name: "Job Seeker" }],
  openGraph: {
    title: "Job Seeker | Where Jobs Come to You",
    description: "Stop searching. Start matching. Upload your resume and let AI bring the best job opportunities to you.",
    type: "website",
    siteName: "Job Seeker",
  },
  twitter: {
    card: "summary_large_image",
    title: "Job Seeker | Where Jobs Come to You",
    description: "Stop searching. Start matching. Upload your resume and let AI bring the best job opportunities to you.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=TikTok+Sans:opsz,wght@12..36,300..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${geistMono.variable} antialiased`}
        style={{ fontFamily: "'TikTok Sans', sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}

