/**
 * MarkItDown Converter — shared JS for converter.html and docs/index.html
 */
(function() {
  'use strict';

  // PDF.js worker
  if (typeof pdfjsLib !== 'undefined') {
    const isExt = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL;
    pdfjsLib.GlobalWorkerOptions.workerSrc = isExt
      ? chrome.runtime.getURL('lib/pdf.worker.min.js')
      : 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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
    bar.style.width = pct + '%';
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
    navigator.clipboard.writeText(document.getElementById('md').value);
    showToast('✅ Copied!');
  };

  document.getElementById('dlBtn').onclick = () => {
    const text = document.getElementById('md').value;
    const name = document.getElementById('fn').textContent.replace(/\.[^.]+$/, '') + '.md';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    a.download = name; a.click();
    showToast('💾 Downloaded ' + name);
  };

  async function ocrImage(data) {
    showProgress('OCR: Loading engine...', 10);
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text')
          showProgress(`OCR: ${Math.round(m.progress * 100)}%`, 10 + m.progress * 80);
      }
    });
    showProgress('OCR: Processing...', 20);
    const { data: { text } } = await worker.recognize(data);
    await worker.terminate();
    hideProgress();
    return text;
  }

  async function pdfToMd(buf) {
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let md = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      showProgress(`PDF: ${i}/${pdf.numPages}`, (i / pdf.numPages) * 80);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(x => x.str).join(' ').trim();
      if (text.length > 10) {
        md += `\n---\n**Page ${i}**\n\n${text}\n`;
      } else {
        showProgress(`OCR: page ${i}/${pdf.numPages}`, (i / pdf.numPages) * 80);
        const vp = page.getViewport({ scale: 2.0 });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        const t = await ocrImage(c.toDataURL('image/png'));
        if (t.trim()) md += `\n---\n**Page ${i}** (OCR)\n\n${t.trim()}\n`;
      }
    }
    return md.trim() || '[PDF: no text found]';
  }

  async function go(file) {
    if (!file) return;
    dz.innerHTML = '<div class="spin"></div><p>Converting...</p>';
    const buf = await file.arrayBuffer();
    const ext = file.name.split('.').pop().toLowerCase();
    const imgExts = ['png','jpg','jpeg','webp','gif','bmp','tiff'];
    let md = '', usedOcr = false;

    try {
      if (ext === 'pdf') { md = await pdfToMd(buf); usedOcr = md.includes('OCR'); }
      else if (imgExts.includes(ext)) {
        const url = URL.createObjectURL(file);
        md = await ocrImage(url); URL.revokeObjectURL(url); usedOcr = true;
      } else if (ext === 'docx') { md = (await mammoth.convertToMarkdown({ arrayBuffer: buf })).value; }
      else if (ext === 'xlsx' || ext === 'xls') {
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
        if (!md) md = '[PPTX: limited]';
      } else if (ext === 'csv') {
        const lines = new TextDecoder().decode(buf).split('\n').filter(l=>l.trim());
        const p = l => l.split(',').map(c=>c.trim().replace(/^"|"$/g,''));
        md = `| ${p(lines[0]).join(' | ')} |\n| ${p(lines[0]).map(()=>'---').join(' | ')} |\n`;
        lines.slice(1).forEach(l => md += `| ${p(l).join(' | ')} |\n`);
      } else { md = new TextDecoder().decode(buf); }
    } catch(e) { md = `Error: ${e.message}`; }

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
