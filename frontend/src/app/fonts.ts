import { El_Messiri, IBM_Plex_Sans_Arabic } from "next/font/google";

/* The Arabic cut also carries Latin glyphs, so one family covers the English interface and a
   board the tutor writes in Arabic. It is not a variable font: the weights are listed. */
export const ibmPlexSans = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm-plex",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/* Display face for headings on an Arabic board. */
export const elMessiri = El_Messiri({
  variable: "--font-el-messiri",
  subsets: ["arabic", "latin"],
  display: "swap",
});
