# 📄 MarkItDown - AI File to Markdown

> Convert files to Markdown before sending to AI chat — **save ~90% tokens**, keep full context.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Features

- **Drop & Convert**: Drag any file onto the chat interface
- **Live Preview**: See the markdown before sending
- **Token Counter**: Shows estimated tokens saved
- **One-Click Insert**: Inject markdown directly into chat input
- **Dark/Light Theme**: Matches your AI platform

## 📁 Supported Formats

| Format | Extension | Library |
|--------|-----------|---------|
| PDF | `.pdf` | PDF.js |
| Word | `.docx` | Mammoth.js |
| Excel | `.xlsx`, `.xls` | SheetJS |
| PowerPoint | `.pptx` | XML Parser |
| CSV | `.csv` | Native |
| Text | `.txt`, `.md`, `.json`, etc. | Native |

## 🤖 Supported Platforms

- ✅ [ChatGPT](https://chatgpt.com)
- ✅ [Claude](https://claude.ai)
- ✅ [Gemini](https://gemini.google.com)
- ✅ [Copilot](https://copilot.microsoft.com)
- ✅ [You.com](https://you.com)
- ✅ [Poe](https://poe.com)
- ✅ [HuggingFace Chat](https://huggingface.co/chat)

## 🚀 Installation

### From Source (Developer Mode)

1. Clone this repo:
   ```bash
   git clone https://github.com/Arefmtl/markitdown-extension.git
   ```

2. Open Chrome → `chrome://extensions`

3. Enable **Developer mode** (top right)

4. Click **Load unpacked** → Select the `markitdown-extension` folder

5. The 📄 button will appear on supported AI chat pages

### From Release

1. Download the latest `.crx` or `.zip` from [Releases](https://github.com/Arefmtl/markitdown-extension/releases)
2. Follow steps 2-5 above

## 💡 How It Works

1. Open any AI chat (ChatGPT, Claude, etc.)
2. Click the **📄** floating button (bottom-right)
3. Drop or select a file
4. Preview the converted markdown
5. Click **⚡ Insert to Chat** — done!

## 📊 Token Savings

| File Type | Original Size | Markdown Size | Savings |
|-----------|--------------|---------------|---------|
| 10-page PDF | ~50 KB | ~5 KB | **90%** |
| Word Document | ~30 KB | ~3 KB | **90%** |
| Excel Spreadsheet | ~20 KB | ~2 KB | **90%** |
| PowerPoint | ~40 KB | ~4 KB | **90%** |

## 🛠️ Tech Stack

- **Manifest V3** Chrome Extension
- **PDF.js** — PDF text extraction
- **Mammoth.js** — DOCX to HTML/Markdown
- **SheetJS** — Excel to CSV/Markdown
- **Pure CSS** — No framework dependencies

## 📝 License

MIT License - feel free to use and modify.

## 🤝 Contributing

Contributions welcome! Open an issue or submit a PR.

---

**Made with ❤️ by [Aref](https://github.com/Arefmtl)**
