/**
 * MarkItDown Content Script
 * Injects file-to-markdown converter into AI chat interfaces
 */

(function() {
  'use strict';

  // === CONFIG ===
  const PLATFORMS = {
    chatgpt: {
      selector: 'div#prompt-textarea, div[id="prompt-textarea"], textarea#prompt-textarea',
      insertMethod: 'contenteditable',
      container: 'form > div > div'
    },
    claude: {
      selector: 'div.ProseMirror, div[contenteditable="true"]',
      insertMethod: 'contenteditable',
      container: 'div.flex.flex-col'
    },
    gemini: {
      selector: 'div.ql-editor, rich-textarea .ql-editor',
      insertMethod: 'contenteditable',
      container: '.input-area'
    },
    copilot: {
      selector: 'textarea, div[contenteditable="true"]',
      insertMethod: 'contenteditable',
      container: '#searchbox'
    }
  };

  let currentPlatform = null;

  // === DETECT PLATFORM ===
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt';
    if (host.includes('claude.ai')) return 'claude';
    if (host.includes('gemini.google.com')) return 'gemini';
    if (host.includes('copilot.microsoft.com')) return 'copilot';
    if (host.includes('you.com')) return 'you';
    if (host.includes('poe.com')) return 'poe';
    if (host.includes('huggingface.co')) return 'huggingface';
    return null;
  }

  // === FILE CONVERTERS ===

  async function pdfToMarkdown(buffer) {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let md = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join(' ');
      md += `\n---\n**Page ${i}**\n\n${text}\n`;
    }
    return md.trim();
  }

  async function docxToMarkdown(buffer) {
    const result = await mammoth.convertToMarkdown({ arrayBuffer: buffer });
    return result.value;
  }

  async function xlsxToMarkdown(buffer) {
    const wb = XLSX.read(buffer, { type: 'array' });
    let md = '';
    wb.SheetNames.forEach(name => {
      const sheet = wb.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      md += `\n### Sheet: ${name}\n\n|${csv.replace(/\n/g, '\n|')}\n`;
    });
    return md.trim();
  }

  async function pptxToMarkdown(buffer) {
    // PPTX is ZIP with XML - extract text
    const text = new TextDecoder().decode(buffer);
    const slides = text.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || [];
    let md = '';
    let slideNum = 1;
    slides.forEach((match, i) => {
      if (i % 10 === 0 && i > 0) slideNum++;
      const content = match.replace(/<[^>]+>/g, '').trim();
      if (content) md += `${content}\n`;
    });
    return md.trim() || '[PPTX: text extraction limited - try converting to PDF first]';
  }

  async function txtToMarkdown(buffer) {
    return new TextDecoder().decode(buffer);
  }

  async function csvToMarkdown(buffer) {
    const text = new TextDecoder().decode(buffer);
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length === 0) return '';
    const headers = lines[0].split(',').map(h => h.trim());
    let md = '| ' + headers.join(' | ') + ' |\n';
    md += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
    lines.slice(1).forEach(line => {
      const cells = line.split(',').map(c => c.trim());
      md += '| ' + cells.join(' | ') + ' |\n';
    });
    return md;
  }

  // === MAIN CONVERTER ===
  async function convertFile(file) {
    const buffer = await file.arrayBuffer();
    const ext = file.name.split('.').pop().toLowerCase();

    switch (ext) {
      case 'pdf': return pdfToMarkdown(buffer);
      case 'docx': return docxToMarkdown(buffer);
      case 'xlsx': case 'xls': return xlsxToMarkdown(buffer);
      case 'pptx': return pptxToMarkdown(buffer);
      case 'txt': case 'md': case 'json': case 'xml': case 'html': case 'css': case 'js':
        return txtToMarkdown(buffer);
      case 'csv': return csvToMarkdown(buffer);
      default:
        return `[Unsupported file type: .${ext}]`;
    }
  }

  // === TOKEN ESTIMATOR ===
  function estimateTokens(text) {
    // ~4 chars per token for English, ~2 for CJK
    return Math.ceil(text.length / 4);
  }

  function estimateFileTokens(file) {
    // Rough: 1 token per byte for binary, much more for text
    return Math.ceil(file.size / 3);
  }

  // === INJECT TEXT INTO CHAT ===
  function injectIntoChat(text) {
    const platform = PLATFORMS[currentPlatform];
    if (!platform) return false;

    const input = document.querySelector(platform.selector);
    if (!input) return false;

    if (platform.insertMethod === 'contenteditable') {
      input.focus();
      // For contenteditable divs
      if (input.tagName === 'TEXTAREA') {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        // contenteditable div
        input.innerHTML = text.replace(/\n/g, '<br>');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    return true;
  }

  // === UI ===
  function createUI() {
    // Remove old UI if exists
    const old = document.getElementById('markitdown-panel');
    if (old) old.remove();

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
          <div class="md-drop-text">Drop file here or click to select</div>
          <div class="md-drop-hint">PDF, DOCX, XLSX, PPTX, TXT, CSV</div>
          <input type="file" id="md-file-input" accept=".pdf,.docx,.xlsx,.xls,.pptx,.txt,.md,.json,.xml,.html,.css,.js,.csv" hidden>
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
          <div>Converting...</div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // Event listeners
    document.getElementById('md-close').onclick = () => panel.remove();
    document.getElementById('md-dropzone').onclick = () => document.getElementById('md-file-input').click();
    document.getElementById('md-file-input').onchange = (e) => handleFile(e.target.files[0]);

    const dropzone = document.getElementById('md-dropzone');
    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('md-dragover'); };
    dropzone.ondragleave = () => dropzone.classList.remove('md-dragover');
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove('md-dragover');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    };

    document.getElementById('md-copy').onclick = () => {
      const text = document.getElementById('md-textarea').value;
      navigator.clipboard.writeText(text);
      document.getElementById('md-copy').textContent = '✅ Copied!';
      setTimeout(() => document.getElementById('md-copy').textContent = '📋 Copy', 1500);
    };

    document.getElementById('md-insert').onclick = () => {
      const text = document.getElementById('md-textarea').value;
      if (injectIntoChat(text)) {
        document.getElementById('md-insert').textContent = '✅ Inserted!';
        setTimeout(() => {
          document.getElementById('md-insert').textContent = '⚡ Insert to Chat';
          panel.remove();
        }, 1000);
      } else {
        document.getElementById('md-insert').textContent = '❌ Chat box not found';
      }
    };
  }

  async function handleFile(file) {
    if (!file) return;

    document.getElementById('md-dropzone').style.display = 'none';
    document.getElementById('md-converting').style.display = 'flex';

    try {
      const markdown = await convertFile(file);
      const tokens = estimateTokens(markdown);
      const originalTokens = estimateFileTokens(file);

      document.getElementById('md-converting').style.display = 'none';
      document.getElementById('md-preview').style.display = 'block';

      document.getElementById('md-file-info').innerHTML = `
        <strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)
      `;
      document.getElementById('md-token-info').innerHTML = `
        📊 Markdown: ~${tokens.toLocaleString()} tokens
        ${originalTokens > tokens ? `<span class="md-saved">💾 Saved ~${(originalTokens - tokens).toLocaleString()} tokens!</span>` : ''}
      `;
      document.getElementById('md-textarea').value = markdown;
    } catch (err) {
      document.getElementById('md-converting').style.display = 'none';
      document.getElementById('md-dropzone').style.display = 'flex';
      document.getElementById('md-drop-text').textContent = `Error: ${err.message}`;
    }
  }

  // === INJECT FLOATING BUTTON ===
  function injectButton() {
    if (document.getElementById('md-fab')) return;

    const fab = document.createElement('div');
    fab.id = 'md-fab';
    fab.innerHTML = '📄';
    fab.title = 'MarkItDown - Convert file to Markdown';
    fab.onclick = createUI;
    document.body.appendChild(fab);
  }

  // === INIT ===
  function init() {
    currentPlatform = detectPlatform();
    if (!currentPlatform) return;

    console.log(`[MarkItDown] Detected platform: ${currentPlatform}`);
    injectButton();

    // Re-inject if SPA navigation happens
    const observer = new MutationObserver(() => {
      if (!document.getElementById('md-fab')) injectButton();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Wait for page to load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
