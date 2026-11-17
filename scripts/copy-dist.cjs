const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const webDist = path.join(rootDir, 'apps', 'web', 'dist');
const rootDist = path.join(rootDir, 'dist');
const nestedDist = path.join(rootDir, 'apps', 'web', 'apps', 'web', 'dist');

if (fs.existsSync(webDist)) {
  // 1. Root dist/ (for Vercel root directory builds)
  fs.cpSync(webDist, rootDist, { recursive: true });

  // 2. apps/web/apps/web/dist (if Vercel runs in apps/web with outputDirectory apps/web/dist)
  try {
    fs.mkdirSync(path.dirname(nestedDist), { recursive: true });
    fs.cpSync(webDist, nestedDist, { recursive: true });
  } catch (_) {}
}
