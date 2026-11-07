import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "PokeRNG",
  description: "Open unofficial Pokémon card packs and keep a local collection.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="pokerng-theme" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("pokerng-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
