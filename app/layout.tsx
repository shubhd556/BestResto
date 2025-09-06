import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "🍽️ Best Resto – Find Top Restaurants Near You",
  description:
    "Discover the best restaurants near you with filters for cuisine, ratings, veg/non-veg, and services. Powered by Google Places API and deployed on Vercel.",
  keywords: [
    "restaurants",
    "food search",
    "best restaurants",
    "veg non-veg",
    "dine-in",
    "delivery",
    "takeout",
    "Google Places API",
    "Best Resto",
  ],
  authors: [{ name: "Shubham Dudhal", url: "https://github.com/shubhd556" }],
  openGraph: {
    title: "🍽️ Best Resto – Find Top Restaurants Near You",
    description:
      "Search and discover the top-rated restaurants nearby. Customize by cuisine, ratings, dietary preferences, and services.",
    url: "https://best-resto-shubhams-projects-dd9b6f23.vercel.app/",
    siteName: "Best Resto",
    images: [
      {
        url: "/screenshot.png", // add a screenshot in /public
        width: 1200,
        height: 630,
        alt: "Best Resto – Find Top Restaurants",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "🍽️ Best Resto – Find Top Restaurants Near You",
    description:
      "Discover the best restaurants near you with cuisine, rating, and service filters.",
    creator: "@shubhd556",
    images: ["/screenshot.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
