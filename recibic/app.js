let perfiles      = {};
let tiendaActiva  = ‘chiclana’;
let currentRecibo = null;
let securityCfg   = { deleteRecibo: true, deleteCliente: true, accessConfig: true };

function uid() {
const a = new Uint8Array(12); crypto.getRandomValues(a);
return […a].map(b => b.toString(16).padStart(2, ‘0’)).join(’’);
}
function fmtMoney(n) {
return parseFloat(n || 0).toLocaleString(‘es-ES’, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ’ €’;
}
function fmtDate(d) {
if (!d) return ‘’;
const s = typeof d === ‘string’ ? d.slice(0, 10) : d.toISOString().slice(0, 10);
const [y, m, dd] = s.split(’-’);
return `${dd}/${m}/${y}`;
}
function addMonth(d) {
const dt = new Date(d); dt.setMonth(dt.getMonth() + 1);
return dt.toISOString().slice(0, 10);
}
function toast(msg, type = ‘’) {
const t = document.createElement(‘div’);
t.className = ‘toast ’ + type;
t.innerHTML = (type === ‘ok’  ? ‘<i class="fa-solid fa-circle-check"></i>’
: type === ‘err’ ? ‘<i class="fa-solid fa-circle-xmark"></i>’
: ‘<i class="fa-solid fa-circle-info"></i>’) + ’ ’ + msg;
document.getElementById(‘toastWrap’).appendChild(t);
setTimeout(() => t.remove(), 3400);
}
function monthLabel(key) {
if (!key || key === ‘Sin fecha’) return ‘Sin fecha’;
const [y, m] = key.split(’-’);
const meses = [‘Enero’,‘Febrero’,‘Marzo’,‘Abril’,‘Mayo’,‘Junio’,‘Julio’,‘Agosto’,‘Septiembre’,‘Octubre’,‘Noviembre’,‘Diciembre’];
return `${meses[parseInt(m) - 1]} ${y}`;
}
function perfil() { return perfiles[tiendaActiva] || {}; }

// Escapa HTML para usarlo dentro de value=”” y texto visible
function escHtml(str) {
return String(str || ‘’)
.replace(/&/g, ‘&’)
.replace(/”/g, ‘"’)
.replace(/</g, ‘<’)
.replace(/>/g, ‘>’);
}

function initMesPago() {
const sel = document.getElementById(‘f-mes-pago’);
if (!sel) return;
const meses = [‘Enero’,‘Febrero’,‘Marzo’,‘Abril’,‘Mayo’,‘Junio’,‘Julio’,‘Agosto’,‘Septiembre’,‘Octubre’,‘Noviembre’,‘Diciembre’];
const hoy = new Date();
sel.innerHTML = ‘<option value="">— Sin especificar —</option>’;
for (let i = -3; i <= 3; i++) {
const d   = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const lbl = `${meses[d.getMonth()]} ${d.getFullYear()}`;
const opt = document.createElement(‘option’);
opt.value = key; opt.textContent = lbl;
if (i === 0) opt.selected = true;
sel.appendChild(opt);
}
}

async function init() {
try { securityCfg = await window.api.getSecurityConfig(); } catch {}
try {
const dbPerfiles = await window.api.getPerfilesDb();
if (dbPerfiles && Object.keys(dbPerfiles).length > 0) perfiles = dbPerfiles;
else perfiles = await window.api.getPerfiles();
} catch { perfiles = await window.api.getPerfiles(); }
await initForm();
await checkDbStatus();
updateBadge();
actualizarStoreSwitcher();
await loadPrinters();
}

function switchStore(id) {
tiendaActiva = id;
actualizarStoreSwitcher();
document.getElementById(‘storeActiveLabel’).textContent = perfil().nombre || id;
toast(‘Tienda: ’ + (perfil().nombre || id), ‘ok’);
if (document.getElementById(‘tab-historial’)?.classList.contains(‘active’)) {
syncHistorialTienda(); loadHistorial();
}
}
function actualizarStoreSwitcher() {
document.querySelectorAll(’.store-btn’).forEach(b => b.classList.remove(‘active’));
document.getElementById(‘storeBtn-’ + tiendaActiva)?.classList.add(‘active’);
document.getElementById(‘storeActiveLabel’).textContent = perfil().nombre || tiendaActiva;
}
function syncHistorialTienda() {
const sel = document.getElementById(‘h-tienda’);
if (sel) sel.value = tiendaActiva;
}

document.querySelectorAll(’.nav-item[data-tab]’).forEach(btn => {
btn.addEventListener(‘click’, () => {
if (btn.dataset.tab === ‘config’) handleConfigTabClick();
else switchTab(btn.dataset.tab);
});
});

let configUnlocked = false;
async function handleConfigTabClick() {
if (!securityCfg.accessConfig || configUnlocked) { switchTab(‘config’); return; }
pedirClaveGenerico({
titulo:    ‘Acceso a Configuración’,
subtitulo: ‘Introduce la contraseña de administrador para continuar’,
icono:     ‘fa-gear’,
ipcCheck:  window.api.checkConfigPassword,
onSuccess: () => { configUnlocked = true; switchTab(‘config’); }
});
}

function switchTab(name) {
if (name !== ‘config’) configUnlocked = false;
document.querySelectorAll(’.nav-item’).forEach(b => b.classList.remove(‘active’));
document.querySelector(`.nav-item[data-tab="${name}"]`)?.classList.add(‘active’);
document.querySelectorAll(’.tab-panel’).forEach(p => p.classList.remove(‘active’));
document.getElementById(‘tab-’ + name)?.classList.add(‘active’);
if (name === ‘historial’) { syncHistorialTienda(); loadHistorial(); }
if (name === ‘clientes’)  loadClientesTab();
if (name === ‘stats’)     loadStats();
if (name === ‘config’)    loadConfigForms();
}

function switchCfgTab(name) {
document.querySelectorAll(’.cfg-tab’).forEach(b => b.classList.remove(‘active’));
document.querySelector(`.cfg-tab[data-cfg="${name}"]`)?.classList.add(‘active’);
document.querySelectorAll(’.cfg-panel’).forEach(p => p.classList.remove(‘active’));
document.getElementById(‘cfg-’ + name)?.classList.add(‘active’);
}

async function checkDbStatus() {
const dot = document.getElementById(‘dbDot’);
const txt = document.getElementById(‘dbStatusText’);
try {
await window.api.countClientes();
dot.className = ‘db-dot ok’; txt.textContent = ‘MySQL conectado’;
} catch {
dot.className = ‘db-dot err’; txt.textContent = ‘Sin conexión’;
}
}
async function updateBadge() {
try { document.getElementById(‘navBadgeClientes’).textContent = await window.api.countClientes(); } catch {}
}

async function initForm() {
const today = new Date().toISOString().slice(0, 10);
let num = ‘001’;
try { num = await window.api.nextNum(); } catch {}
document.getElementById(‘f-numero’).value   = num;
document.getElementById(‘f-femis’).value    = today;
document.getElementById(‘f-fvenc’).value    = addMonth(today);
document.getElementById(‘f-nombre’).value   = ‘’;
document.getElementById(‘f-dni’).value      = ‘’;
document.getElementById(‘f-telefono’).value = ‘’;
document.getElementById(‘f-email’).value    = ‘’;
document.getElementById(‘f-concepto’).value = ‘Recibo telefonía móvil’;
document.getElementById(‘f-importe’).value  = ‘’;
document.getElementById(‘preview-col’).style.display = ‘none’;
document.getElementById(‘email-status-area’).innerHTML = ‘’;
currentRecibo = null;
initMesPago();
}
function calcVenc() {
const fe = document.getElementById(‘f-femis’).value;
if (fe) document.getElementById(‘f-fvenc’).value = addMonth(fe);
}
function resetForm() { initForm(); toast(‘Formulario limpiado’); }

let acTimer;
async function acSearch(val) {
clearTimeout(acTimer);
const list = document.getElementById(‘ac-list’);
if (!val || val.length < 2) { list.style.display = ‘none’; return; }
acTimer = setTimeout(async () => {
try {
const matches = await window.api.searchClientes(val);
if (!matches.length) { list.style.display = ‘none’; return; }
list.innerHTML = matches.slice(0, 6).map(c =>
`<div class="ac-item" onclick="pickClientById('${c.id}')"> <div>${c.nombre}</div> <div class="ac-sub">${c.dni || ''} · ${c.telefono || ''}</div> </div>`).join(’’);
list.style.display = ‘block’;
} catch {}
}, 180);
}
async function pickClientById(id) {
const all = await window.api.listClientes();
const c = all.find(x => x.id === id);
if (!c) return;
document.getElementById(‘f-nombre’).value   = c.nombre;
document.getElementById(‘f-dni’).value      = c.dni || ‘’;
document.getElementById(‘f-telefono’).value = c.telefono || ‘’;
document.getElementById(‘f-email’).value    = c.email || ‘’;
document.getElementById(‘ac-list’).style.display = ‘none’;
toast(‘Cliente: ’ + c.nombre, ‘ok’);
}
async function findByDni(v) {
if (v.length < 6) return;
try {
const list = await window.api.searchClientes(v);
const c = list.find(x => x.dni && x.dni.toUpperCase() === v.toUpperCase());
if (c) pickClientById(c.id);
} catch {}
}
async function findByPhone(v) {
if (v.length < 7) return;
try {
const list = await window.api.searchClientes(v.replace(/\s/g, ‘’));
const c = list.find(x => x.telefono && x.telefono.replace(/\s/g, ‘’) === v.replace(/\s/g, ‘’));
if (c) pickClientById(c.id);
} catch {}
}
document.addEventListener(‘click’, e => {
if (!e.target.closest(’.field-wrap’)) document.getElementById(‘ac-list’).style.display = ‘none’;
});

async function generar() {
const nombre   = document.getElementById(‘f-nombre’).value.trim();
const dni      = document.getElementById(‘f-dni’).value.trim();
const telefono = document.getElementById(‘f-telefono’).value.trim();
const email    = document.getElementById(‘f-email’).value.trim();
const concepto = document.getElementById(‘f-concepto’).value.trim();
const mesPago  = document.getElementById(‘f-mes-pago’).value;
const importe  = parseFloat(document.getElementById(‘f-importe’).value);
const femis    = document.getElementById(‘f-femis’).value;
const fvenc    = document.getElementById(‘f-fvenc’).value;
const num      = document.getElementById(‘f-numero’).value;

if (!nombre)                { toast(‘Introduce el nombre del cliente’, ‘err’); return; }
if (!concepto)              { toast(‘Introduce el concepto’, ‘err’); return; }
if (!importe || importe <= 0) { toast(‘Introduce un importe válido’, ‘err’); return; }

let clienteId = uid();
try {
const list = await window.api.searchClientes(nombre);
const existing = list.find(c =>
(dni && c.dni && c.dni.toUpperCase() === dni.toUpperCase()) ||
(telefono && c.telefono && c.telefono.replace(/\s/g, ‘’) === telefono.replace(/\s/g, ‘’)) ||
c.nombre.toLowerCase() === nombre.toLowerCase()
);
if (existing) clienteId = existing.id;
await window.api.upsertCliente({ id: clienteId, nombre, dni, telefono, email });
} catch (e) { toast(’Error guardando cliente: ’ + e.message, ‘err’); return; }

const r = { id: uid(), num, clienteId, tienda: tiendaActiva, nombre, dni, telefono, email, concepto, mesPago, importe, femis, fvenc };
try { await window.api.addRecibo(r); }
catch (e) { toast(’Error guardando recibo: ’ + e.message, ‘err’); return; }

currentRecibo = r;
renderPreview(r);
document.getElementById(‘preview-col’).style.display = ‘block’;
document.getElementById(‘btn-email’).style.display = email ? ‘’ : ‘none’;
document.getElementById(‘preview-col’).scrollIntoView({ behavior: ‘smooth’, block: ‘start’ });
updateBadge();
toast(’Recibo Nº ’ + num + ’ generado — ’ + perfil().nombre, ‘ok’);
}

function renderPreview(r) {
const p = perfil();
[‘c’, ‘e’].forEach(s => {
document.getElementById(‘rec-empresa-’ + s).textContent = ‘’;
document.getElementById(‘rs-sub-’ + s).textContent      = p.sub || ‘’;
document.getElementById(‘rs-dir-’ + s).textContent      = p.dir || ‘’;
document.getElementById(‘rs-tel-’ + s).textContent      = p.tel ? ’<i class="fa-solid fa-phone"></i> ’ + p.tel : ‘’;
document.getElementById(‘rs-cif-’ + s).textContent      = p.cif ? ’CIF: ’ + p.cif : ‘’;
document.getElementById(‘rn-’ + s).textContent          = r.num;
document.getElementById(‘rf-’ + s).textContent          = fmtDate(r.femis);
document.getElementById(‘rv-’ + s).textContent          = fmtDate(r.fvenc);
document.getElementById(‘rc-importe-’ + s).textContent  = fmtMoney(r.importe);
const lc = document.getElementById(‘logo-’ + s);
lc.innerHTML = p.logo
? `<img src="${p.logo}" class="rec-logo-img" alt="${p.empresa}" onerror="this.parentElement.innerHTML='<div class=rec-logo-box><i class=fa-solid fa-mobile-screen></i></div>'">`
: ‘<div class="rec-logo-box"><i class="fa-solid fa-mobile-screen"></i></div>’;
const footer = document.getElementById(‘rec-footer-’ + s);
if (footer) footer.textContent = ‘Gracias por confiar en ’ + (p.empresa || ‘Mundo Phone’) + ’ · mundophone.es’;
const elMes = document.getElementById(‘rc-mes-’ + s);
if (elMes) elMes.textContent = r.mesPago ? monthLabel(r.mesPago) : ‘—’;
});
document.getElementById(‘rc-nombre-c’).textContent   = r.nombre;
document.getElementById(‘rc-tel-c’).textContent      = r.telefono || ‘—’;
document.getElementById(‘rc-concepto-c’).textContent = r.concepto;
document.getElementById(‘rc-nombre-e’).textContent         = r.nombre;
document.getElementById(‘rc-dni-e’).textContent            = r.dni || ‘—’;
document.getElementById(‘rc-tel-e’).textContent            = r.telefono || ‘—’;
document.getElementById(‘rc-concepto-e’).textContent       = r.concepto;
document.getElementById(‘rc-importe-detail-e’).textContent = fmtMoney(r.importe);
const qrC = document.getElementById(‘qr-c’); qrC.innerHTML = ‘’;
new QRCode(qrC, { text: p.qrUrl || ‘https://mundophone.es/’, width: 80, height: 80, colorDark: ‘#000000’, colorLight: ‘#ffffff’, correctLevel: QRCode.CorrectLevel.H });
}

async function imprimirTicket() {
if (!currentRecibo) { window.print(); return; }
const p = perfil();
const res = await window.api.printTicket({ html: buildTicketHtml(currentRecibo, p), printerName: p.impresora || ‘’ });
if (res.ok) toast(‘Ticket enviado a impresora’, ‘ok’);
else { toast(’Error de impresión: ’ + (res.error || ‘’), ‘err’); window.print(); }
}

async function exportarPdf() {
if (!currentRecibo) { toast(‘Genera primero un recibo’, ‘err’); return; }
const p   = perfil();
const res = await window.api.exportPdf({
html:     buildTicketHtml(currentRecibo, p),
filename: `Recibo-${currentRecibo.num}-${currentRecibo.nombre.replace(/\s+/g, '-')}.pdf`
});
if (res.ok) toast(‘PDF guardado’, ‘ok’);
else if (res.error) toast(’Error PDF: ’ + res.error, ‘err’);
}

async function enviarEmail() {
const r = currentRecibo;
if (!r || !r.email) { toast(‘No hay email de cliente’, ‘err’); return; }
const p          = perfil();
const statusArea = document.getElementById(‘email-status-area’);
const btn        = document.getElementById(‘btn-email’);
statusArea.innerHTML = `<div class="email-status sending"><i class="fa-solid fa-circle-notch fa-spin"></i> Enviando a ${r.email}…</div>`;
btn.disabled = true;
try {
const res = await window.api.sendEmail({ perfilId: tiendaActiva, to: r.email, toName: r.nombre, recibo: r, htmlBody: buildEmailHtml(r, p) });
if (res.ok) {
statusArea.innerHTML = `<div class="email-status sent"><i class="fa-solid fa-circle-check"></i> Enviado a <strong>${r.email}</strong></div>`;
toast(’Email enviado a ’ + r.email, ‘ok’);
} else {
statusArea.innerHTML = `<div class="email-status error"><i class="fa-solid fa-circle-xmark"></i> ${res.error}</div>`;
toast(’Error al enviar: ’ + res.error, ‘err’);
}
} catch (e) {
statusArea.innerHTML = `<div class="email-status error"><i class="fa-solid fa-circle-xmark"></i> ${e.message}</div>`;
toast(’Error: ’ + e.message, ‘err’);
} finally { btn.disabled = false; }
}

function buildTicketHtml(r, p) {
const empresa = (p.empresa || ‘MUNDO PHONE’).toUpperCase();
const qrUrl   = p.qrUrl || ‘https://mundophone.es/’;
const qrSrc   = `https://quickchart.io/qr?size=140&margin=0&text=${encodeURIComponent(qrUrl)}`;
const headerEmpresa = p.logo
? `<div class="center logo-wrap"><img src="${p.logo}" class="logo-img" alt="${empresa}" onerror="this.style.display='none';document.getElementById('fallback-nombre').style.display='block'"><div id="fallback-nombre" class="empresa" style="display:none">${empresa}</div></div>`
: `<div class="center empresa">${empresa}</div>`;
function row(label, value) {
return `<div class="row"><span class="l">${label}</span><span class="v">${value || '—'}</span></div>`;
}
return `<!DOCTYPE html><html><head><meta charset="UTF-8">

<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:69mm;font-family:"Courier New",monospace;font-size:10px;color:#000}
  @media print{@page{size:69mm auto;margin:1mm}}
  .ticket{padding:2mm 2mm}.center{text-align:center}
  .logo-wrap{text-align:center;margin-bottom:4px}.logo-img{max-width:56mm;max-height:18mm;object-fit:contain}
  .empresa{font-size:14px;font-weight:900;letter-spacing:1px}
  .sub{font-size:8px;margin-top:2px;font-weight:bold;color:#000}
  .hr{border-top:2px solid #000;margin:6px 0}.hr-d{border-top:1px dashed #000;margin:6px 0}
  .section{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;margin:8px 0 5px 0;padding-bottom:3px;border-bottom:1.5px solid #000}
  .row{display:flex;justify-content:space-between;gap:6px;width:100%;margin:3px 0}
  .l{font-weight:700;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .v{font-weight:800;flex:0 0 auto;text-align:right;max-width:42mm;word-break:break-word;white-space:normal}
  .total{border-top:2px solid #000;padding-top:6px;margin-top:6px;font-size:13px;font-weight:900;display:flex;justify-content:space-between}
  .pagado{border:2px solid #000;text-align:center;font-weight:900;padding:5px 0;margin-top:6px;letter-spacing:2px}
  .qr{text-align:center;margin-top:10px}.qr img{width:60px;height:60px}
  .footer{text-align:center;font-size:8px;margin-top:8px}
  .cut{text-align:center;border-top:1px dashed #000;border-bottom:1px dashed #000;margin:8px 0;padding:4px 0;font-size:8px;page-break-after:always}
  .badge-interno{background:#CFCFCF;color:#000;text-align:center;font-size:8px;font-weight:900;padding:4px;margin-bottom:6px;letter-spacing:2px}
</style></head><body>

<div class="ticket">
  ${headerEmpresa}
  ${p.sub ? `<div class="center sub">${p.sub}</div>` : ''}
  ${p.dir ? `<div class="center sub">${p.dir}</div>` : ''}
  ${p.tel ? `<div class="center sub">Tel: ${p.tel}</div>` : ''}
  <div class="hr"></div>
  <div class="section">Recibo</div>
  ${row('Nº:', r.num)}${row('Fecha:', fmtDate(r.femis))}${row('Vence:', fmtDate(r.fvenc))}
  <div class="section">Cliente</div>
  ${row('Nombre:', r.nombre)}${row('Teléfono:', r.telefono)}
  <div class="section">Detalle</div>
  ${row('Concepto:', r.concepto)}
  ${r.mesPago ? row('Mes de pago:', monthLabel(r.mesPago)) : ''}
  <div class="total"><span>TOTAL</span><span>${fmtMoney(r.importe)}</span></div>
  <div class="pagado">PAGADO</div>
  <div class="qr"><img src="${qrSrc}"></div>
  <div class="footer">Gracias por confiar en ${empresa}</div>
</div>
<div class="cut"></div>
<div class="ticket">
  <div class="badge-interno">COPIA INTERNA</div>
  ${headerEmpresa}
  <div class="hr"></div>
  <div class="section">Recibo</div>
  ${row('Nº:', r.num)}${row('Fecha:', fmtDate(r.femis))}${row('Vence:', fmtDate(r.fvenc))}
  <div class="section">Cliente</div>
  ${row('Nombre:', r.nombre)}${row('DNI:', r.dni)}${row('Teléfono:', r.telefono)}
  ${r.email ? row('Email:', r.email) : ''}
  <div class="section">Detalle</div>
  ${row('Concepto:', r.concepto)}
  ${r.mesPago ? row('Mes de pago:', monthLabel(r.mesPago)) : ''}
  ${row('Importe:', fmtMoney(r.importe))}${row('Tienda:', p.nombre || tiendaActiva)}
  <div class="total"><span>TOTAL PAGADO</span><span>${fmtMoney(r.importe)}</span></div>
  <div class="pagado">PAGADO</div>
</div>
<div style="page-break-after:always;"></div>
</body></html>`;
}

function buildEmailHtml(r, p) {
const logo = p.logo ? `<img src="${p.logo}" style="height:44px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;object-fit:contain">` : ‘’;
function row(label, val) {
return `<tr style="border-bottom:1px solid #f2f5fb"> <td style="padding:9px 16px;color:#7a8faa;font-size:13px;white-space:nowrap">${label}</td> <td style="padding:9px 16px;color:#0d1b2a;font-size:13px;font-weight:600;text-align:right">${val || '—'}</td></tr>`;
}
return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>

<body style="margin:0;padding:0;background:#f2f5fb;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5fb;padding:32px 16px">
<tr><td align="center">
<table width="100%" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
  <tr><td style="background:#0d1b2a;padding:28px 32px;text-align:center">
    ${logo}
    <div style="color:rgba(255,255,255,.5);font-size:12px;margin-top:4px">${p.sub || ''} ${p.nombre ? '— ' + p.nombre : ''}</div>
  </td></tr>
  <tr><td style="background:#00b67a;padding:10px;text-align:center">
    <span style="color:#fff;font-weight:800;font-size:14px;letter-spacing:2px">✓ RECIBO DE PAGO CONFIRMADO</span>
  </td></tr>
  <tr><td style="padding:28px 32px">
    <p style="color:#1e3a5f;font-size:15px;margin:0 0 20px">
      Hola <strong>${r.nombre}</strong>, aquí tienes tu recibo de <strong>${p.empresa || 'Mundo Phone'}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid #dce4f0;border-radius:10px;overflow:hidden;margin-bottom:20px">
      <tr style="background:#f2f5fb"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#7a8faa;text-transform:uppercase;letter-spacing:1px">Datos del recibo</td></tr>
      <tr><td><table width="100%" cellpadding="0" cellspacing="0">
        ${row('Nº Recibo', r.num)}
        ${row('Fecha', fmtDate(r.femis))}
        ${row('Vencimiento', fmtDate(r.fvenc))}
        ${row('Concepto', r.concepto)}
        ${r.mesPago ? row('Mes de pago', monthLabel(r.mesPago)) : ''}
        ${row('Teléfono', r.telefono)}
      </table></td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1b2a;border-radius:10px;margin-bottom:24px">
      <tr>
        <td style="padding:16px 20px;color:rgba(255,255,255,.6);font-size:13px">TOTAL PAGADO</td>
        <td style="padding:16px 20px;text-align:right;color:#fff;font-size:22px;font-weight:800">${fmtMoney(r.importe)}</td>
      </tr>
    </table>
    <p style="color:#7a8faa;font-size:12px;text-align:center;margin:0">
      Gracias por confiar en ${p.empresa || 'Mundo Phone'}.<br>
      ${p.dir ? p.dir + '<br>' : ''}${p.tel ? '📞 ' + p.tel + '<br>' : ''}${p.cif ? 'CIF: ' + p.cif : ''}
    </p>
  </td></tr>
  <tr><td style="background:#f2f5fb;padding:14px;text-align:center">
    <span style="color:#7a8faa;font-size:11px">Recibo generado automáticamente · ${p.empresa || 'Mundo Phone'}</span>
  </td></tr>
</table>
</td></tr>
</table></body></html>`;
}

// ── Historial ────────────────────────────────────────────────────────────────
let histDebounce;
function debounceHistorial() { clearTimeout(histDebounce); histDebounce = setTimeout(loadHistorial, 300); }
async function loadHistorial() {
const f = {
q:      document.getElementById(‘h-q’).value.trim(),
desde:  document.getElementById(‘h-desde’).value,
hasta:  document.getElementById(‘h-hasta’).value,
mes:    document.getElementById(‘h-mes’).value,
tienda: document.getElementById(‘h-tienda’).value,
};
const tbody = document.getElementById(‘historial-body’);
tbody.innerHTML = ‘<tr><td colspan="9" class="table-empty"><i class="fa-solid fa-circle-notch fa-spin"></i></td></tr>’;
try { renderHistorialRows(await window.api.filterRecibos(f)); }
catch (e) { tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Error: ${e.message}</td></tr>`; }
}
function renderHistorialRows(rows) {
const tbody   = document.getElementById(‘historial-body’);
const summary = document.getElementById(‘historial-summary’);
if (!rows.length) { tbody.innerHTML = ‘<tr><td colspan="9" class="table-empty">Sin resultados</td></tr>’; summary.style.display = ‘none’; return; }
const total = rows.reduce((s, r) => s + parseFloat(r.importe || 0), 0);
summary.style.display = ‘flex’;
summary.innerHTML = ` <div class="hs-card"><div class="hs-val">${rows.length}</div><div class="hs-lbl">Recibos</div></div> <div class="hs-card"><div class="hs-val">${fmtMoney(total)}</div><div class="hs-lbl">Total</div></div> <div class="hs-card"><div class="hs-val">${new Set(rows.map(r => r.cliente_id)).size}</div><div class="hs-lbl">Clientes</div></div>`;
const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
tbody.innerHTML = rows.map(r => {
const fvenc = r.fvenc ? new Date(r.fvenc.slice?.(0, 10) || r.fvenc) : null;
let badge = ‘<span class="badge badge-green">✓ Pagado</span>’;
if (fvenc) {
fvenc.setHours(0, 0, 0, 0);
const d = Math.round((fvenc - hoy) / 86400000);
if (d < 0)      badge = `<span class="badge badge-red">✗ Vencido</span>`;
else if (d === 0) badge = `<span class="badge badge-orange">⚡ Hoy</span>`;
else if (d <= 7)  badge = `<span class="badge badge-orange">⏳ ${d}d</span>`;
}
const tiendaLabel  = r.tienda === ‘vejer’ ? ‘<span class="badge badge-blue">Vejer</span>’ : ‘<span class="badge badge-slate">Chiclana</span>’;
const mesPagoLabel = r.mes_pago ? `<span class="badge badge-purple">${monthLabel(r.mes_pago)}</span>` : ‘—’;
return `<tr> <td><code style="font-family:var(--mono);font-size:.74rem">${r.num}</code></td> <td>${fmtDate(r.femis?.slice?.(0, 10) || r.femis)}</td> <td>${tiendaLabel}</td> <td>${r.nombre}</td> <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.concepto || '—'}</td> <td>${mesPagoLabel}</td> <td style="font-weight:700">${fmtMoney(r.importe)}</td> <td>${badge}</td> <td> <button class="btn btn-danger btn-xs" title="Eliminar recibo" onclick="pedirClaveYEliminar('${r.id}','${r.num}','${(r.nombre || '').replace(/'/g, "\\'")}')"> <i class="fa-solid fa-trash"></i> </button> </td> </tr>`;
}).join(’’);
}
function clearHistorialFilter() {
[‘h-q’, ‘h-desde’, ‘h-hasta’, ‘h-mes’].forEach(id => { const el = document.getElementById(id); if (el) el.value = ‘’; });
syncHistorialTienda();
loadHistorial();
}

// ── Modal contraseña genérico ────────────────────────────────────────────────
function pedirClaveGenerico({ titulo, subtitulo, icono, ipcCheck, onSuccess, modalId = ‘genericPassModal’ }) {
document.getElementById(modalId)?.remove();
const modal = document.createElement(‘div’);
modal.className = ‘modal-overlay’;
modal.id = modalId;
modal.innerHTML = ` <div class="modal-box" style="max-width:380px"> <div class="modal-header"> <div> <div class="modal-title"><i class="fa-solid ${icono}"></i> ${titulo}</div> <div class="modal-subtitle">${subtitulo}</div> </div> <button class="modal-close" onclick="document.getElementById('${modalId}').remove()"> <i class="fa-solid fa-xmark"></i> </button> </div> <div style="padding:24px"> <div class="field"> <label>Contraseña de administrador</label> <div class="field-wrap"> <i class="fa-solid fa-lock"></i> <input type="password" id="${modalId}-input" placeholder="••••••••"> </div> </div> <div id="${modalId}-error" style="color:#ef4444;font-size:12px;margin-top:8px;display:none"> <i class="fa-solid fa-circle-xmark"></i> Contraseña incorrecta </div> <div class="btns-row" style="margin-top:20px"> <button class="btn btn-ghost" onclick="document.getElementById('${modalId}').remove()">Cancelar</button> <button class="btn btn-primary" id="${modalId}-confirm"> <i class="fa-solid fa-unlock"></i> Confirmar </button> </div> </div> </div>`;
modal.addEventListener(‘click’, e => { if (e.target === modal) modal.remove(); });
document.body.appendChild(modal);
requestAnimationFrame(() => modal.classList.add(‘visible’));
const input   = document.getElementById(`${modalId}-input`);
const errEl   = document.getElementById(`${modalId}-error`);
const confirm = document.getElementById(`${modalId}-confirm`);
const doCheck = async () => {
const res = await ipcCheck(input.value);
if (res.ok) { modal.classList.remove(‘visible’); setTimeout(() => modal.remove(), 260); onSuccess(); }
else { errEl.style.display = ‘block’; input.focus(); input.select(); }
};
input.addEventListener(‘keydown’, e => { if (e.key === ‘Enter’) doCheck(); });
confirm.addEventListener(‘click’, doCheck);
setTimeout(() => input.focus(), 80);
}

function pedirClaveYEliminar(id, num, nombre) {
pedirClaveGenerico({
titulo:    ‘Confirmar eliminación’,
subtitulo: `Recibo Nº <strong>${num}</strong> — ${nombre}`,
icono:     ‘fa-trash’,
modalId:   ‘deletePassModal’,
ipcCheck:  window.api.checkDeletePassword,
onSuccess: () => ejecutarEliminarRecibo(id, num),
});
}
async function ejecutarEliminarRecibo(id, num) {
try {
const result = await window.api.deleteRecibo(id);
if (result.ok) { toast(`Recibo Nº ${num} eliminado`, ‘ok’); loadHistorial(); }
else toast(’Error al eliminar: ’ + (result.error || ‘’), ‘err’);
} catch (e) { toast(’Error: ’ + e.message, ‘err’); }
}

// ── Clientes ────────────────────────────────────────────────────────────────
let clDebounce;
function debounceClientes() { clearTimeout(clDebounce); clDebounce = setTimeout(loadClientesTab, 300); }

async function loadClientesTab() {
const q     = document.getElementById(‘cl-q’)?.value.trim() || ‘’;
const tbody = document.getElementById(‘clientes-body’);
tbody.innerHTML = ‘<tr><td colspan="6" class="table-empty"><i class="fa-solid fa-circle-notch fa-spin"></i></td></tr>’;
try {
let list = q ? await window.api.searchClientes(q) : await window.api.listClientes();
list = […list].sort((a, b) => a.nombre.localeCompare(b.nombre));
if (!list.length) { tbody.innerHTML = ‘<tr><td colspan="6" class="table-empty">Sin clientes</td></tr>’; return; }
tbody.innerHTML = list.map(c => `<tr> <td style="font-weight:700">${c.nombre}</td> <td><code style="font-size:.74rem">${c.dni || '—'}</code></td> <td>${c.telefono || '—'}</td> <td style="color:var(--muted)">${c.email || '—'}</td> <td> <button class="btn btn-ghost btn-sm" onclick="verRecibosCliente('${c.id}','${c.nombre.replace(/'/g, "\\'")}')"> <i class="fa-solid fa-receipt"></i> Ver recibos </button> </td> <td> <button class="btn btn-primary btn-sm" onclick="abrirEditarCliente('${c.id}')"> <i class="fa-solid fa-user-pen"></i> Editar </button> <button class="btn btn-ghost btn-sm" style="margin-left:4px" onclick="cargarClienteEnForm('${c.id}')"> <i class="fa-solid fa-file-circle-plus"></i> Nuevo recibo </button> <button class="btn btn-danger btn-sm" style="margin-left:4px" onclick="pedirClaveYEliminarCliente('${c.id}','${c.nombre.replace(/'/g, "\\'")}')"> <i class="fa-solid fa-user-slash"></i> Eliminar </button> </td> </tr>`).join(’’);
} catch (e) { tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Error: ${e.message}</td></tr>`; }
}

// ══════════════════════════════════════════════════════
// EDITAR CLIENTE — Modal completo
// ══════════════════════════════════════════════════════
async function abrirEditarCliente(id) {
let cliente;
try {
const all = await window.api.listClientes();
cliente   = all.find(x => x.id === id);
} catch (e) { toast(’Error al cargar cliente: ’ + e.message, ‘err’); return; }
if (!cliente) { toast(‘Cliente no encontrado’, ‘err’); return; }

document.getElementById(‘editClienteModal’)?.remove();

const modal = document.createElement(‘div’);
modal.className = ‘modal-overlay’;
modal.id = ‘editClienteModal’;
modal.innerHTML = `
<div class="modal-box" style="max-width:480px">
<div class="modal-header">
<div>
<div class="modal-title"><i class="fa-solid fa-user-pen"></i> Editar Cliente</div>
<div class="modal-subtitle">Modifica los datos y pulsa <strong>Guardar cambios</strong></div>
</div>
<button class="modal-close" onclick="cerrarEditarCliente()"><i class="fa-solid fa-xmark"></i></button>
</div>

```
  <div style="padding:24px;display:flex;flex-direction:column;gap:16px">

    <div class="field">
      <label>Nombre completo <span style="color:#ef4444">*</span></label>
      <div class="field-wrap">
        <i class="fa-solid fa-user"></i>
        <input type="text" id="ec-nombre" value="${escHtml(cliente.nombre)}" placeholder="Nombre del cliente">
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="field">
        <label>DNI / NIE</label>
        <div class="field-wrap">
          <i class="fa-solid fa-id-card"></i>
          <input type="text" id="ec-dni" value="${escHtml(cliente.dni || '')}" placeholder="12345678A">
        </div>
      </div>
      <div class="field">
        <label>Teléfono</label>
        <div class="field-wrap">
          <i class="fa-solid fa-phone"></i>
          <input type="text" id="ec-telefono" value="${escHtml(cliente.telefono || '')}" placeholder="956 000 000">
        </div>
      </div>
    </div>

    <div class="field">
      <label>Email</label>
      <div class="field-wrap">
        <i class="fa-solid fa-envelope"></i>
        <input type="email" id="ec-email" value="${escHtml(cliente.email || '')}" placeholder="correo@gmail.com">
      </div>
    </div>

    <div id="ec-error" style="display:none;color:#ef4444;font-size:13px;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px">
      <i class="fa-solid fa-circle-xmark"></i> <span id="ec-error-msg"></span>
    </div>

    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 14px;font-size:12px;color:#0369a1">
      <i class="fa-solid fa-circle-info"></i>
      Al guardar, los datos del cliente se actualizarán también en todos sus recibos existentes.
    </div>

    <div class="btns-row" style="margin-top:4px">
      <button class="btn btn-ghost" onclick="cerrarEditarCliente()">Cancelar</button>
      <button class="btn btn-primary" id="ec-save-btn" onclick="guardarEdicionCliente('${escHtml(cliente.id)}')">
        <i class="fa-solid fa-floppy-disk"></i> Guardar cambios
      </button>
    </div>
  </div>
</div>`;
```

modal.addEventListener(‘click’, e => { if (e.target === modal) cerrarEditarCliente(); });
document.body.appendChild(modal);
requestAnimationFrame(() => modal.classList.add(‘visible’));

// Enter en cualquier campo guarda
modal.querySelectorAll(‘input’).forEach(inp => {
inp.addEventListener(‘keydown’, e => { if (e.key === ‘Enter’) guardarEdicionCliente(cliente.id); });
});

setTimeout(() => document.getElementById(‘ec-nombre’)?.focus(), 80);
}

function cerrarEditarCliente() {
const modal = document.getElementById(‘editClienteModal’);
if (!modal) return;
modal.classList.remove(‘visible’);
setTimeout(() => modal.remove(), 260);
}

async function guardarEdicionCliente(id) {
const nombre   = document.getElementById(‘ec-nombre’)?.value.trim();
const dni      = document.getElementById(‘ec-dni’)?.value.trim();
const telefono = document.getElementById(‘ec-telefono’)?.value.trim();
const email    = document.getElementById(‘ec-email’)?.value.trim();

const errEl  = document.getElementById(‘ec-error’);
const errMsg = document.getElementById(‘ec-error-msg’);

// Ocultar error previo
errEl.style.display = ‘none’;

if (!nombre) {
errEl.style.display = ‘block’;
errMsg.textContent  = ‘El nombre del cliente es obligatorio.’;
document.getElementById(‘ec-nombre’)?.focus();
return;
}

const btn = document.getElementById(‘ec-save-btn’);
btn.disabled  = true;
btn.innerHTML = ‘<i class="fa-solid fa-circle-notch fa-spin"></i> Guardando…’;

try {
const res = await window.api.updateCliente({ id, nombre, dni, telefono, email });
if (res.ok) {
toast(‘Cliente actualizado correctamente’, ‘ok’);
cerrarEditarCliente();
loadClientesTab();
} else {
errEl.style.display = ‘block’;
errMsg.textContent  = res.error || ‘Error desconocido al guardar.’;
btn.disabled  = false;
btn.innerHTML = ‘<i class="fa-solid fa-floppy-disk"></i> Guardar cambios’;
}
} catch (e) {
errEl.style.display = ‘block’;
errMsg.textContent  = e.message;
btn.disabled  = false;
btn.innerHTML = ‘<i class="fa-solid fa-floppy-disk"></i> Guardar cambios’;
}
}
// ══════════════════════════════════════════════════════

function pedirClaveYEliminarCliente(id, nombre) {
pedirClaveGenerico({
titulo:    ‘Eliminar cliente’,
subtitulo: `¿Eliminar a <strong>${nombre}</strong> y todos sus datos?`,
icono:     ‘fa-user-slash’,
modalId:   ‘deleteClienteModal’,
ipcCheck:  window.api.checkDeleteClientePassword,
onSuccess: () => ejecutarEliminarCliente(id, nombre),
});
}
async function ejecutarEliminarCliente(id, nombre) {
try {
const res = await window.api.deleteCliente(id);
if (res.ok) { toast(`Cliente "${nombre}" eliminado`, ‘ok’); loadClientesTab(); updateBadge(); }
else toast(’Error al eliminar: ’ + (res.error || ‘’), ‘err’);
} catch (e) { toast(’Error: ’ + e.message, ‘err’); }
}

async function verRecibosCliente(id, nombre) {
try { showRecibosModal(await window.api.listRecibos(id), nombre); }
catch (e) { toast(’Error al cargar recibos: ’ + e.message, ‘err’); }
}

async function eliminarRecibo(id, num, clienteNombre) {
if (!confirm(`¿Eliminar el recibo Nº ${num} de ${clienteNombre}?\n\nEsta acción no se puede deshacer.`)) return;
try {
const res = await window.api.deleteRecibo(id);
if (res.ok) {
toast(`Recibo Nº ${num} eliminado`, ‘ok’);
closeRecibosModal();
try {
const clientes = await window.api.searchClientes(clienteNombre);
const c = clientes.find(x => x.nombre === clienteNombre);
if (c) { const nuevosRecs = await window.api.listRecibos(c.id); showRecibosModal(nuevosRecs, clienteNombre); }
} catch {}
} else toast(’Error al eliminar: ’ + (res.error || ‘’), ‘err’);
} catch (e) { toast(’Error: ’ + e.message, ‘err’); }
}

function showRecibosModal(recs, clienteNombre) {
document.getElementById(‘recibosModal’)?.remove();
const grupos = {};
recs.forEach(r => {
const mes = r.femis ? (typeof r.femis === ‘string’ ? r.femis.slice(0, 7) : r.femis.toISOString().slice(0, 7)) : ‘Sin fecha’;
if (!grupos[mes]) grupos[mes] = [];
grupos[mes].push(r);
});
const mesesOrdenados = Object.keys(grupos).sort((a, b) => b.localeCompare(a));
const totalGlobal    = recs.reduce((s, r) => s + parseFloat(r.importe || 0), 0);
const listaHtml = mesesOrdenados.length === 0
? ‘<div class="modal-empty"><i class="fa-solid fa-receipt"></i><p>Sin recibos registrados</p></div>’
: mesesOrdenados.map(mes => {
const lista    = grupos[mes];
const totalMes = lista.reduce((s, r) => s + parseFloat(r.importe || 0), 0);
const items    = lista.map(r => `<div class="modal-recibo-item"> <div class="modal-recibo-info"> <span class="modal-recibo-num">Nº ${r.num} · ${fmtDate(r.femis?.slice?.(0, 10) || r.femis)}</span> <span class="modal-recibo-concepto">${r.concepto || '—'}</span> ${r.mes_pago ?`<span class="modal-recibo-mes"><i class="fa-solid fa-calendar-week"></i> Mes: ${monthLabel(r.mes_pago)}</span>`: ''} ${r.tienda ?`<span class="modal-recibo-tienda">${r.tienda === ‘vejer’ ? ‘🏪 Vejer’ : ‘🏪 Chiclana’}</span>` : ''} </div> <div class="modal-recibo-right"> <span class="modal-recibo-importe">${fmtMoney(r.importe)}</span> <span class="badge badge-green">✓ Pagado</span> <button class="btn btn-danger btn-xs" title="Eliminar recibo" onclick="eliminarRecibo('${r.id}','${r.num}','${clienteNombre.replace(/'/g, "\\'")}')"> <i class="fa-solid fa-trash"></i> </button> </div> </div>`).join(’’);
return ` <div class="modal-mes-grupo"> <div class="modal-mes-header"> <span class="modal-mes-nombre">${monthLabel(mes)}</span> <span class="modal-mes-total">${fmtMoney(totalMes)} · ${lista.length} recibo${lista.length !== 1 ? 's' : ''}</span> </div> ${items} </div>`;
}).join(’’);

const modal = document.createElement(‘div’);
modal.className = ‘modal-overlay’;
modal.id = ‘recibosModal’;
modal.innerHTML = ` <div class="modal-box"> <div class="modal-header"> <div> <div class="modal-title"><i class="fa-solid fa-receipt"></i> ${clienteNombre}</div> <div class="modal-subtitle"> ${recs.length} recibo${recs.length !== 1 ? 's' : ''} en total &nbsp;·&nbsp; <strong style="color:var(--blue)">${fmtMoney(totalGlobal)}</strong> pagado </div> </div> <button class="modal-close" onclick="closeRecibosModal()"><i class="fa-solid fa-xmark"></i></button> </div> <div class="modal-resumen"> <div class="modal-res-card"><div class="modal-res-val">${recs.length}</div><div class="modal-res-lbl">Recibos</div></div> <div class="modal-res-card accent"><div class="modal-res-val">${fmtMoney(totalGlobal)}</div><div class="modal-res-lbl">Total pagado</div></div> <div class="modal-res-card"><div class="modal-res-val">${mesesOrdenados.length}</div><div class="modal-res-lbl">Meses</div></div> </div> <div class="modal-body">${listaHtml}</div> </div>`;
modal.addEventListener(‘click’, e => { if (e.target === modal) closeRecibosModal(); });
document.body.appendChild(modal);
requestAnimationFrame(() => modal.classList.add(‘visible’));
}

function closeRecibosModal() {
const modal = document.getElementById(‘recibosModal’);
if (!modal) return;
modal.classList.remove(‘visible’);
setTimeout(() => modal.remove(), 260);
}

async function cargarClienteEnForm(id) {
const all = await window.api.listClientes();
const c   = all.find(x => x.id === id); if (!c) return;
document.getElementById(‘f-nombre’).value   = c.nombre;
document.getElementById(‘f-dni’).value      = c.dni || ‘’;
document.getElementById(‘f-telefono’).value = c.telefono || ‘’;
document.getElementById(‘f-email’).value    = c.email || ‘’;
switchTab(‘nuevo’); toast(’Cliente cargado: ’ + c.nombre, ‘ok’);
}

// ── Stats ────────────────────────────────────────────────────────────────────
async function loadStats() {
const tienda = document.getElementById(‘stats-tienda’)?.value || ‘’;
try {
const g = await window.api.statsGlobal(tienda || undefined);
document.getElementById(‘sg-recibos’).textContent  = g.recibos || 0;
document.getElementById(‘sg-total’).textContent    = fmtMoney(g.total);
document.getElementById(‘sg-clientes’).textContent = g.clientes || 0;
const monthly = await window.api.statsMonthly(tienda || undefined);
const tbody = document.getElementById(‘stats-body’);
if (!monthly.length) { tbody.innerHTML = ‘<tr><td colspan="5" class="table-empty">Sin datos aún</td></tr>’; return; }
tbody.innerHTML = monthly.map(m => `<tr> <td style="font-weight:700">${monthLabel(m.mes)}</td> <td>${m.total_recibos}</td><td>${m.clientes_unicos}</td> <td style="font-weight:700;color:var(--blue)">${fmtMoney(m.total_importe)}</td> <td>${fmtMoney(parseFloat(m.total_importe || 0) / parseInt(m.total_recibos || 1))}</td> </tr>`).join(’’);
} catch (e) { document.getElementById(‘stats-body’).innerHTML = `<tr><td colspan="5" class="table-empty">Error: ${e.message}</td></tr>`; }
}

// ── Impresoras ────────────────────────────────────────────────────────────────
async function loadPrinters() {
try {
const list = await window.api.getPrinters();
[‘chiclana’, ‘vejer’].forEach(id => {
const sel = document.getElementById(‘printer-’ + id);
if (!sel) return;
sel.innerHTML = ‘<option value="">Impresora predeterminada del sistema</option>’;
list.forEach(p => {
const opt = document.createElement(‘option’);
opt.value = p.name; opt.textContent = p.name + (p.isDefault ? ’ ★’ : ‘’);
sel.appendChild(opt);
});
if (perfiles[id]?.impresora) sel.value = perfiles[id].impresora;
});
} catch {}
}

// ── Configuración ─────────────────────────────────────────────────────────────
async function loadConfigForms() {
[‘chiclana’, ‘vejer’].forEach(id => {
const p = perfiles[id] || {};
const container = document.getElementById(‘fields-’ + id);
if (!container) return;
container.innerHTML = `${cfgField('empresa', 'Nombre empresa', p.empresa || '', 'fa-store')} ${cfgField('sub',     'Subtítulo',      p.sub     || '', 'fa-tag')} ${cfgField('dir',     'Dirección',      p.dir     || '', 'fa-location-dot')} ${cfgField('tel',     'Teléfono',       p.tel     || '', 'fa-phone')} ${cfgField('cif',     'CIF',            p.cif     || '', 'fa-id-badge')} ${cfgField('logo',    'URL Logo',       p.logo    || '', 'fa-image')} ${cfgField('qrUrl',   'URL QR ticket',  p.qrUrl   || '', 'fa-qrcode')}`;
const emailContainer = document.getElementById(‘email-fields-’ + id);
if (!emailContainer) return;
emailContainer.innerHTML = `${cfgField('emailUser', 'Email de envío',             p.emailUser || '',                 'fa-envelope')} ${cfgField('emailPass', 'Contraseña / App Password',  p.emailPass || '',                 'fa-lock', 'password')} ${cfgField('emailHost', 'Servidor SMTP',              p.emailHost || 'smtp.gmail.com',   'fa-server')} ${cfgField('emailPort', 'Puerto SMTP',                p.emailPort || 587,                'fa-plug', 'number')}`;
const sel = document.getElementById(‘printer-’ + id);
if (sel && p.impresora) sel.value = p.impresora;
});
window.api.getDbConfig().then(db => {
document.getElementById(‘db-host’).value   = db.host     || ‘127.0.0.1’;
document.getElementById(‘db-port’).value   = db.port     || 3306;
document.getElementById(‘db-user’).value   = db.user     || ‘root’;
document.getElementById(‘db-pass’).value   = db.password || ‘’;
document.getElementById(‘db-dbname’).value = db.database || ‘mundophone’;
});
try {
const logsDir = await window.api.getLogsDir();
const logsInfo = document.getElementById(‘logs-dir-info’);
if (logsInfo) logsInfo.textContent = logsDir;
} catch {}
}

function cfgField(key, label, val, icon, type = ‘text’) {
return `<div class="field">
<label>${label}</label>
<div class="field-wrap">
<i class="fa-solid ${icon}"></i>
<input type=”${type}” data-key=”${key}” value=”${String(val).replace(/”/g, ‘"’)}” placeholder=”${label}”>
</div>

  </div>`;
}

async function savePerfilForm(id) {
const p = perfiles[id] || {};
document.querySelectorAll(`#fields-${id} [data-key]`).forEach(input => { p[input.dataset.key] = input.value.trim(); });
document.querySelectorAll(`#email-fields-${id} [data-key]`).forEach(input => { p[input.dataset.key] = input.value.trim(); });
const sel = document.getElementById(‘printer-’ + id);
if (sel) p.impresora = sel.value;
perfiles[id] = p;
await window.api.savePerfiles(perfiles);
try {
await window.api.savePerfilDb(id, p);
toast(‘Perfil ’ + (p.nombre || id) + ’ guardado (archivo + BD)’, ‘ok’);
} catch (e) { toast(’Guardado en archivo. BD: ’ + e.message, ‘ok’); }
actualizarStoreSwitcher();
}

async function testEmail(id) {
savePerfilForm(id);
const p  = perfiles[id];
const el = document.getElementById(‘email-test-’ + id);
el.innerHTML = `<div class="email-status sending"><i class="fa-solid fa-circle-notch fa-spin"></i> Probando conexión SMTP…</div>`;
const res = await window.api.sendEmail({
perfilId: id,
to:       p.emailUser,
toName:   p.empresa || ‘Test’,
recibo:   { num: ‘TEST’, femis: new Date().toISOString().slice(0, 10), fvenc: ‘’, telefono: ‘’, concepto: ‘Prueba de envío’, importe: 0 },
htmlBody: `<p>Email de prueba desde ${p.empresa || 'Mundo Phone'} — ${p.nombre}. Si ves esto, el correo funciona ✅</p>`
});
el.innerHTML = res.ok
? `<div class="email-status sent"><i class="fa-solid fa-circle-check"></i> Email de prueba enviado a ${p.emailUser}</div>`
: `<div class="email-status error"><i class="fa-solid fa-circle-xmark"></i> ${res.error}</div>`;
}

async function testDbConfig() {
const res = await window.api.testDb(getDbFormValues());
document.getElementById(‘db-test-result’).innerHTML = res.ok
? `<div class="email-status sent"><i class="fa-solid fa-circle-check"></i> Conexión exitosa</div>`
: `<div class="email-status error"><i class="fa-solid fa-circle-xmark"></i> ${res.error}</div>`;
}
async function saveDbConfig() {
const res = await window.api.setDbConfig(getDbFormValues());
if (res.ok) { toast(‘MySQL configurado y conectado’, ‘ok’); checkDbStatus(); }
else toast(’Error: ’ + res.error, ‘err’);
}
function getDbFormValues() {
return {
host:     document.getElementById(‘db-host’).value.trim(),
port:     parseInt(document.getElementById(‘db-port’).value) || 3306,
user:     document.getElementById(‘db-user’).value.trim(),
password: document.getElementById(‘db-pass’).value,
database: document.getElementById(‘db-dbname’).value.trim(),
};
}

document.addEventListener(‘DOMContentLoaded’, init);