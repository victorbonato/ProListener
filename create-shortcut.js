// Creates a desktop launcher for Pro Listener so the app starts with a
// double-click, no terminal needed. Run once after `npm install`:
//   npm run shortcut
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const projectDir = __dirname;
const desktop = path.join(os.homedir(), 'Desktop');

function createWindowsShortcut() {
  const electronExe = path.join(projectDir, 'node_modules', 'electron', 'dist', 'electron.exe');
  requireFile(electronExe);
  const script = `
    $shell = New-Object -ComObject WScript.Shell
    $lnk = $shell.CreateShortcut('${path.join(desktop, 'Pro Listener.lnk')}')
    $lnk.TargetPath = '${electronExe}'
    $lnk.Arguments = '"${projectDir}"'
    $lnk.WorkingDirectory = '${projectDir}'
    $lnk.Description = 'Record system audio and transcribe it with WhisperAI'
    $lnk.Save()
  `;
  execFileSync('powershell.exe', ['-NoProfile', '-Command', script]);
  return path.join(desktop, 'Pro Listener.lnk');
}

function createMacApp() {
  const electronBin = path.join(
    projectDir, 'node_modules', 'electron', 'dist',
    'Electron.app', 'Contents', 'MacOS', 'Electron'
  );
  requireFile(electronBin);

  const appDir = path.join(desktop, 'Pro Listener.app');
  const macosDir = path.join(appDir, 'Contents', 'MacOS');
  fs.mkdirSync(macosDir, { recursive: true });

  fs.writeFileSync(
    path.join(appDir, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Pro Listener</string>
  <key>CFBundleExecutable</key><string>pro-listener</string>
  <key>CFBundleIdentifier</key><string>com.prolistener.launcher</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict>
</plist>
`
  );

  const launcher = path.join(macosDir, 'pro-listener');
  fs.writeFileSync(launcher, `#!/bin/sh\nexec "${electronBin}" "${projectDir}"\n`);
  fs.chmodSync(launcher, 0o755);
  return appDir;
}

function createLinuxDesktopEntry() {
  const electronBin = path.join(projectDir, 'node_modules', 'electron', 'dist', 'electron');
  requireFile(electronBin);
  const entry = path.join(desktop, 'pro-listener.desktop');
  fs.writeFileSync(
    entry,
    `[Desktop Entry]\nType=Application\nName=Pro Listener\nComment=Record system audio and transcribe it with WhisperAI\nExec="${electronBin}" "${projectDir}"\nTerminal=false\n`
  );
  fs.chmodSync(entry, 0o755);
  return entry;
}

function requireFile(file) {
  if (!fs.existsSync(file)) {
    console.error(`Electron binary not found (${file}) — run 'npm install' first.`);
    process.exit(1);
  }
}

const created =
  process.platform === 'win32' ? createWindowsShortcut() :
  process.platform === 'darwin' ? createMacApp() :
  createLinuxDesktopEntry();

console.log(`Desktop launcher created: ${created}`);
