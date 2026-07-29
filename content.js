/**
 * MarkItDown Content Script v3
 * Injects file-to-markdown converter into AI chat interfaces
 * v1.4.3 — Added OCR support for images
 */

(async function() {
  'use strict';

  // === PDF.js Setup (fake worker for content scripts) ===
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  }

  // === Tesseract.js Setup ===
  let ocrWorker = null;

  async function getOcrWorker() {
    if (ocrWorker) return ocrWorker;
    ocrWorker = await Tesseract.createWorker('eng', 1, {
      workerPath: chrome.runtime.getURL('lib/tesseract.worker.min.js'),
      langPath: chrome.runtime.getURL('lib'),
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          const el = document.getElementById('md-converting-text');
          if (el) el.textContent = `OCR: ${pct}%`;
        }
      }
    });
    return ocrWorker;
  }

  async function ocrImage(data) {
    let worker = null;
    try {
      worker = await getOcrWorker();
      const { data: { text } } = await worker.recognize(data);
      return text;
    } catch (e) {
      console.error('OCR failed:', e);
      return '[OCR failed: ' + e.message + ']';
    }
  }

  // === PLATFORM DETECTION ===
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('gemini.google.com')) return 'gemini';
    if (host.includes('copilot.microsoft.com')) return 'copilot';
    if (host.includes('you.com')) return 'you';
    if (host.includes('poe.com')) return 'poe';
    if (host.includes('huggingface.co')) return 'huggingface';
    return 'generic';
  }

  // === FILE CONVERTERS ===

  async function pdfToMarkdown(buffer) {
    if (typeof pdfjsLib === 'undefined') return '[PDF.js not loaded]';
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let md = '';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join(' ').trim();

      if (text.length > 10) {
        md += `\n---\n**Page ${i}**\n\n${text}\n`;
      } else {
        // Scanned page — OCR it
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

  async function docxToMarkdown(buffer) {
    if (typeof mammoth === 'undefined') return '[Mammoth not loaded]';
    const result = await mammoth.convertToMarkdown({ arrayBuffer: buffer });
    return result.value;
  }

  async function xlsxToMarkdown(buffer) {
    if (typeof XLSX === 'undefined') return '[SheetJS not loaded]';
    const wb = XLSX.read(buffer, { type: 'array' });
    let md = '';
    wb.SheetNames.forEach(name => {
      const sheet = wb.Sheets[name];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (data.length === 0) return;
      md += `\n### 📊 Sheet: ${name}\n\n`;
      md += '| ' + data[0].join(' | ') + ' |\n';
      md += '| ' + data[0].map(() => '---').join(' | ') + ' |\n';
      data.slice(1).forEach(row => {
        md += '| ' + row.map(c => c ?? '').join(' | ') + ' |\n';
      });
    });
    return md.trim();
  }

  async function pptxToMarkdown(buffer) {
    const text = new TextDecoder().decode(buffer);
    const matches = text.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
    let md = '';
    let slideNum = 1;
    let itemCount = 0;
    matches.forEach((match) => {
      const content = match.replace(/<[^>]+>/g, '').trim();
      if (content) {
        if (itemCount % 8 === 0 && itemCount > 0) {
          md += `\n---\n**Slide ${++slideNum}**\n\n`;
        }
        md += content + '\n';
        itemCount++;
      }
    });
    return md.trim() || '[PPTX: limited text extraction]';
  }

  async function csvToMarkdown(buffer) {
    const text = new TextDecoder().decode(buffer);
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length === 0) return '';
    const parse = (line) => line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const headers = parse(lines[0]);
    let md = '| ' + headers.join(' | ') + ' |\n';
    md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
    lines.slice(1, 51).forEach(line => {
      md += '| ' + parse(line).join(' | ') + ' |\n';
    });
    if (lines.length > 51) md += `\n*... ${lines.length - 1} total rows (showing first 50)*\n`;
    return md;
  }

  const imgExts = ['png','jpg','jpeg','webp','gif','bmp','tiff'];

  async function imageToMarkdown(file) {
    const url = URL.createObjectURL(file);
    try {
      const text = await ocrImage(url);
      return text || '[OCR: no text found]';
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function convertFile(file) {
    const buffer = await file.arrayBuffer();
    const ext = file.name.split('.').pop().toLowerCase();

    if (imgExts.includes(ext)) {
      return imageToMarkdown(file);
    }

    switch (ext) {
      case 'pdf': return pdfToMarkdown(buffer);
      case 'docx': return docxToMarkdown(buffer);
      case 'xlsx': case 'xls': return xlsxToMarkdown(buffer);
      case 'pptx': return pptxToMarkdown(buffer);
      case 'csv': return csvToMarkdown(buffer);
      case 'txt': case 'md': case 'json': case 'xml': case 'html': case 'css': case 'js': case 'py': case 'ts':
        return new TextDecoder().decode(buffer);
      default: return `[Unsupported: .${ext}]`;
    }
  }

  // === TOKEN ESTIMATOR ===
  function estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  // === INJECT TEXT INTO CHAT ===
  function injectIntoChat(text) {
    const selectors = [
      'div#prompt-textarea',
      'div[contenteditable="true"]',
      'div.ql-editor',
      'textarea',
    ];
    for (const sel of selectors) {
      const input = document.querySelector(sel);
      if (input && input.offsetParent !== null) {
        input.focus();
        if (input.tagName === 'TEXTAREA') {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          nativeInputValueSetter.call(input, text);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          input.innerHTML = text.replace(/\n/g, '<br>');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
      }
    }
    return false;
  }

  // === CREATE UI PANEL ===
  function createUI() {
    const old = document.getElementById('markitdown-panel');
    if (old) { old.remove(); return; }

    const panel = document.createElement('div');
    panel.id = 'markitdown-panel';
    panel.innerHTML = `
      <div class="md-header">
        <span class="md-logo">📄 MarkItDown</span>
        <button class="md-close" id="md-close">×</button>
      </div>
      <div class="md-body">
        <div class="md-dropzone" id="md-dropzone">
          <div class="md-drop-icon">📁</div>
          <div class="md-drop-text">Drop file here or click</div>
          <div class="md-drop-hint">PDF, DOCX, XLSX, PPTX, CSV, TXT, Images (OCR)</div>
          <input type="file" id="md-file-input" 
                 accept=".pdf,.docx,.xlsx,.xls,.pptx,.txt,.md,.json,.xml,.html,.css,.js,.py,.ts,.csv,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff"
                 hidden>
        </div>
        <div class="md-preview" id="md-preview" style="display:none">
          <div class="md-file-info" id="md-file-info"></div>
          <div class="md-token-info" id="md-token-info"></div>
          <textarea class="md-textarea" id="md-textarea" readonly></textarea>
          <div class="md-actions">
            <button class="md-btn md-btn-copy" id="md-copy">📋 Copy</button>
            <button class="md-btn md-btn-insert" id="md-insert">⚡ Insert to Chat</button>
          </div>
        </div>
        <div class="md-converting" id="md-converting" style="display:none">
          <div class="md-spinner"></div>
          <div id="md-converting-text">Converting...</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // Events
    document.getElementById('md-close').onclick = () => panel.remove();
    document.getElementById('md-dropzone').onclick = () => document.getElementById('md-file-input').click();
    document.getElementById('md-file-input').onchange = (e) => handleFile(e.target.files[0]);

    const dz = document.getElementById('md-dropzone');
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('md-dragover'); };
    dz.ondragleave = () => dz.classList.remove('md-dragover');
    dz.ondrop = (e) => {
      e.preventDefault(); dz.classList.remove('md-dragover');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    };

    document.getElementById('md-copy').onclick = () => {
      const text = document.getElementById('md-textarea').value;
      navigator.clipboard.writeText(text).then(() => {
        document.getElementById('md-copy').textContent = '✅ Copied!';
        setTimeout(() => document.getElementById('md-copy').textContent = '📋 Copy', 1500);
      });
    };

    document.getElementById('md-insert').onclick = () => {
      const text = document.getElementById('md-textarea').value;
      if (injectIntoChat(text)) {
        document.getElementById('md-insert').textContent = '✅ Inserted!';
        setTimeout(() => { panel.remove(); }, 1000);
      } else {
        navigator.clipboard.writeText(text);
        document.getElementById('md-insert').textContent = '📋 Copied! Paste manually';
      }
    };
  }

  async function handleFile(file) {
    if (!file) return;
    document.getElementById('md-dropzone').style.display = 'none';
    document.getElementById('md-converting').style.display = 'flex';
    try {
      const md = await convertFile(file);
      const tokens = estimateTokens(md);
      document.getElementById('md-converting').style.display = 'none';
      document.getElementById('md-preview').style.display = 'block';
      document.getElementById('md-file-info').innerHTML = `<strong>${file.name}</strong> (${(file.size/1024).toFixed(1)} KB)`;
      document.getElementById('md-token-info').innerHTML = `📊 ~${tokens.toLocaleString()} tokens`;
      document.getElementById('md-textarea').value = md;
    } catch (err) {
      document.getElementById('md-converting').style.display = 'none';
      document.getElementById('md-dropzone').style.display = 'flex';
      document.querySelector('.md-drop-text').textContent = `Error: ${err.message}`;
    }
  }

  // === FLOATING BUTTON ===
  function injectButton() {
    if (document.getElementById('md-fab')) return;
    const fab = document.createElement('div');
    fab.id = 'md-fab';
    fab.textContent = '📄';
    fab.title = 'MarkItDown - Convert file to Markdown';
    fab.onclick = createUI;
    document.body.appendChild(fab);
    console.log('[MarkItDown] FAB injected');
  }

  // === INIT ===
  function init() {
    const platform = detectPlatform();
    console.log(`[MarkItDown] Platform: ${platform}`);
    injectButton();
    new MutationObserver(() => {
      if (!document.getElementById('md-fab')) injectButton();
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }
})();
