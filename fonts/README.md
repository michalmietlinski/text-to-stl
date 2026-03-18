# Built-in Fonts

This directory contains open-source fonts that are bundled with Font to STL.

## Available Fonts

### Open Sans
- **OpenSans-Bold.ttf** - Open Sans Bold
- **OpenSans-Regular.ttf** - Open Sans Regular
- **License**: Apache License 2.0
- **Source**: https://fonts.google.com/specimen/Open+Sans

### Roboto
- **Roboto-Bold.ttf** - Roboto Bold
- **Roboto-Regular.ttf** - Roboto Regular  
- **License**: Apache License 2.0
- **Source**: https://fonts.google.com/specimen/Roboto

## Usage

In your JSON files, use the `fontName` parameter to select a built-in font:

```json
{
  "text": "HELLO",
  "fontName": "OpenSans-Bold"
}
```

Available font names:
- `OpenSans-Bold`
- `OpenSans-Regular`
- `Roboto-Bold`
- `Roboto-Regular`

## Adding Your Own Fonts

You can also use your own TTF/OTF fonts:

1. **By file path** (relative to your JSON file):
   ```json
   {
     "fontPath": "./MyFont.ttf"
   }
   ```

2. **By URL** (will be downloaded and cached):
   ```json
   {
     "fontUrl": "https://example.com/fonts/MyFont.ttf"
   }
   ```

## License

All fonts included are licensed under the Apache License 2.0, which allows for free use in both personal and commercial projects.
