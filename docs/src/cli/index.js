import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generate, generateFontToSTL } from "../core/textPlate.js";

const FONT_EXTS = [".ttf", ".otf", ".ttc"];
const DEFAULT_FULL_SET_OUTPUT_DIR = path.join("output", "alphabet-all-fonts");
const DEFAULT_FULL_SET_LETTER_HEIGHT = 3;
const DEFAULT_FULL_SET_CHARACTER_HEIGHT = 50;
const DEFAULT_BASE_SET_SUBDIR = "base";
const DEFAULT_FULL_SET_SUBDIR = "full";

function getProjectRoot() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(dir, "..", "..");
}

function getFontsDir() {
  return path.join(getProjectRoot(), "fonts");
}

function getCacheDir() {
  return path.join(getProjectRoot(), "cache");
}

async function listAvailableFonts() {
  const fontsDir = getFontsDir();
  let entries;
  try {
    entries = await fs.readdir(fontsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const fonts = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!FONT_EXTS.includes(ext)) continue;
    const name = path.basename(entry.name, ext);
    fonts.push({ name, file: entry.name });
  }

  // Deterministic order
  fonts.sort((a, b) => a.name.localeCompare(b.name));
  return fonts;
}

function getPreferredDefaultFont(fonts) {
  const pick = ["OpenSans-Bold", "Roboto-Bold", "OpenSans-Regular", "Roboto-Regular"];
  const byName = new Map(fonts.map((f) => [f.name.toLowerCase(), f]));
  for (const candidate of pick) {
    const found = byName.get(candidate.toLowerCase());
    if (found) return found;
  }
  return fonts[0] || null;
}

/**
 * Get font path: check built-in fonts, then cache, then try to download
 */
async function resolveFontPath(params) {
  const fonts = await listAvailableFonts();

  // If fontName is specified, use any matching file from fonts/
  if (params.fontName) {
    const target = String(params.fontName).trim().toLowerCase();
    const found = fonts.find((f) => f.name.toLowerCase() === target);
    if (found) {
      const fontPath = path.join(getFontsDir(), found.file);
      try {
        await fs.access(fontPath);
        return fontPath;
      } catch {
        // Fall through to the error below.
      }
    }
  }
  
  // If fontPath is provided and relative, resolve it
  if (params.fontPath) {
    if (path.isAbsolute(params.fontPath)) {
      return params.fontPath;
    }
    // Try relative to input file location
    return params.fontPath;
  }
  
  // If fontUrl is provided, try to download and cache
  if (params.fontUrl) {
    const fontFileName = params.fontUrl.split('/').pop().split('?')[0] || 'font.ttf';
    const cachePath = path.join(getCacheDir(), fontFileName);
    
    try {
      await fs.access(cachePath);
      return cachePath;
    } catch {
      // Download font
      try {
        const res = await fetch(params.fontUrl);
        if (!res || !res.ok) throw new Error(`HTTP ${res?.status}`);
        const buf = await res.arrayBuffer();
        await fs.mkdir(getCacheDir(), { recursive: true });
        await fs.writeFile(cachePath, new Uint8Array(buf));
        return cachePath;
      } catch (e) {
        console.error(`Could not download font from ${params.fontUrl}: ${e.message}`);
      }
    }
  }
  
  // Default: prefer common names, otherwise first detected font.
  const preferred = getPreferredDefaultFont(fonts);
  if (preferred) {
    const defaultFontPath = path.join(getFontsDir(), preferred.file);
    try {
      await fs.access(defaultFontPath);
      return defaultFontPath;
    } catch {
      // Fall through.
    }
  }

  throw new Error("No font available. Put TTF/OTF files into `fonts/`, or provide fontPath/fontUrl.");
}

function formatFontList(fontNames) {
  const max = 30;
  const preview = fontNames.slice(0, max);
  const more = fontNames.length > preview.length ? `\n  ... and ${fontNames.length - preview.length} more` : "";
  return preview.length ? preview.map((n) => `  - ${n}`).join("\n") + more : "  (none detected)";
}

async function printHelp() {
  const fonts = await listAvailableFonts();
  const fontNames = fonts.map((f) => f.name);

  console.log(`
Font to STL Generator (Node CLI)

Generate 3D STL files from text using TTF/OTF fonts.

Usage:
  npm run generate -- --input examples/example.json [--output output/text.stl]

Modes:
  - "separate": Generate individual STL files for each letter (output must be a directory)
  - "combined": Generate single STL file with all text (default)

Required:
  --input <file>     Input JSON with parameters (text, mode, letterHeight, etc.)

Optional:
  --output <path>    Output STL path or directory (default: output/)
  --generate-base-set  Generate base character set [a-z,A-Z,0-9] for all fonts
  --generate-full-set  Generate full multilingual character set for all fonts
  --generate-both-sets  Generate both base and full sets for all fonts
  --characterHeight <mm>  Character height for set generation (default: 50)
  --letterHeight <mm>     Letter extrusion for set generation (default: 3)
  --debug            Log detailed information to stderr
  --help             Show help

Fonts are loaded from the local \`fonts/\` directory.
Use "fontName" in JSON where \`fontName === filename without extension\`.
Detected fonts:
${formatFontList(fontNames)}

Example JSON (separate letters):
  {
    "text": "HELLO",
    "mode": "separate",
    "letterHeight": 5,
    "characterHeight": 20,
    "fontName": "OpenSans-Bold"
  }

Example JSON (combined with plate):
  {
    "text": "HELLO",
    "mode": "combined",
    "letterHeight": 3,
    "characterHeight": 20,
    "spacing": 1,
    "addPlate": true,
    "plateThickness": 2,
    "platePadding": 3,
    "fontName": "Roboto-Bold"
  }
`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "help") {
      args.help = true;
      continue;
    }
    if (key === "debug") {
      args.debug = true;
      continue;
    }
    if (key === "generate-full-set") {
      args.generateFullSet = true;
      continue;
    }
    if (key === "generate-base-set") {
      args.generateBaseSet = true;
      continue;
    }
    if (key === "generate-both-sets") {
      args.generateBothSets = true;
      continue;
    }
    const value = argv[i + 1];
    if (value == null || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function sanitizeFilePart(value, fallback = "output") {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function extractFontName(params) {
  if (params.fontName) return String(params.fontName);
  if (params.fontPath) return path.parse(String(params.fontPath)).name;
  if (params.fontUrl) {
    const tail = String(params.fontUrl).split("/").pop()?.split("?")[0] || "";
    return path.parse(tail).name;
  }
  return "font";
}

function buildCombinedDefaultName(params, resultMeta) {
  const textPart = sanitizeFilePart(resultMeta?.text || params.text || "text");
  const fontPart = sanitizeFilePart(extractFontName(params), "font");
  const modePart = sanitizeFilePart(params.mode || "combined");
  return `${textPart}_${fontPart}_${modePart}.stl`;
}

function buildSeparateLetterName(letterChar, params, usedNames) {
  const charPart = sanitizeFilePart(letterChar, "letter");
  const fontPart = sanitizeFilePart(extractFontName(params), "font");
  const codePart = Array.from(String(letterChar))
    .map((ch) => ch.codePointAt(0).toString(16).toUpperCase())
    .join("-");
  const base = `${charPart}_U${codePart}_${fontPart}`;
  const seen = usedNames.get(base) ?? 0;
  usedNames.set(base, seen + 1);
  const uniqueSuffix = seen === 0 ? "" : `_${seen + 1}`;
  return `${base}${uniqueSuffix}.stl`;
}

function buildFullAlphabetSetText() {
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const polish = "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ";
  const german = "äöüßÄÖÜ";
  const extraLatin = "áàâãåæçéèêëíìîïñóòôõøúùûýÿÁÀÂÃÅÆÇÉÈÊËÍÌÎÏÑÓÒÔÕØÚÙÛÝČčĎďĚěŇňŘřŠšŤťŮůŽž";

  const ordered = `${lowercase}${uppercase}${digits}${polish}${german}${extraLatin}`;
  const seen = new Set();
  let unique = "";
  for (const ch of ordered) {
    if (seen.has(ch)) continue;
    seen.add(ch);
    unique += ch;
  }
  return unique;
}

function buildBaseAlphabetSetText() {
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  return `${lowercase}${uppercase}${digits}`;
}

async function generateSetForAllFonts(args, options) {
  const fonts = await listAvailableFonts();
  if (fonts.length === 0) {
    throw new Error("No fonts available. Put TTF/OTF files into `fonts/` first.");
  }

  const text = options.text;
  const outputRoot = args.output || DEFAULT_FULL_SET_OUTPUT_DIR;
  const letterHeight = Number(args.letterHeight ?? DEFAULT_FULL_SET_LETTER_HEIGHT);
  const characterHeight = Number(args.characterHeight ?? DEFAULT_FULL_SET_CHARACTER_HEIGHT);
  if (!Number.isFinite(letterHeight) || letterHeight <= 0) {
    throw new Error("--letterHeight must be a positive number");
  }
  if (!Number.isFinite(characterHeight) || characterHeight <= 0) {
    throw new Error("--characterHeight must be a positive number");
  }

  await fs.mkdir(outputRoot, { recursive: true });
  console.log(`Generating ${options.label} for ${fonts.length} fonts...`);
  console.log(`Charset size: ${Array.from(text).length} characters`);
  console.log(`Output root: ${outputRoot}\n`);

  let successCount = 0;
  let failCount = 0;
  for (const font of fonts) {
    const outputDir = options.subDir
      ? path.join(outputRoot, sanitizeFilePart(font.name, "font"), options.subDir)
      : path.join(outputRoot, sanitizeFilePart(font.name, "font"));
    await fs.mkdir(outputDir, { recursive: true });
    const params = {
      text,
      mode: "separate",
      letterHeight,
      characterHeight,
      fontName: font.name,
      fontPath: path.join(getFontsDir(), font.file),
    };

    try {
      const result = await generateFontToSTL(params, { debug: args.debug });
      const usedNames = new Map();
      for (const letter of result.letters) {
        const filename = buildSeparateLetterName(letter.char, params, usedNames);
        await fs.writeFile(path.join(outputDir, filename), letter.stl, "utf8");
      }
      successCount += 1;
      console.log(`- ${font.name}: ${result.letters.length} files`);
    } catch (error) {
      failCount += 1;
      console.error(`- ${font.name}: FAILED (${error.message})`);
    }
  }

  console.log(`\nDone. ${options.label} generation complete. Success: ${successCount}, failed: ${failCount}.`);
}

async function generateFullSetForAllFonts(args) {
  return generateSetForAllFonts(args, {
    text: buildFullAlphabetSetText(),
    label: "full character set",
  });
}

async function generateBaseSetForAllFonts(args) {
  return generateSetForAllFonts(args, {
    text: buildBaseAlphabetSetText(),
    label: "base alphabet set",
  });
}

async function generateBothSetsForAllFonts(args) {
  await generateSetForAllFonts(args, {
    text: buildBaseAlphabetSetText(),
    subDir: DEFAULT_BASE_SET_SUBDIR,
    label: "base alphabet set",
  });
  await generateSetForAllFonts(args, {
    text: buildFullAlphabetSetText(),
    subDir: DEFAULT_FULL_SET_SUBDIR,
    label: "full character set",
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    await printHelp();
    return;
  }

  if (args.generateFullSet) {
    await generateFullSetForAllFonts(args);
    return;
  }
  if (args.generateBaseSet) {
    await generateBaseSetForAllFonts(args);
    return;
  }
  if (args.generateBothSets) {
    await generateBothSetsForAllFonts(args);
    return;
  }

  if (!args.input) {
    throw new Error("Missing required --input <file>.");
  }

  const inputAbsolute = path.resolve(args.input);
  const inputRaw = await fs.readFile(inputAbsolute, "utf8");
  let params;
  try {
    params = JSON.parse(inputRaw);
  } catch {
    throw new Error(`Invalid JSON in ${args.input}`);
  }

  // Resolve font path (built-in, cache, or download)
  const fontPath = await resolveFontPath(params);
  params.fontPath = fontPath;
  
  if (args.debug) {
    console.error(`[debug] Using font: ${fontPath}`);
  }

  // Check if this is old format (rectangleWidth) or new format (mode)
  const isOldFormat = params.rectangleWidth !== undefined;
  const mode = params.mode || "combined";

  if (isOldFormat) {
    // Old text-plate format
    const outputPath = args.output || path.join("output", "plate.stl");
    const { stl, meta } = await generate(params, { name: args.name, debug: args.debug });
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, stl, "utf8");
    console.log("Output generated successfully (legacy text-plate mode).");
    console.log(`Path: ${outputPath}`);
    console.log("Meta:", meta);
  } else {
    // New font-to-stl format
    const result = await generateFontToSTL(params, { debug: args.debug });
    
    if (result.mode === "separate") {
      // Separate letters - save each to its own file
      const outputDir = args.output || "output";
      await fs.mkdir(outputDir, { recursive: true });
      const usedNames = new Map();
      
      for (const letter of result.letters) {
        const filename = buildSeparateLetterName(letter.char, params, usedNames);
        const filepath = path.join(outputDir, filename);
        await fs.writeFile(filepath, letter.stl, "utf8");
        console.log(`Generated: ${filepath}`);
      }
      
      console.log(`\nTotal: ${result.letters.length} letter files in ${outputDir}`);
    } else {
      // Combined mode - single file
      const outputPath = args.output || path.join("output", buildCombinedDefaultName(params, result.meta));
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, result.stl, "utf8");
      console.log("Output generated successfully.");
      console.log(`Path: ${outputPath}`);
      console.log("Meta:", result.meta);
    }
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  if (error.stack) console.error(error.stack);
  process.exitCode = 1;
});
