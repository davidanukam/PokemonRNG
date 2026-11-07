import type { Metadata } from "next";
import { Fraunces, Public_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const font = Public_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-public-sans",
});

const rarity = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: "PokeRNG",
  description: "Open unofficial Pokémon card packs and keep a local collection.",
  icons: {
    icon: [{ url: "/pokeball.png", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${font.variable} ${rarity.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="pokerng-theme" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("pokerng-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
