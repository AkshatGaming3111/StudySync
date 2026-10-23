const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const extensionDir = path.join(__dirname, '..', 'extension');
const distDir = path.join(__dirname, '..', 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const manifestPath = path.join(extensionDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version || '1.0.0';
const zipName = `studysync-companion-v${version}.zip`;
const outputZipPath = path.join(distDir, zipName);

console.log(`Packaging StudySync Companion Extension v${version}...`);

try {
  if (process.platform === 'win32') {
    execSync(`powershell -Command "Compress-Archive -Path '${extensionDir}\\*' -DestinationPath '${outputZipPath}' -Force"`);
  } else {
    execSync(`cd "${extensionDir}" && zip -r "${outputZipPath}" . -x "*.DS_Store"`);
  }

  const stats = fs.statSync(outputZipPath);

  console.log('==================================================');
  console.log(`🎉 Chrome Companion Extension Packaged Successfully!`);
  console.log(`📦 Archive: dist/${zipName} (${(stats.size / 1024).toFixed(2)} KB)`);
  console.log('==================================================');
  console.log('Next Steps for Chrome Web Store Publishing:');
  console.log('1. Go to Chrome Web Store Developer Dashboard: https://chrome.google.com/webstore/devconsole');
  console.log(`2. Click "New Item" and upload: ${outputZipPath}`);
  console.log('3. Use the store metadata and descriptions prepared in CHROMEWEBSTORE.md');
  console.log('4. Submit for review! (Typically approved within 24-48 hours)');
  console.log('==================================================');
} catch (err) {
  console.error('Packaging failed:', err.message);
  process.exit(1);
}
