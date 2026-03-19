// Web-only ES module version of textPlate.js
import modeling from "@jscad/modeling";
import { serialize } from "@jscad/stl-serializer";
import earcut from "earcut";

const { primitives, booleans, transforms, text: textModule, geometries, extrusions } = modeling;
const { cuboid } = primitives;
const { union } = booleans;
const { translate } = transforms;
const { geom2, geom3 } = geometries;
const { extrudeLinear } = extrusions;

const DEFAULT_RESOLUTION = 16;

function toFiniteNumber(value, label) {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new Error(`${label} must be a finite number.`);
  return num;
}

function stlToString(rawData) {
  // With `{ binary: false }` JSCAD should usually return a string, but keep this robust
  // across environments (browser vs Node) and potential serializer return types.
  if (typeof rawData === "string") return rawData;
  if (Array.isArray(rawData) && rawData.length > 0 && typeof rawData[0] === "string") return rawData[0];
  if (rawData instanceof ArrayBuffer) return new TextDecoder("utf-8").decode(new Uint8Array(rawData));
  if (ArrayBuffer.isView(rawData)) return new TextDecoder("utf-8").decode(rawData);
  if (typeof Buffer !== "undefined") return Buffer.from(rawData).toString("utf8");
  return String(rawData);
}

function fnv1a32(str) {
  // Deterministic sync hash for deduping STLs.
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Convert to uint32 hex
  return (h >>> 0).toString(16);
}

// Helper functions (flattenPath, contoursBounds, fitContours, etc.)
function flattenPath(path, resolution = DEFAULT_RESOLUTION) {
  const samples = Math.max(2, Math.min(128, Math.round(resolution)));
  const contours = [];
  let current = [];
  let last = [0, 0];
  const add = (x, y) => {
    current.push([x, y]);
    last = [x, y];
  };
  const sampleCubic = (x0, y0, x1, y1, x2, y2, x3, y3) => {
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const u = 1 - t;
      const u2 = u * u, u3 = u2 * u;
      const t2 = t * t, t3 = t2 * t;
      const x = u3 * x0 + 3 * u2 * t * x1 + 3 * u * t2 * x2 + t3 * x3;
      const y = u3 * y0 + 3 * u2 * t * y1 + 3 * u * t2 * y2 + t3 * y3;
      add(x, y);
    }
  };
  const sampleQuad = (x0, y0, x1, y1, x2, y2) => {
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const u = 1 - t;
      const x = u * u * x0 + 2 * u * t * x1 + t * t * x2;
      const y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
      add(x, y);
    }
  };
  const commands = path.commands || path;
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const type = cmd.type || cmd;
    if (type === "M" || type === "m") {
      if (current.length > 0) contours.push(current);
      const x = cmd.x ?? cmd.x1;
      const y = cmd.y ?? cmd.y1;
      current = [[x, y]];
      last = [x, y];
    } else if (type === "L" || type === "l") {
      const x = cmd.x ?? last[0] + (cmd.dx ?? 0);
      const y = cmd.y ?? last[1] + (cmd.dy ?? 0);
      add(x, y);
    } else if (type === "C" || type === "c") {
      const x0 = last[0], y0 = last[1];
      const x1 = cmd.x1 ?? x0 + (cmd.dx1 ?? 0);
      const y1 = cmd.y1 ?? y0 + (cmd.dy1 ?? 0);
      const x2 = cmd.x2 ?? x0 + (cmd.dx2 ?? 0);
      const y2 = cmd.y2 ?? y0 + (cmd.dy2 ?? 0);
      const x3 = cmd.x ?? x0 + (cmd.dx ?? 0);
      const y3 = cmd.y ?? y0 + (cmd.dy ?? 0);
      sampleCubic(x0, y0, x1, y1, x2, y2, x3, y3);
    } else if (type === "Q" || type === "q") {
      const x0 = last[0], y0 = last[1];
      const x1 = cmd.x1 ?? x0 + (cmd.dx1 ?? 0);
      const y1 = cmd.y1 ?? y0 + (cmd.dy1 ?? 0);
      const x2 = cmd.x ?? x0 + (cmd.dx ?? 0);
      const y2 = cmd.y ?? y0 + (cmd.dy ?? 0);
      sampleQuad(x0, y0, x1, y1, x2, y2);
    } else if (type === "Z" || type === "z") {
      if (current.length > 1) current.push([current[0][0], current[0][1]]);
      contours.push(current);
      current = [];
    }
  }
  if (current.length > 0) contours.push(current);
  return contours;
}

function contoursBounds(contours) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const contour of contours) {
    for (const [x, y] of contour) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function fitContours(contours, rectWidth, rectHeight, padding = 0) {
  const { minX, minY, width, height } = contoursBounds(contours);
  const innerW = Math.max(0.1, rectWidth - 2 * padding);
  const innerH = Math.max(0.1, rectHeight - 2 * padding);
  const scale = Math.min(innerW / width, innerH / height) || 1;
  const offsetX = rectWidth / 2 - (minX + width / 2) * scale;
  const offsetY = rectHeight / 2 - (minY + height / 2) * scale;
  return contours.map((contour) =>
    contour.map(([x, y]) => [x * scale + offsetX, y * scale + offsetY])
  );
}

function ensureClosed(contour) {
  if (!contour || contour.length < 2) return contour ? [...contour] : [];
  const out = [...contour];
  const first = out[0];
  const last = out[out.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
  return out;
}

function signedArea(contour) {
  if (!contour || contour.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < contour.length; i++) {
    const j = (i + 1) % contour.length;
    a += contour[i][0] * contour[j][1];
    a -= contour[j][0] * contour[i][1];
  }
  return a / 2;
}

function ensureCounterClockwise(contour) {
  if (signedArea(contour) < 0) contour.reverse();
}

function ringPoints(contour) {
  if (!contour || contour.length < 3) return contour ? [...contour] : [];
  const c = [...contour];
  if (c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]) c.pop();
  return c.length >= 3 ? c : contour;
}
function triangulateShape(outerContour, holeContours) {
  const outer = ringPoints(outerContour);
  if (outer.length < 3) return [];
  const vertices = outer.map((p) => [p[0], p[1]]);
  const holeIndices = [];
  for (const h of holeContours) {
    const ring = ringPoints(h);
    if (ring.length < 3) continue;
    holeIndices.push(vertices.length);
    for (const p of ring) vertices.push([p[0], p[1]]);
  }
  const data = vertices.flat();
  const indices = earcut(data, holeIndices.length ? holeIndices : undefined, 2);
  if (!indices || indices.length < 3) return [];
  const triangles = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = vertices[indices[i]];
    const b = vertices[indices[i + 1]];
    const c = vertices[indices[i + 2]];
    const tri = [a, b, c];
    if (signedArea(tri) < 0) tri.reverse();
    triangles.push(tri);
  }
  return triangles;
}

function contourCentroid(contour) {
  if (!contour || contour.length < 2) return [0, 0];
  let cx = 0, cy = 0, n = 0;
  const len = contour[0][0] === contour[contour.length - 1][0] && contour[0][1] === contour[contour.length - 1][1]
    ? contour.length - 1
    : contour.length;
  for (let i = 0; i < len; i++) {
    cx += contour[i][0];
    cy += contour[i][1];
    n++;
  }
  return n ? [cx / n, cy / n] : [0, 0];
}

function pointInPolygon(point, contour) {
  const [px, py] = point;
  let inside = false;
  const n = contour.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = contour[i];
    const [xj, yj] = contour[j];
    if (yi > py !== yj > py && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export async function loadFont(source) {
  if (!source) return null;
  const { parse } = await import("opentype.js");
  const parseBuf = (buf) => parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  try {
    if (typeof fetch !== "undefined") {
      const res = await fetch(source);
      if (res && res.ok) {
        const buf = await res.arrayBuffer();
        return parse(buf);
      }
    }
  } catch (_) {}

  if (typeof source === "string" && (source.startsWith("http://") || source.startsWith("https://"))) {
    const name = (source.split("/").pop() || "font.ttf").split("?")[0];
    for (const dir of ["examples", "fonts", "."]) {
      try {
        const url = `${dir}/${name}`;
        const res = await fetch(url);
        if (res && res.ok) {
          const buf = await res.arrayBuffer();
          return parse(buf);
        }
      } catch (_) {}
    }
  }
  return null;
}

export async function generateFontToSTL(params, options = {}) {
  const text = params.text != null ? String(params.text) : "HELLO";
  const mode = (params.mode || "combined").toLowerCase();
  const letterHeight = toFiniteNumber(params.letterHeight ?? 5, "letterHeight");
  const characterHeight = toFiniteNumber(params.characterHeight ?? 20, "characterHeight");
  const spacing = toFiniteNumber(params.spacing ?? 0, "spacing");
  const lineSpacing = toFiniteNumber(params.lineSpacing ?? Math.max(1, characterHeight * 0.3), "lineSpacing");
  const addPlate = params.addPlate === true;
  const plateThickness = addPlate ? toFiniteNumber(params.plateThickness ?? 2, "plateThickness") : 0;
  const platePadding = addPlate ? toFiniteNumber(params.platePadding ?? 2, "platePadding") : 0;
  const resolution = params.resolution != null ? Math.max(2, Math.min(128, Math.round(Number(params.resolution)))) : DEFAULT_RESOLUTION;

  if (letterHeight <= 0 || characterHeight <= 0) {
    throw new Error("letterHeight and characterHeight must be > 0");
  }

  // Load font
  let font = await loadFont(params.fontUrl || params.fontPath);
  if (!font) {
    throw new Error("Font is required. Provide fontUrl or fontPath.");
  }

  // Get letter contours
  const letters = getLetterContours(font, text, characterHeight, resolution);

  if (letters.length === 0) {
    throw new Error("No valid letters found in text");
  }

  if (options.debug) {
    console.error(`[debug] mode=${mode} letters=${letters.length} text="${text}"`);
  }

  if (mode === "separate") {
    const results = [];
    // Deduplicate: if the same glyph (case-insensitive) renders to the same STL,
    // only keep one copy. This avoids multiple downloads when text repeats letters.
    const seen = new Set();
    for (const letter of letters) {
      const geom = extrudeLetterContours(letter.contours, letterHeight, options.debug);
      if (!geom) continue;
      let finalGeom = geom;
      if (addPlate) {
        const plateWidth = letter.bounds.width + 2 * platePadding;
        const plateHeight = letter.bounds.height + 2 * platePadding;
        const plate = translate(
          [letter.bounds.minX + letter.bounds.width / 2, letter.bounds.minY + letter.bounds.height / 2, plateThickness / 2],
          cuboid({ size: [plateWidth, plateHeight, plateThickness] })
        );
        const raised = translate([0, 0, plateThickness], geom);
        finalGeom = union(plate, raised);
      }
      const rawData = serialize({ binary: false }, finalGeom);
      const stl = stlToString(rawData);
      const charKey = String(letter.char).toLowerCase();
      const dedupKey = `${charKey}|${fnv1a32(stl)}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      results.push({ char: letter.char, stl });
    }
    return { mode: "separate", letters: results };
  }

  const geometries = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const totalLines = Math.max(1, String(text).split(/\r?\n/).length);
  for (let li = 0; li < totalLines; li++) {
    const lineLetters = letters.filter((l) => (l.lineIndex || 0) === li);
    let xOffset = 0;
    const yOffset = -li * (characterHeight + lineSpacing);
    for (const letter of lineLetters) {
      const geom = extrudeLetterContours(letter.contours, letterHeight, options.debug);
      if (!geom) continue;
      const translated = translate([xOffset - letter.bounds.minX, yOffset, 0], geom);
      geometries.push(translated);
      const letterMinX = xOffset;
      const letterMaxX = xOffset + letter.bounds.width;
      const letterMinY = letter.bounds.minY + yOffset;
      const letterMaxY = letter.bounds.maxY + yOffset;
      if (letterMinX < minX) minX = letterMinX;
      if (letterMaxX > maxX) maxX = letterMaxX;
      if (letterMinY < minY) minY = letterMinY;
      if (letterMaxY > maxY) maxY = letterMaxY;
      xOffset += letter.advanceWidth + spacing;
    }
  }
  if (geometries.length === 0) {
    throw new Error("No geometry generated from text");
  }
  let finalGeom = geometries.length === 1 ? geometries[0] : union(...geometries);
  const shiftUp = -minY;
  if (Math.abs(shiftUp) > 0.001) {
    finalGeom = translate([0, shiftUp, 0], finalGeom);
    maxY = maxY + shiftUp;
    minY = 0;
  }
  if (addPlate) {
    const plateWidth = (maxX - minX) + 2 * platePadding;
    const plateHeight = (maxY - minY) + 2 * platePadding;
    const plateCenterX = (minX + maxX) / 2;
    const plateCenterY = (minY + maxY) / 2;
    const plate = translate(
      [plateCenterX, plateCenterY, plateThickness / 2],
      cuboid({ size: [plateWidth, plateHeight, plateThickness] })
    );
    const raised = translate([0, 0, plateThickness], finalGeom);
    finalGeom = union(plate, raised);
  }
  const rawData = serialize({ binary: false }, finalGeom);
  const stl = stlToString(rawData);
  return {
    mode: "combined",
    stl,
    meta: {
      text,
      letterHeight,
      characterHeight,
      spacing,
      lineSpacing,
      addPlate,
      plateThickness: addPlate ? plateThickness : undefined,
      platePadding: addPlate ? platePadding : undefined,
    }
  };
}

export { flattenPath, contoursBounds, fitContours, ensureClosed, signedArea, ensureCounterClockwise, triangulateShape, contourCentroid, pointInPolygon };

function getLetterContours(font, text, characterHeight, resolution) {
  if (!font || !text) return [];

  const letters = [];
  const unitsPerEm = font.unitsPerEm || 1000;
  const scale = characterHeight / unitsPerEm;
  let lineIndex = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "\r") continue;
    if (char === "\n") {
      lineIndex += 1;
      continue;
    }
    if (char === " ") continue;

    const glyph = font.charToGlyph(char);
    if (!glyph || !glyph.path) continue;

    const path = glyph.getPath(0, 0, unitsPerEm);
    const contours = flattenPath(path, resolution);
    if (contours.length === 0) continue;

    // Scale to mm and flip Y (font Y goes up; STL expects "down" in this coordinate system).
    const scaledContours = contours.map((c) =>
      c.map(([x, y]) => [x * scale, -y * scale])
    );

    const bounds = contoursBounds(scaledContours);
    const advanceWidth = (glyph.advanceWidth || 0) * scale;

    letters.push({
      char,
      contours: scaledContours,
      bounds,
      advanceWidth,
      lineIndex,
    });
  }

  return letters;
}

function extrudeLetterContours(contours, height, debug) {
  const geometries = [];

  // Classify contours as outers vs holes.
  const closed = contours
    .filter((c) => c.length >= 3)
    .map((c) => ensureClosed(c))
    .filter((c) => Math.abs(signedArea(c)) > 1e-6);

  if (closed.length === 0) return null;

  const sorted = closed
    .map((c, i) => ({ contour: c, area: Math.abs(signedArea(c)), index: i }))
    .sort((a, b) => b.area - a.area);

  const outers = [];
  const contourParent = new Array(sorted.length).fill(-1); // -1 = outer, otherwise parent outer's index in `sorted`

  for (let i = 0; i < sorted.length; i++) {
    const cen = contourCentroid(sorted[i].contour);
    let parentIdx = -1;

    // Find the first larger contour that contains this contour centroid.
    for (let j = 0; j < i; j++) {
      if (contourParent[j] !== -1) continue; // only consider outers as potential parents
      if (pointInPolygon(cen, sorted[j].contour)) {
        parentIdx = j;
        break;
      }
    }

    contourParent[i] = parentIdx;
    if (parentIdx === -1) {
      outers.push({ contour: sorted[i].contour, index: outers.length, sortedIndex: i });
    }
  }

  // Assign each hole to its containing outer.
  const holesByOuter = outers.map(() => []);
  for (let i = 0; i < sorted.length; i++) {
    if (contourParent[i] === -1) continue;
    const parentSortedIdx = contourParent[i];
    const outerIdx = outers.findIndex((o) => o.sortedIndex === parentSortedIdx);
    if (outerIdx >= 0) holesByOuter[outerIdx].push(sorted[i].contour);
  }

  // Triangulate + extrude each outer contour.
  for (let k = 0; k < outers.length; k++) {
    const contour = outers[k].contour;
    ensureCounterClockwise(contour);
    const outerSign = Math.sign(signedArea(contour));

    const holes = holesByOuter[k].map((h) => {
      const hole = [...h].map((p) => [p[0], p[1]]);
      // Holes must have opposite orientation from outer for consistent triangulation.
      if (Math.sign(signedArea(hole)) === outerSign) hole.reverse();
      return hole;
    });

    const triangles = triangulateShape(contour, holes);
    for (const tri of triangles) {
      const g2 = geom2.fromPoints(tri);
      const extruded = extrudeLinear({ height }, g2);
      geometries.push(extruded);
    }
  }

  return geometries.length > 0
    ? (geometries.length === 1 ? geometries[0] : union(...geometries))
    : null;
}

