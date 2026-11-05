// Remote Firing Analyzer launcher:  npm start   (or node server/start.mjs, or start-app.bat)
// Installs and builds the first time, starts MediaMTX (CCTV) and the local database, which also serves
// the app, and opens http://localhost:3939. Runs through Node.js itself, so Windows Smart App Control
// does not block it the way it blocks a downloaded .bat file.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const argPort = process.argv.indexOf('--port');
const port = Number(argPort > 0 ? process.argv[argPort + 1] : process.env.RFA_PORT ?? 3939);
const url = `http://localhost:${port}`;
const say = (m) => console.log(m);

function run(cmd) {
  say(`> ${cmd}`);
  const r = spawnSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    say(`\n"${cmd}" did not finish. Read the message above, then start again.`);
    process.exit(1);
  }
}

// 1. Windows marks files that came in a downloaded zip; Smart App Control then blocks the .bat
//    launchers and MediaMTX. The user started this, so take that mark off the project's own files.
if (win) {
  const dirs = [root, path.join(root, 'mediamtx')].filter((d) => fs.existsSync(d)).map((d) => `'${d.replace(/'/g, "''")}'`).join(',');
  spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Get-ChildItem -LiteralPath ${dirs} -File | Unblock-File`], { stdio: 'ignore' });
}

// 2. First run: install and build
if (!fs.existsSync(path.join(root, 'node_modules', 'sql.js', 'package.json'))) {
  say('Installing the app - first time only, this needs internet ...');
  run('npm install');
}
if (!fs.existsSync(path.join(root, 'out', 'index.html'))) {
  say('Building the app - first time only, about one minute ...');
  run('npm run build');
}

// 3. MediaMTX for CCTV cameras (own window; it closes by itself if it is already running)
const mtx = path.join(root, 'mediamtx', win ? 'mediamtx.exe' : 'mediamtx');
if (fs.existsSync(mtx) && process.env.RFA_NO_MEDIAMTX !== '1') {
  try {
    const child = win
      ? spawn('cmd', ['/c', 'start', '"MediaMTX"', '/min', 'mediamtx.exe', 'mediamtx.yml'], { cwd: path.dirname(mtx), detached: true, stdio: 'ignore', windowsVerbatimArguments: true })
      : spawn(mtx, ['mediamtx.yml'], { cwd: path.dirname(mtx), detached: true, stdio: 'ignore' });
    child.on('error', (e) => say(`MediaMTX could not start (${e.message}). Photos and USB cameras still work; CCTV needs it.`));
    child.unref();
  } catch (e) {
    say(`MediaMTX could not start (${e.message}). Photos and USB cameras still work; CCTV needs it.`);
  }
}

// 4. The database (serves the app too) in this window
const t0 = Date.now();
const server = spawn(process.execPath, [path.join(root, 'server', 'server.mjs'), ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
function openBrowser() {
  if (process.env.RFA_NO_BROWSER === '1') return;
  const open = win ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(open[0], open[1], { detached: true, stdio: 'ignore', windowsVerbatimArguments: win }).on('error', () => {}).unref();
  } catch { /* no browser to open: the address is printed above */ }
}
server.on('exit', (code) => {
  if (code) say('\nThe RFA database stopped. Read the message above.');
  else if (Date.now() - t0 < 15000) openBrowser(); // it was already running: just open the app
  setTimeout(() => process.exit(code ?? 0), 300);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill(sig));

// 5. Open the browser once it answers
const timer = setInterval(async () => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) });
    if ((await r.json())?.app !== 'rfa-local-db') return;
  } catch {
    if (Date.now() - t0 < 30000) return;
    clearInterval(timer);
    return;
  }
  clearInterval(timer);
  openBrowser();
}, 500);
