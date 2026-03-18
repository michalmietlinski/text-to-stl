#!/usr/bin/env node
/**
 * Download a curated set of TTF fonts (Google Fonts, OFL) into fonts/ for CLI and web.
 * Run: npm run download-fonts
 * Then: npm run build-web (to sync web/fonts and regenerate manifest).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FONTS_DIR = path.join(ROOT, "fonts");
const GITHUB_BASE = "https://raw.githubusercontent.com/google/fonts/main";

// [url, destFilename]. Static + variable TTFs from Google Fonts GitHub (opentype.js supports both).
const FONT_ENTRIES = [
  // Static
  [`${GITHUB_BASE}/ofl/opensans/OpenSans-Bold.ttf`, "OpenSans-Bold.ttf"],
  [`${GITHUB_BASE}/ofl/opensans/OpenSans-Regular.ttf`, "OpenSans-Regular.ttf"],
  [`${GITHUB_BASE}/ofl/roboto/Roboto-Bold.ttf`, "Roboto-Bold.ttf"],
  [`${GITHUB_BASE}/ofl/roboto/Roboto-Regular.ttf`, "Roboto-Regular.ttf"],
  [`${GITHUB_BASE}/ofl/lato/Lato-Regular.ttf`, "Lato-Regular.ttf"],
  [`${GITHUB_BASE}/ofl/lato/Lato-Bold.ttf`, "Lato-Bold.ttf"],
  [`${GITHUB_BASE}/ofl/poppins/Poppins-Regular.ttf`, "Poppins-Regular.ttf"],
  [`${GITHUB_BASE}/ofl/poppins/Poppins-Bold.ttf`, "Poppins-Bold.ttf"],
  [`${GITHUB_BASE}/ofl/firasans/FiraSans-Regular.ttf`, "FiraSans-Regular.ttf"],
  [`${GITHUB_BASE}/ofl/firasans/FiraSans-Bold.ttf`, "FiraSans-Bold.ttf"],
  [`${GITHUB_BASE}/ufl/ubuntu/Ubuntu-Regular.ttf`, "Ubuntu-Regular.ttf"],
  [`${GITHUB_BASE}/ufl/ubuntu/Ubuntu-Bold.ttf`, "Ubuntu-Bold.ttf"],
  // Variable (one file per family; opentype.js uses default instance)
  [`${GITHUB_BASE}/ofl/montserrat/Montserrat%5Bwght%5D.ttf`, "Montserrat-Wght.ttf"],
  [`${GITHUB_BASE}/ofl/oswald/Oswald%5Bwght%5D.ttf`, "Oswald-Wght.ttf"],
  [`${GITHUB_BASE}/ofl/raleway/Raleway%5Bwght%5D.ttf`, "Raleway-Wght.ttf"],
  [`${GITHUB_BASE}/ofl/nunito/Nunito%5Bwght%5D.ttf`, "Nunito-Wght.ttf"],
  [`${GITHUB_BASE}/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf`, "PlayfairDisplay-Wght.ttf"],
  [`${GITHUB_BASE}/ofl/worksans/WorkSans%5Bwght%5D.ttf`, "WorkSans-Wght.ttf"],
  [`${GITHUB_BASE}/ofl/sourcesans3/SourceSans3%5Bwght%5D.ttf`, "SourceSans3-Wght.ttf"],
  [`${GITHUB_BASE}/ofl/librefranklin/LibreFranklin%5Bwght%5D.ttf`, "LibreFranklin-Wght.ttf"],
  [`${GITHUB_BASE}/ofl/quicksand/Quicksand%5Bwght%5D.ttf`, "Quicksand-Wght.ttf"],
  [`${GITHUB_BASE}/ofl/merriweather/Merriweather%5Bopsz%2Cwdth%2Cwght%5D.ttf`, "Merriweather-Variable.ttf"],
];

async function download(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

// Deduplicate by dest filename (first URL wins)
function uniqueByDest(entries) {
  const seen = new Set();
  return entries.filter(([, file]) => {
    if (seen.has(file)) return false;
    seen.add(file);
    return true;
  });
}

async function main() {
  await fs.mkdir(FONTS_DIR, { recursive: true });

  const entries = uniqueByDest(FONT_ENTRIES);
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const [url, file] of entries) {
    const dest = path.join(FONTS_DIR, file);

    try {
      await fs.access(dest);
      console.log(`Skip (exists): ${file}`);
      skip++;
      continue;
    } catch {
      // file doesn't exist, download
    }

    try {
      const buf = await download(url);
      await fs.writeFile(dest, new Uint8Array(buf));
      console.log(`OK: ${file}`);
      ok++;
    } catch (e) {
      console.error(`FAIL: ${file} - ${e.message}`);
      fail++;
    }
  }

  console.log(`\nDone. Downloaded: ${ok}, skipped (existing): ${skip}, failed: ${fail}`);
  console.log(`Fonts are in ${FONTS_DIR}. Run "npm run build-web" to update web font list.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
