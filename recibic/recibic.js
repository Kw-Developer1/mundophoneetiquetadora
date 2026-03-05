const { app, BrowserWindow, ipcMain, dialog, shell } = require(‘electron’);
const path   = require(‘path’);
const fs     = require(‘fs’);
const mysql  = require(‘mysql2/promise’);

const cfgDir       = path.join(app.getPath(‘userData’), ‘config’);
const cfgFile      = path.join(cfgDir, ‘db.json’);
const perfilesFile = path.join(cfgDir, ‘perfiles.json’);
if (!fs.existsSync(cfgDir)) fs.mkdirSync(cfgDir, { recursive: true });

const logsDir = path.join(process.resourcesPath ? path.dirname(process.execPath) : __dirname, ‘logs’);
if (!fs.existsSync(logsDir)) { try { fs.mkdirSync(logsDir, { recursive: true }); } catch {} }

const SECURITY_CONFIG = {
deleteRecibo:  { enabled: true, password: ‘Comunica2’ },
deleteCliente: { enabled: true, password: ‘Comunica2’ },
accessConfig:  { enabled: true, password: ‘Comunica2’ },
};

function getLogFile() {
const today = new Date().toISOString().slice(0, 10);
return path.join(logsDir, `mundo-phone-${today}.log`);
}

function writeLog(level, action, detail = ‘’) {
try {
const now  = new Date();
const ts   = now.toISOString().replace(‘T’, ’ ’).slice(0, 19);
const line = `[${ts}] [${level.toUpperCase().padEnd(5)}] ${action}${detail ? ' | ' + detail : ''}\n`;
fs.appendFileSync(getLogFile(), line, ‘utf8’);
console.log(line.trim());
} catch (err) {
console.error(‘Error escribiendo log:’, err.message);
}
}

writeLog(‘INFO’, ‘APP_START’, `Mundo Phone v2 iniciado. Logs en: ${logsDir}`);

function loadDbConfig() {
if (fs.existsSync(cfgFile)) {
try { return JSON.parse(fs.readFileSync(cfgFile, ‘utf8’)); } catch {}
}
return { host: ‘127.0.0.1’, port: 3306, user: ‘root’, password: ‘’, database: ‘mundophone’ };
}
function saveDbConfigFile(cfg) { fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2)); }

const DEFAULT_PERFILES = {
chiclana: {
id: ‘chiclana’, nombre: ‘Chiclana’,
empresa: ‘MUNDO PHONE’, sub: ‘Chiclana de la Frontera’,
dir: ‘C. Alfonso XII, 1 · 11130 Chiclana, Cádiz’, tel: ‘956 532 107’,
cif: ‘’, logo: ‘https://r2.fivemanage.com/i5uH4tS6GQkgOLgIpMVi4/letrasnegra.png’,
qrUrl: ‘https://mundophone.es/’, impresora: ‘’,
emailUser: ‘’, emailPass: ‘’, emailHost: ‘smtp.gmail.com’, emailPort: 587,
},
vejer: {
id: ‘vejer’, nombre: ‘Vejer’,
empresa: ‘MUNDO PHONE’, sub: ‘Vejer de la Frontera’,
dir: ‘Av. Andalucía, 29, B, 11150 Vejer de la Frontera, Cádiz’, tel: ‘856 66 08 29’,
cif: ‘’, logo: ‘https://r2.fivemanage.com/i5uH4tS6GQkgOLgIpMVi4/letrasnegra.png’,
qrUrl: ‘https://mundophone.es/’, impresora: ‘’,
emailUser: ‘’, emailPass: ‘’, emailHost: ‘smtp.gmail.com’, emailPort: 587,
}
};

function loadPerfiles() {
if (fs.existsSync(perfilesFile)) {
try { return JSON.parse(fs.readFileSync(perfilesFile, ‘utf8’)); } catch {}
}
return DEFAULT_PERFILES;
}
function savePerfilesFile(p) { fs.writeFileSync(perfilesFile, JSON.stringify(p, null, 2)); }

let pool = null;
async function createPool(cfg) {
if (pool) { try { await pool.end(); } catch {} }
pool = mysql.createPool({
host: cfg.host, port: parseInt(cfg.port) || 3306,
user: cfg.user, password: cfg.password, database: cfg.database,
waitForConnections: true, connectionLimit: 5
});
}
async function initDb(cfg) {
const tmp  = mysql.createPool({ host: cfg.host, port: parseInt(cfg.port) || 3306, user: cfg.user, password: cfg.password, connectionLimit: 2 });
const conn = await tmp.getConnection();
await conn.query(`CREATE DATABASE IF NOT EXISTS \`${cfg.database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
conn.release(); await tmp.end();

await createPool(cfg);
const c = await pool.getConnection();

await c.query(`CREATE TABLE IF NOT EXISTS clientes ( id VARCHAR(36) NOT NULL PRIMARY KEY, nombre VARCHAR(255) NOT NULL, dni VARCHAR(20), telefono VARCHAR(30), email VARCHAR(255), created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

await c.query(`CREATE TABLE IF NOT EXISTS recibos ( id VARCHAR(36) NOT NULL PRIMARY KEY, num VARCHAR(20) NOT NULL, cliente_id VARCHAR(36) NOT NULL, tienda VARCHAR(30) DEFAULT 'chiclana', nombre VARCHAR(255) NOT NULL, dni VARCHAR(20), telefono VARCHAR(30), email VARCHAR(255), concepto TEXT, importe DECIMAL(10,2) NOT NULL DEFAULT 0, mes_pago VARCHAR(7) DEFAULT NULL, femis DATE, fvenc DATE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX idx_cliente(cliente_id), INDEX idx_femis(femis), INDEX idx_num(num), INDEX idx_tienda(tienda), INDEX idx_mes_pago(mes_pago) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

await c.query(`CREATE TABLE IF NOT EXISTS perfiles ( id VARCHAR(30) NOT NULL PRIMARY KEY, nombre VARCHAR(100), empresa VARCHAR(255), sub VARCHAR(255), dir VARCHAR(500), tel VARCHAR(50), cif VARCHAR(30), logo TEXT, qr_url VARCHAR(500), impresora VARCHAR(255), email_user VARCHAR(255), email_pass VARCHAR(255), email_host VARCHAR(255), email_port INT DEFAULT 587, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

try { await c.query(`ALTER TABLE recibos ADD COLUMN tienda VARCHAR(30) DEFAULT 'chiclana'`); } catch {}
try { await c.query(`ALTER TABLE recibos ADD INDEX idx_tienda(tienda)`); } catch {}
try { await c.query(`ALTER TABLE recibos ADD COLUMN mes_pago VARCHAR(7) DEFAULT NULL`); } catch {}
try { await c.query(`ALTER TABLE recibos ADD INDEX idx_mes_pago(mes_pago)`); } catch {}

for (const [pid, p] of Object.entries(DEFAULT_PERFILES)) {
await c.query(`INSERT INTO perfiles (id,nombre,empresa,sub,dir,tel,cif,logo,qr_url,impresora,email_user,email_pass,email_host,email_port) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id`, [pid, p.nombre, p.empresa, p.sub, p.dir, p.tel || ‘’, p.cif || ‘’, p.logo || ‘’,
p.qrUrl || ‘’, p.impresora || ‘’, p.emailUser || ‘’, p.emailPass || ‘’,
p.emailHost || ‘smtp.gmail.com’, p.emailPort || 587]);
}

c.release();
writeLog(‘INFO’, ‘DB_INIT’, `Conectado a MySQL: ${cfg.host}:${cfg.port}/${cfg.database}`);
}

let mainWindow;
function createWindow() {
mainWindow = new BrowserWindow({
width: 1200, height: 880, minWidth: 860, minHeight: 640,
title: ‘Mundo Phone – Recibos’, backgroundColor: ‘#f2f5fb’,
webPreferences: { preload: path.join(__dirname, ‘preload.js’), contextIsolation: true, nodeIntegration: false }
});
mainWindow.loadFile(path.join(__dirname, ‘src’, ‘index.html’));
if (process.argv.includes(’–dev’)) mainWindow.webContents.openDevTools();
}

app.whenReady().then(async () => {
const cfg = loadDbConfig();
try { await initDb(cfg); console.log(‘MySQL conectado’); }
catch (err) { console.error(‘MySQL no disponible:’, err.message); writeLog(‘ERROR’, ‘DB_INIT_FAIL’, err.message); pool = null; }
createWindow();
});
app.on(‘window-all-closed’, () => {
writeLog(‘INFO’, ‘APP_STOP’, ‘Aplicación cerrada’);
if (process.platform !== ‘darwin’) app.quit();
});
app.on(‘activate’, () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── DB config ──────────────────────────────────────────────────────────────
ipcMain.handle(‘db:getConfig’, () => loadDbConfig());
ipcMain.handle(‘db:setConfig’, async (*, cfg) => {
try {
await initDb(cfg); saveDbConfigFile(cfg);
writeLog(‘INFO’, ‘DB_CONFIG_SAVED’, `${cfg.host}:${cfg.port}/${cfg.database}`);
return { ok: true };
} catch (err) { writeLog(‘ERROR’, ‘DB_CONFIG_FAIL’, err.message); return { ok: false, error: err.message }; }
});
ipcMain.handle(‘db:test’, async (*, cfg) => {
try {
const t = mysql.createPool({ host: cfg.host, port: parseInt(cfg.port) || 3306, user: cfg.user, password: cfg.password, connectionLimit: 1 });
await t.query(‘SELECT 1’); await t.end(); return { ok: true };
} catch (err) { return { ok: false, error: err.message }; }
});

// ── Perfiles ────────────────────────────────────────────────────────────────
ipcMain.handle(‘perfiles:get’,  ()        => loadPerfiles());
ipcMain.handle(‘perfiles:save’, (_, data) => { savePerfilesFile(data); return { ok: true }; });

ipcMain.handle(‘perfiles:getDb’, async () => {
if (!pool) return {};
try {
const [rows] = await pool.query(‘SELECT * FROM perfiles’);
const result = {};
rows.forEach(r => {
result[r.id] = {
id: r.id, nombre: r.nombre, empresa: r.empresa, sub: r.sub,
dir: r.dir, tel: r.tel, cif: r.cif, logo: r.logo,
qrUrl: r.qr_url, impresora: r.impresora,
emailUser: r.email_user, emailPass: r.email_pass,
emailHost: r.email_host, emailPort: r.email_port,
};
});
return result;
} catch { return {}; }
});

ipcMain.handle(‘perfiles:saveDb’, async (_, id, p) => {
if (!pool) return { ok: false, error: ‘Sin conexión a BD’ };
try {
await pool.query(`INSERT INTO perfiles (id,nombre,empresa,sub,dir,tel,cif,logo,qr_url,impresora,email_user,email_pass,email_host,email_port) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), empresa=VALUES(empresa), sub=VALUES(sub), dir=VALUES(dir), tel=VALUES(tel), cif=VALUES(cif), logo=VALUES(logo), qr_url=VALUES(qr_url), impresora=VALUES(impresora), email_user=VALUES(email_user), email_pass=VALUES(email_pass), email_host=VALUES(email_host), email_port=VALUES(email_port), updated_at=NOW()`, [id, p.nombre || ‘’, p.empresa || ‘’, p.sub || ‘’, p.dir || ‘’, p.tel || ‘’,
p.cif || ‘’, p.logo || ‘’, p.qrUrl || ‘’, p.impresora || ‘’,
p.emailUser || ‘’, p.emailPass || ‘’, p.emailHost || ‘smtp.gmail.com’, parseInt(p.emailPort) || 587]);
writeLog(‘INFO’, ‘PERFIL_SAVED’, `id=${id} empresa=${p.empresa || ''}`);
return { ok: true };
} catch (err) { writeLog(‘ERROR’, ‘PERFIL_SAVE_FAIL’, err.message); return { ok: false, error: err.message }; }
});

// ── Impresora ───────────────────────────────────────────────────────────────
ipcMain.handle(‘print:getList’, async () => {
try {
const list = await mainWindow.webContents.getPrintersAsync();
return list.map(p => ({ name: p.name, isDefault: p.isDefault }));
} catch { return []; }
});

ipcMain.handle(‘print:ticket’, (_, { html, printerName }) => {
return new Promise(resolve => {
const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
win.loadURL(‘data:text/html;charset=utf-8,’ + encodeURIComponent(html));
win.webContents.once(‘did-finish-load’, () => {
setTimeout(() => {
const opts = {
silent: true, printBackground: true,
pageSize: { width: 80000, height: 500000 },
margins: { marginType: ‘none’ }
};
if (printerName) opts.deviceName = printerName;
win.webContents.print(opts, (success, err) => {
win.destroy();
writeLog(success ? ‘INFO’ : ‘WARN’, ‘PRINT_TICKET’,
success ? `OK printer=${printerName || 'default'}` : `FAIL ${err}`);
resolve({ ok: success, error: err });
});
}, 600);
});
});
});

// ── Clientes ────────────────────────────────────────────────────────────────
ipcMain.handle(‘clientes:list’, async () => {
const [r] = await pool.query(‘SELECT * FROM clientes ORDER BY nombre’);
return r;
});
ipcMain.handle(‘clientes:count’, async () => {
const [[r]] = await pool.query(‘SELECT COUNT(*) AS n FROM clientes’);
return r.n;
});
ipcMain.handle(‘clientes:search’, async (_, q) => {
const l = `%${q}%`;
const [r] = await pool.query(
‘SELECT * FROM clientes WHERE nombre LIKE ? OR dni LIKE ? OR telefono LIKE ? OR email LIKE ? ORDER BY nombre LIMIT 20’,
[l, l, l, l]
);
return r;
});

ipcMain.handle(‘clientes:upsert’, async (_, c) => {
await pool.query(
`INSERT INTO clientes (id,nombre,dni,telefono,email) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre),dni=VALUES(dni),telefono=VALUES(telefono),email=VALUES(email),updated_at=NOW()`,
[c.id, c.nombre, c.dni || null, c.telefono || null, c.email || null]
);
writeLog(‘INFO’, ‘CLIENTE_UPSERT’, `id=${c.id} nombre=${c.nombre}`);
return { ok: true };
});

// ── NUEVO: Actualizar datos de un cliente existente ──────────────────────────
ipcMain.handle(‘clientes:update’, async (_, c) => {
if (!pool) return { ok: false, error: ‘Sin conexión a BD’ };
try {
await pool.query(
`UPDATE clientes SET nombre=?, dni=?, telefono=?, email=?, updated_at=NOW() WHERE id=?`,
[c.nombre, c.dni || null, c.telefono || null, c.email || null, c.id]
);
// Sincronizar los datos denormalizados en recibos existentes
await pool.query(
`UPDATE recibos SET nombre=?, dni=?, telefono=?, email=? WHERE cliente_id=?`,
[c.nombre, c.dni || null, c.telefono || null, c.email || null, c.id]
);
writeLog(‘INFO’, ‘CLIENTE_UPDATE’, `id=${c.id} nombre=${c.nombre}`);
return { ok: true };
} catch (err) {
writeLog(‘ERROR’, ‘CLIENTE_UPDATE_FAIL’, `id=${c.id} error=${err.message}`);
return { ok: false, error: err.message };
}
});
// ────────────────────────────────────────────────────────────────────────────

ipcMain.handle(‘clientes:delete’, async (_, id) => {
if (!pool) return { ok: false, error: ‘Sin conexión a BD’ };
try {
const [[cli]] = await pool.query(‘SELECT nombre FROM clientes WHERE id=?’, [id]);
await pool.query(‘DELETE FROM clientes WHERE id=?’, [id]);
writeLog(‘WARN’, ‘CLIENTE_DELETE’, `id=${id} nombre=${cli?.nombre || '?'}`);
return { ok: true };
} catch (err) {
writeLog(‘ERROR’, ‘CLIENTE_DELETE_FAIL’, `id=${id} error=${err.message}`);
return { ok: false, error: err.message };
}
});

// ── Recibos ─────────────────────────────────────────────────────────────────
ipcMain.handle(‘recibos:add’, async (_, r) => {
await pool.query(
`INSERT INTO recibos (id,num,cliente_id,tienda,nombre,dni,telefono,email,concepto,importe,mes_pago,femis,fvenc) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
[r.id, r.num, r.clienteId, r.tienda || ‘chiclana’, r.nombre, r.dni || null,
r.telefono || null, r.email || null, r.concepto || null, r.importe,
r.mesPago || null, r.femis || null, r.fvenc || null]
);
writeLog(‘INFO’, ‘RECIBO_ADD’,
`num=${r.num} cliente=${r.nombre} importe=${r.importe} mes_pago=${r.mesPago || '-'} tienda=${r.tienda || 'chiclana'}`);
return { ok: true };
});

ipcMain.handle(‘recibos:list’, async (_, id) => {
const [r] = await pool.query(
‘SELECT * FROM recibos WHERE cliente_id=? ORDER BY femis DESC, created_at DESC’, [id]
);
return r;
});

ipcMain.handle(‘recibos:nextNum’, async () => {
const [[r]] = await pool.query(‘SELECT MAX(CAST(num AS UNSIGNED)) AS mx FROM recibos’);
return String((r.mx || 0) + 1).padStart(3, ‘0’);
});

ipcMain.handle(‘recibos:filter’, async (_, f) => {
let sql = `SELECT r.* FROM recibos r LEFT JOIN clientes c ON c.id=r.cliente_id WHERE 1=1`;
const p = [];
if (f.tienda)  { sql += ’ AND r.tienda=?’;                                          p.push(f.tienda); }
if (f.desde)   { sql += ’ AND r.femis>=?’;                                          p.push(f.desde); }
if (f.hasta)   { sql += ’ AND r.femis<=?’;                                          p.push(f.hasta); }
if (f.q)       { sql += ’ AND (r.nombre LIKE ? OR r.concepto LIKE ? OR r.num LIKE ?)’; const l = `%${f.q}%`; p.push(l, l, l); }
if (f.mes)     { sql += ’ AND DATE_FORMAT(r.femis,”%Y-%m”)=?’;                      p.push(f.mes); }
if (f.mesPago) { sql += ’ AND r.mes_pago=?’;                                        p.push(f.mesPago); }
sql += ’ ORDER BY r.femis DESC, r.created_at DESC LIMIT 500’;
const [r] = await pool.query(sql, p);
return r;
});

ipcMain.handle(‘recibos:delete’, async (_, id) => {
if (!pool) return { ok: false, error: ‘Sin conexión a BD’ };
try {
const [[rec]] = await pool.query(‘SELECT num, nombre, importe FROM recibos WHERE id=?’, [id]);
await pool.query(‘DELETE FROM recibos WHERE id=?’, [id]);
writeLog(‘WARN’, ‘RECIBO_DELETE’,
`id=${id} num=${rec?.num || '?'} cliente=${rec?.nombre || '?'} importe=${rec?.importe || '?'}`);
return { ok: true };
} catch (err) {
writeLog(‘ERROR’, ‘RECIBO_DELETE_FAIL’, `id=${id} error=${err.message}`);
return { ok: false, error: err.message };
}
});

// ── Seguridad / contraseñas ──────────────────────────────────────────────────
ipcMain.handle(‘recibos:checkDeletePassword’, (_, password) => {
const cfg = SECURITY_CONFIG.deleteRecibo;
if (!cfg.enabled) return { ok: true, skipped: true };
const ok = password === cfg.password;
if (!ok) writeLog(‘WARN’, ‘DELETE_PASSWORD_FAIL’, ‘Intento fallido — eliminar recibo’);
return { ok };
});

ipcMain.handle(‘clientes:checkDeletePassword’, (_, password) => {
const cfg = SECURITY_CONFIG.deleteCliente;
if (!cfg.enabled) return { ok: true, skipped: true };
const ok = password === cfg.password;
if (!ok) writeLog(‘WARN’, ‘DELETE_PASSWORD_FAIL’, ‘Intento fallido — eliminar cliente’);
return { ok };
});

ipcMain.handle(‘config:checkPassword’, (_, password) => {
const cfg = SECURITY_CONFIG.accessConfig;
if (!cfg.enabled) return { ok: true, skipped: true };
const ok = password === cfg.password;
if (!ok) writeLog(‘WARN’, ‘CONFIG_PASSWORD_FAIL’, ‘Intento fallido — acceso a configuración’);
return { ok };
});

ipcMain.handle(‘security:getConfig’, () => ({
deleteRecibo:  SECURITY_CONFIG.deleteRecibo.enabled,
deleteCliente: SECURITY_CONFIG.deleteCliente.enabled,
accessConfig:  SECURITY_CONFIG.accessConfig.enabled,
}));

// ── Stats ────────────────────────────────────────────────────────────────────
ipcMain.handle(‘stats:monthly’, async (_, tienda) => {
let sql = ` SELECT DATE_FORMAT(femis,'%Y-%m') AS mes, COUNT(*) AS total_recibos, SUM(importe) AS total_importe, COUNT(DISTINCT cliente_id) AS clientes_unicos FROM recibos WHERE femis IS NOT NULL`;
const p = [];
if (tienda) { sql += ’ AND tienda=?’; p.push(tienda); }
sql += ’ GROUP BY mes ORDER BY mes DESC LIMIT 24’;
const [r] = await pool.query(sql, p);
return r;
});

ipcMain.handle(‘stats:global’, async (_, tienda) => {
let sql = `SELECT COUNT(*) AS recibos, SUM(importe) AS total, COUNT(DISTINCT cliente_id) AS clientes FROM recibos`;
const p = [];
if (tienda) { sql += ’ WHERE tienda=?’; p.push(tienda); }
const [[g]] = await pool.query(sql, p);
return g;
});

// ── PDF ──────────────────────────────────────────────────────────────────────
ipcMain.handle(‘pdf:export’, async (_, { html, filename }) => {
const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
title: ‘Guardar PDF’, defaultPath: filename || ‘recibo.pdf’,
filters: [{ name: ‘PDF’, extensions: [‘pdf’] }]
});
if (canceled || !filePath) return { ok: false };
let puppeteer;
try { puppeteer = require(‘puppeteer’); } catch { return { ok: false, error: ‘puppeteer no instalado’ }; }
const browser = await puppeteer.launch({ headless: ‘new’ });
const page    = await browser.newPage();
await page.setContent(html, { waitUntil: ‘networkidle0’ });
await page.pdf({
path: filePath, width: ‘80mm’, printBackground: true,
margin: { top: ‘3mm’, bottom: ‘3mm’, left: ‘5mm’, right: ‘3mm’ }
});
await browser.close();
shell.showItemInFolder(filePath);
writeLog(‘INFO’, ‘PDF_EXPORT’, filePath);
return { ok: true, filePath };
});

// ── Email ────────────────────────────────────────────────────────────────────
ipcMain.handle(‘email:send’, async (_, { perfilId, to, toName, recibo, htmlBody }) => {
let nodemailer;
try { nodemailer = require(‘nodemailer’); }
catch { return { ok: false, error: ‘nodemailer no instalado. Ejecuta: npm install’ }; }

const perfiles = loadPerfiles();
const perfil   = perfiles[perfilId];
if (!perfil?.emailUser || !perfil?.emailPass)
return { ok: false, error: ‘Configura el email en Configuración → perfil de tienda’ };

const transporter = nodemailer.createTransport({
host:   perfil.emailHost || ‘smtp.gmail.com’,
port:   parseInt(perfil.emailPort) || 587,
secure: parseInt(perfil.emailPort) === 465,
auth:   { user: perfil.emailUser, pass: perfil.emailPass }
});

try {
await transporter.sendMail({
from:    `"${perfil.empresa}" <${perfil.emailUser}>`,
to:      `"${toName}" <${to}>`,
subject: `Recibo Nº ${recibo.num} – ${perfil.empresa} (${perfil.nombre})`,
html:    htmlBody,
});
writeLog(‘INFO’, ‘EMAIL_SENT’, `to=${to} recibo=${recibo.num} tienda=${perfilId}`);
return { ok: true };
} catch (err) {
writeLog(‘ERROR’, ‘EMAIL_FAIL’, `to=${to} error=${err.message}`);
return { ok: false, error: err.message };
}
});

// ── Logs ─────────────────────────────────────────────────────────────────────
ipcMain.handle(‘logs:getDir’, () => logsDir);