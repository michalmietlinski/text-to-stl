# Font to STL

Generate 3D STL files from text using any TTF/OTF font. Create individual letter files or combined text with optional base plate that automatically sizes to fit your text.

## Features

- **Separate Letters Mode**: Generate individual STL files for each letter
- **Combined Mode**: Generate a single STL file with all letters arranged horizontally
- **Built-in Fonts**: 4 professional fonts included (Open Sans, Roboto - Bold & Regular)
- **Custom Fonts**: Use any TTF/OTF font file (local or from URL)
- **Font Caching**: Downloads fonts once and caches for offline use
- **Text-Sized Design**: Define character height - base plate adapts to text (not the other way around)
- **Optional Base Plate**: Add a plate behind text that automatically sizes to fit

## Installation

```bash
cd font-to-stl
npm install
```

## Usage

### CLI

**Generate separate letter files:**

```bash
node src/cli/index.js --input examples/example-separate.json --output output/letters/
```

This creates individual files like `output/letters/H.stl`, `output/letters/E.stl`, etc.

**Generate combined text in one file:**

```bash
node src/cli/index.js --input examples/example-combined.json --output output/text.stl
```

This creates `output/text.stl` with all letters arranged horizontally.

**Quick test (npm):**

```bash
npm run generate -- --input examples/example-combined.json
```

### Built-in Fonts

Four professional fonts are included - use `fontName` parameter:

- **OpenSans-Bold** - Clean, modern sans-serif (bold)
- **OpenSans-Regular** - Clean, modern sans-serif (regular weight)
- **Roboto-Bold** - Google's signature font (bold)
- **Roboto-Regular** - Google's signature font (regular weight)

Example using built-in font:
```json
{
  "text": "HELLO",
  "fontName": "OpenSans-Bold"
}
```

You can also use custom fonts via `fontPath` or `fontUrl`. See [fonts/README.md](fonts/README.md) for details.

### Input JSON Parameters

| Parameter          | Description                                    | Default   |
|--------------------|------------------------------------------------|-----------|
| `text`             | Text to generate                               | "HELLO"   |
| `mode`             | "separate" or "combined"                       | "combined"|
| `letterHeight`     | Extrusion height of the letters (mm)           | 5         |
| `characterHeight`  | Height of characters in mm                     | 20        |
| `spacing`          | Letter spacing in combined mode (mm)           | 0         |
| `fontName`         | Built-in font name (see Built-in Fonts)        | -         |
| `fontPath`         | Path to custom TTF/OTF file                    | -         |
| `fontUrl`          | URL to custom TTF/OTF font (cached)            | -         |
| `addPlate`         | Add base plate behind text (optional)          | false     |
| `plateThickness`   | Thickness of base plate (mm)                   | 2         |
| `platePadding`     | Padding around text on plate (mm)              | 2         |

**Note:** Provide one of: `fontName` (built-in), `fontPath` (custom file), or `fontUrl` (download & cache).

### Examples

**Separate letters without base plate:**
```json
{
  "mode": "separate",
  "text": "HELLO",
  "letterHeight": 5,
  "characterHeight": 20,
  "fontName": "OpenSans-Bold"
}
```

**Combined text with automatic base plate:**
```json
{
  "mode": "combined",
  "text": "HELLO",
  "letterHeight": 3,
  "characterHeight": 20,
  "spacing": 1,
  "addPlate": true,
  "plateThickness": 2,
  "platePadding": 3,
  "fontName": "Roboto-Bold"
}
```

**Using custom font from URL:**
```json
{
  "text": "WORLD",
  "letterHeight": 4,
  "characterHeight": 25,
  "fontUrl": "https://example.com/fonts/CustomFont.ttf"
}
```

### Web UI

**Local Development:**

```bash
npm run dev
```

Then open **http://localhost:3000/web/** in your browser (note the `/web/` at the end).

**Build for deployment:**

```bash
npm run build-web
```

This builds to the `docs/` folder. Deploy via GitHub Pages (Settings → Pages → Deploy from `docs/` folder). Use the **project URL** (with repo name), e.g. **https://yourusername.github.io/text-to-stl/** — not the root `https://yourusername.github.io/`, or script imports will 404.

**Test the built version:**

```bash
npm run dev-docs
```

Then open **http://localhost:3000**

**Note:** Do not open `web/index.html` directly in your browser - this will cause CORS errors. Always use the dev server for local testing.

## License

MIT
