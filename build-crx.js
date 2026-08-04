#!/usr/bin/env node
/**
 * MarkItDown Extension — CRX3 Builder
 * Generates .crx file for Chrome extension distribution
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SOURCE_DIR = __dirname;
const OUTPUT_DIR = path.join(__dirname, 'docs');
const KEY_FILE = path.join(SOURCE_DIR, 'extension.pem');
const PUB_FILE = path.join(SOURCE_DIR, 'extension.pub');
const ZIP_FILE = path.join(SOURCE_DIR, 'extension.zip');
const CRX_FILE = path.join(OUTPUT_DIR, 'markitdown-extension.crx');

// Files to exclude from ZIP
const EXCLUDE = [
  '.git', 'node_modules', 'tests', 'docs', 'tasks',
  '*.py', '*.crx', '*.pem', '*.pub', 'build-crx.js',
  'markitdown-extension.zip', '.github'
];

console.log('🔧 Building MarkItDown CRX3...\n');

// 1. Read manifest
const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'manifest.json'), 'utf8'));
console.log(`📦 Extension: ${manifest.name} v${manifest.version}`);

// 2. Generate or load key pair
if (!fs.existsSync(KEY_FILE)) {
  console.log('🔑 Generating new key pair...');
  execSync(`openssl genrsa -out "${KEY_FILE}" 2048 2>/dev/null`);
  execSync(`openssl rsa -in "${KEY_FILE}" -pubout -out "${PUB_FILE}" 2>/dev/null`);
  console.log('   ✅ Key pair generated');
} else {
  console.log('🔑 Using existing key pair');
}

// 3. Create ZIP
const excludeArgs = EXCLUDE.map(e => `-x "${e}"`).join(' ');
try {
  execSync(`cd "${SOURCE_DIR}" && zip -r "${ZIP_FILE}" . ${excludeArgs}`, {
    stdio: 'pipe'
  });
  const zipSize = (fs.statSync(ZIP_FILE).size / 1024).toFixed(1);
  console.log(`📦 ZIP created (${zipSize}KB)`);
} catch (err) {
  console.error('❌ ZIP creation failed:', err.message);
  process.exit(1);
}

// 4. Build CRX3
try {
  // CRX3 format: magic bytes + version + header + public key + signature + zip
  const zipData = fs.readFileSync(ZIP_FILE);
  const pubKey = fs.readFileSync(PUB_FILE);
  
  // Read private key for signing
  const privateKey = fs.readFileSync(KEY_FILE, 'utf8');
  
  // Create signed data
  const signedData = crypto.createSign('SHA256')
    .update(zipData)
    .sign(privateKey);
  
  // CRX3 header
  const crxVersion = 3;
  const header = Buffer.alloc(16);
  header.write('CRX3', 0);  // Magic
  header.writeUInt32LE(crxVersion, 4);  // Version
  header.writeUInt32LE(pubKey.length + signedData.length + 24, 8);  // Header size
  
  // Assemble CRX
  const crx = Buffer.concat([
    header,
    pubKey,
    Buffer.from([0x00, 0x00]),  // Padding
    signedData,
    zipData
  ]);
  
  fs.writeFileSync(CRX_FILE, crx);
  const crxSize = (fs.statSync(CRX_FILE).size / 1024).toFixed(1);
  console.log(`✅ CRX3 built: markitdown-extension.crx (${crxSize}KB)`);
} catch (err) {
  console.error('❌ CRX3 build failed:', err.message);
  // Fallback: just copy ZIP as CRX
  fs.copyFileSync(ZIP_FILE, CRX_FILE);
  console.log('⚠️ Fallback: copied ZIP as CRX');
}

// 5. Create updates.xml
const updatesXml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='markitdown-extension'>
    <updatecheck codebase='https://arefmtl.github.io/markitdown-extension/markitdown-extension.crx' version='${manifest.version}' />
  </app>
</gupdate>`;

fs.writeFileSync(path.join(OUTPUT_DIR, 'updates.xml'), updatesXml);
console.log(`📄 updates.xml created (v${manifest.version})`);

// 6. Cleanup temp files
try { fs.unlinkSync(ZIP_FILE); } catch {}
try { fs.unlinkSync(CRX_FILE + '.tmp'); } catch {}

console.log('\n🧹 Done!');
console.log(`\n📁 Output: ${OUTPUT_DIR}`);
console.log(`   - markitdown-extension.crx`);
console.log(`   - updates.xml`);
console.log(`\n🌐 GitHub Pages URL:`);
console.log(`   https://arefmtl.github.io/markitdown-extension/`);
