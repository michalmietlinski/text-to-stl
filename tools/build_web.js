import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

async function copyFileRelative(from, toDir) {
  const src = path.join(projectRoot, from);
  const destDir = path.join(projectRoot, toDir);
  const dest = path.join(destDir, path.basename(from));
  await fs.mkdir(destDir, { recursive: true });
  await fs.copyFile(src, dest);
}

async function copyDirRecursive(fromDir, toDir) {
  const src = path.join(projectRoot, fromDir);
  const dest = path.join(projectRoot, toDir);
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(path.relative(projectRoot, srcPath), path.relative(projectRoot, destPath));
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function main() {
  // Copy web assets
  await copyFileRelative("web/index.html", "docs");
  // Copy main.js and fix import path: in docs/, main.js and src/ are siblings (no ../)
  let mainJs = await fs.readFile(path.join(projectRoot, "web", "main.js"), "utf8");
  mainJs = mainJs.replace(/from\s+['"]\.\.\/src\//g, "from './src/");
  await fs.writeFile(path.join(projectRoot, "docs", "main.js"), mainJs);

  // Copy src directory for imports to work
  await copyDirRecursive("src", "docs/src");
  console.log("Source files copied to docs/src/");
  
  // Sync fonts (for both /web and /docs) from repo-level `fonts/`
  const rootFontsDir = path.join(projectRoot, "fonts");
  const webFontsDir = path.join(projectRoot, "web", "fonts");
  const docsFontsDir = path.join(projectRoot, "docs", "fonts");

  await fs.mkdir(webFontsDir, { recursive: true });
  await fs.mkdir(docsFontsDir, { recursive: true });

  const allowedExts = new Set([".ttf", ".otf", ".ttc"]);
  let rootEntries = [];
  try {
    rootEntries = await fs.readdir(rootFontsDir, { withFileTypes: true });
  } catch {
    rootEntries = [];
  }

  const fonts = [];
  for (const entry of rootEntries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!allowedExts.has(ext)) continue;
    const name = path.basename(entry.name, ext);
    fonts.push({ name, file: entry.name });
  }

  fonts.sort((a, b) => a.name.localeCompare(b.name));

  for (const font of fonts) {
    const srcPath = path.join(rootFontsDir, font.file);
    await fs.copyFile(srcPath, path.join(webFontsDir, font.file));
    await fs.copyFile(srcPath, path.join(docsFontsDir, font.file));
  }

  const manifest = {
    fonts: fonts.map((f) => ({
      name: f.name,
      url: `fonts/${f.file}`,
    })),
  };

  await fs.writeFile(path.join(webFontsDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(docsFontsDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`Fonts synced to web/fonts and docs/fonts (count=${fonts.length}).`);
  
  console.log("Web assets copied to docs/. Deploy docs/ for GitHub Pages.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
