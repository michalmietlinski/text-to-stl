import { generateFontToSTL } from '../src/core/textPlate.web.js';
import JSZip from 'jszip';

const DEFAULT_FONTS = [
  { name: 'OpenSans-Bold', url: 'fonts/OpenSans-Bold.ttf' },
  { name: 'OpenSans-Regular', url: 'fonts/OpenSans-Regular.ttf' },
  { name: 'Roboto-Bold', url: 'fonts/Roboto-Bold.ttf' },
  { name: 'Roboto-Regular', url: 'fonts/Roboto-Regular.ttf' },
];

function setStatus(message, isError = false) {
  const body = document.querySelector('#status .status-body');
  if (!body) return;
  body.textContent = String(message);
  body.className = isError ? 'status-body status-error' : 'status-body';
}

async function loadFontManifest() {
  const res = await fetch('fonts/manifest.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function populateFontSelect(selectEl, fonts) {
  selectEl.innerHTML = '';
  if (!Array.isArray(fonts) || fonts.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(no fonts found)';
    opt.disabled = true;
    selectEl.appendChild(opt);
    return;
  }

  for (const font of fonts) {
    if (!font || !font.url || !font.name) continue;
    const opt = document.createElement('option');
    opt.value = font.url;
    opt.textContent = font.name;
    selectEl.appendChild(opt);
  }
}

function downloadSTL(filename, content) {
  const blob = new Blob([content], { type: 'model/stl' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Sanitize for use in filenames (STL and ZIP). */
function safeFileName(char) {
  return String(char).replace(/[<>:"/\\|?*\s]/g, '_') || 'letter';
}

/** Build unique STL filename per letter (e.g. H.stl, L_2.stl for duplicate L). */
function letterStlName(char, countByChar) {
  const base = safeFileName(char);
  const n = countByChar.get(char) ?? 0;
  countByChar.set(char, n + 1);
  return n === 0 ? `${base}.stl` : `${base}_${n + 1}.stl`;
}

function downloadZip(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Toggle plate fields visibility
document.getElementById('addPlate').addEventListener('change', (e) => {
  document.getElementById('plate-fields').style.display = e.target.checked ? 'block' : 'none';
});

// Toggle spacing field visibility (only for combined mode)
document.getElementById('mode').addEventListener('change', (e) => {
  document.getElementById('spacingField').style.display = 
    e.target.value === 'combined' ? 'block' : 'none';
});

// Font dropdown init (sync via tools/build_web.js)
const fontSelect = document.getElementById('fontName');
const generateBtn = document.getElementById('generateBtn');
const fontUploadInput = document.getElementById('fontUpload');
const fontUploadName = document.getElementById('fontUploadName');
const fontUploadClear = document.getElementById('fontUploadClear');

let customFontBlobUrl = null;

function revokeCustomFont() {
  if (customFontBlobUrl) {
    URL.revokeObjectURL(customFontBlobUrl);
    customFontBlobUrl = null;
  }
}

if (fontUploadInput) {
  fontUploadInput.addEventListener('change', () => {
    revokeCustomFont();
    const file = fontUploadInput.files && fontUploadInput.files[0];
    if (file) {
      customFontBlobUrl = URL.createObjectURL(file);
      fontUploadName.textContent = file.name;
      if (fontUploadClear) fontUploadClear.style.display = 'inline-block';
    } else {
      fontUploadName.textContent = '';
      if (fontUploadClear) fontUploadClear.style.display = 'none';
    }
  });
}

if (fontUploadClear) {
  fontUploadClear.addEventListener('click', () => {
    revokeCustomFont();
    if (fontUploadInput) fontUploadInput.value = '';
    fontUploadName.textContent = '';
    fontUploadClear.style.display = 'none';
  });
}

if (generateBtn) generateBtn.disabled = true;

(async () => {
  try {
    setStatus('Loading fonts...');
    const manifest = await loadFontManifest();
    const fonts = manifest?.fonts || [];
    populateFontSelect(fontSelect, fonts);
    setStatus('Ready to generate. Choose your font and settings');
  } catch (e) {
    // Fallback for dev cases where manifest doesn't exist.
    populateFontSelect(fontSelect, DEFAULT_FONTS);
    setStatus('Ready to generate. Choose your font and settings');
  } finally {
    if (generateBtn) generateBtn.disabled = false;
  }
})();

// Handle form submission
document.getElementById('generator-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const form = e.target;
  const btn = document.getElementById('generateBtn');
  btn.disabled = true;
  setStatus('Generating...');
  
  try {
    const text = form.text.value || 'HELLO';
    const mode = form.mode.value;
    const characterHeight = Number(form.characterHeight.value);
    const letterHeight = Number(form.letterHeight.value);
    const spacing = Number(form.spacing.value);
    const addPlate = form.addPlate.checked;
    const plateThickness = Number(form.plateThickness.value);
    const platePadding = Number(form.platePadding.value);
    // Use uploaded font blob URL if set, otherwise font from list
    const fontUrl = customFontBlobUrl || (fontSelect && fontSelect.value) || '';

    if (!fontUrl) {
      throw new Error('Please select a font from the list or upload your own (TTF/OTF).');
    }
    
    const params = {
      text,
      mode,
      characterHeight,
      letterHeight,
      spacing,
      addPlate,
      plateThickness,
      platePadding,
      fontUrl
    };
    
    const result = await generateFontToSTL(params);
    
    if (result.mode === 'separate') {
      // Pack all letter STLs into one ZIP and download
      const zip = new JSZip();
      const countByChar = new Map();
      for (let i = 0; i < result.letters.length; i++) {
        const letter = result.letters[i];
        const name = letterStlName(letter.char, countByChar);
        zip.file(name, letter.stl, { binary: true });
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipName = (text.replace(/\s+/g, '_') || 'letters').replace(/[<>:"/\\|?*]/g, '_') + '_letters.zip';
      downloadZip(zipName, zipBlob);
      setStatus(`✅ Downloaded ${zipName} (${result.letters.length} letter STLs)`);
    } else {
      // Download single file
      const filename = `${text.replace(/\s+/g, '_')}.stl`;
      downloadSTL(filename, result.stl);
      setStatus(`✅ Downloaded ${filename} successfully!`);
    }
  } catch (error) {
    console.error(error);
    setStatus(`❌ Error: ${error.message}`, true);
  } finally {
    btn.disabled = false;
  }
});

// Status is set by the fonts init above.
