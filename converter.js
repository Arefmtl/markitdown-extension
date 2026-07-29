/**
 * MarkItDown Converter — shared JS for converter.html and docs/index.html
 * v1.3.2 — bug fixes: OCR memory leak, canvas reuse, CSV parser
 */
(function() {
  'use strict';

  // PDF.js worker — fake worker for extension pages
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  }

  const dz = document.getElementById('dz');
  const fi = document.getElementById('file');
  const out = document.getElementById('out');
  const toast = document.getElementById('toast');
  const prog = document.getElementById('prog');
  const bar = document.getElementById('bar');
  const progTxt = document.getElementById('progTxt');

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  function showProgress(text, pct) {
    prog.style.display = 'block';
    progTxt.textContent = text;
    bar.style.width = Math.min(pct, 100) + '%';
  }

  function hideProgress() { prog.style.display = 'none'; bar.style.width = '0%'; }

  dz.onclick = () => fi.click();
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); go(e.dataTransfer.files[0]); };
  fi.onchange = e => go(e.target.files[0]);

  document.getElementById('againBtn').onclick = () => {
    out.style.display = 'none'; dz.style.display = 'block'; fi.value = '';
  };

  document.getElementById('cpBtn').onclick = () => {
    navigator.clipboard.writeText(document.getElementById('md').value).then(() =>
      showToast('✅ Copied!')
    );
  };

  document.getElementById('dlBtn').onclick = () => {
    const text = document.getElementById('md').value;
    const name = document.getElementById('fn').textContent.replace(/\.[^.]+$/, '') + '.md';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast('💾 Downloaded ' + name);
  };

  // === OCR with proper cleanup ===
  let ocrWorker = null;

  async function getOcrWorker() {
    if (ocrWorker) return ocrWorker;
    showProgress('OCR: Loading engine (~30MB first time)...', 5);
    ocrWorker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text')
          showProgress(`OCR: ${Math.round(m.progress * 100)}%`, 10 + m.progress * 80);
      }
    });
    return ocrWorker;
  }

  async function ocrImage(data) {
    let worker = null;
    try {
      worker = await getOcrWorker();
      showProgress('OCR: Processing...', 20);
      const { data: { text } } = await worker.recognize(data);
      return text;
    } catch (e) {
      console.error('OCR failed:', e);
      return '[OCR failed: ' + e.message + ']';
    }
    // DON'T terminate — reuse for next image
  }

  // === CSV parser — handles quoted fields ===
  function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { result.push(current.trim()); current = ''; }
        else { current += ch; }
      }
    }
    result.push(current.trim());
    return result;
  }

  // === PDF with OCR fallback ===
  async function pdfToMd(buf) {
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let md = '';
    // Reuse single canvas to avoid memory leak
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    for (let i = 1; i <= pdf.numPages; i++) {
      showProgress(`PDF: page ${i}/${pdf.numPages}`, (i / pdf.numPages) * 80);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(x => x.str).join(' ').trim();

      if (text.length > 10) {
        md += `\n---\n**Page ${i}**\n\n${text}\n`;
      } else {
        // Scanned page — OCR it
        showProgress(`OCR: scanning page ${i}/${pdf.numPages}`, (i / pdf.numPages) * 80);
        const vp = page.getViewport({ scale: 2.0 });
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const imgData = canvas.toDataURL('image/png');
        const ocrText = await ocrImage(imgData);
        if (ocrText && ocrText.trim() && !ocrText.startsWith('[OCR failed')) {
          md += `\n---\n**Page ${i}** (OCR)\n\n${ocrText.trim()}\n`;
        } else {
          md += `\n---\n**Page ${i}** *(empty)*\n`;
        }
      }
    }
    return md.trim() || '[PDF: no text found]';
  }

  // === Main converter ===
  async function go(file) {
    if (!file) return;
    dz.innerHTML = '<div class="spin"></div><p>Converting...</p>';
    const buf = await file.arrayBuffer();
    const ext = file.name.split('.').pop().toLowerCase();
    const imgExts = ['png','jpg','jpeg','webp','gif','bmp','tiff'];
    let md = '', usedOcr = false;

    try {
      if (ext === 'pdf') {
        md = await pdfToMd(buf);
        usedOcr = md.includes('(OCR)');
      } else if (imgExts.includes(ext)) {
        const url = URL.createObjectURL(file);
        try {
          md = await ocrImage(url);
          usedOcr = true;
        } finally {
          URL.revokeObjectURL(url);
        }
      } else if (ext === 'docx') {
        md = (await mammoth.convertToMarkdown({ arrayBuffer: buf })).value;
      } else if (ext === 'xlsx' || ext === 'xls') {
        const wb = XLSX.read(buf, { type: 'array' });
        wb.SheetNames.forEach(n => {
          const d = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 });
          if (!d.length) return;
          md += `\n### 📊 ${n}\n\n| ${d[0].join(' | ')} |\n| ${d[0].map(()=>'---').join(' | ')} |\n`;
          d.slice(1).forEach(r => md += `| ${r.map(c=>c??'').join(' | ')} |\n`);
        });
      } else if (ext === 'pptx') {
        const txt = new TextDecoder().decode(buf);
        const m = txt.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
        let n = 1;
        m.forEach((x, i) => {
          const t = x.replace(/<[^>]+>/g,'').trim();
          if (t) { if (i % 8 === 0 && i) md += `\n---\n**Slide ${++n}**\n\n`; md += t + '\n'; }
        });
        if (!md) md = '[PPTX: limited extraction]';
      } else if (ext === 'csv') {
        const lines = new TextDecoder().decode(buf).split('\n').filter(l=>l.trim());
        if (lines.length > 0) {
          const headers = parseCsvLine(lines[0]);
          md = `| ${headers.join(' | ')} |\n| ${headers.map(()=>'---').join(' | ')} |\n`;
          lines.slice(1, 101).forEach(l => md += `| ${parseCsvLine(l).join(' | ')} |\n`);
          if (lines.length > 101) md += `\n*... ${lines.length - 1} total rows (showing first 100)*\n`;
        }
      } else {
        md = new TextDecoder().decode(buf);
      }
    } catch(e) { md = `Error converting .${ext}: ${e.message}`; }

    hideProgress();
    const tokens = Math.ceil(md.length / 4);
    document.getElementById('fn').textContent = file.name;
    document.getElementById('tk').textContent = tokens.toLocaleString();
    document.getElementById('ch').textContent = md.length.toLocaleString();
    document.getElementById('md').value = md;
    out.style.display = 'block'; dz.style.display = 'none';

    try { await navigator.clipboard.writeText(md); showToast(`✅ ${usedOcr ? '🔍 OCR — ' : ''}Copied!`); }
    catch(e) { showToast('✅ Done! Copy or Download'); }
  }
})();
