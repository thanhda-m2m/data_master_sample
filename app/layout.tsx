import type {Metadata} from "next";
import {Geist, Geist_Mono} from "next/font/google";
import {FireworksBanner} from "@/components/fireworks-banner";
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
    title: "DataMaster SSO",
    description: "Enterprise SSO Authentication Gateway",
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="ja"
            className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
            suppressHydrationWarning
        >
        <body className="min-h-full flex flex-col bg-slate-50" suppressHydrationWarning>
        <FireworksBanner/>
        {children}
        </body>
        </html>
    );
}
