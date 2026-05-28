const mainImage    = document.getElementById('main-image');
const gallery      = document.getElementById('gallery');
const historyPanel = document.getElementById('history-panel');
let cropper;

// ── Base de datos: solo URLs (muy ligero en localStorage) ──
let db = JSON.parse(localStorage.getItem('labels_v5')) || [];

// ── PDF state ──
let pdfDoc = null;
let pdfCurrentPage = 1;
let pdfTotalPages  = 0;
const MAX_PILLS = 3;

// ══════════════════════════════════
//  ⚙️  FIVEMANAGE CONFIG
//  Reemplaza con tu API key real
// ══════════════════════════════════
const FIVEMANAGE_API_KEY = '0Z3RtuRkKaBf4FF03cfCcAN0U0kpPoar';
const FIVEMANAGE_UPLOAD_URL = 'https://api.fivemanage.com/api/image';

pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

window.onload = () => {
    renderGallery();
    initTheme();
    initDragDrop();
};

/* ══════════════════════════════════
   THEME TOGGLE
══════════════════════════════════ */
function initTheme() {
    const saved = localStorage.getItem('mp_theme') || 'dark';
    applyTheme(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mp_theme', theme);
    const icon = document.getElementById('theme-icon');
    icon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
}

/* ══════════════════════════════════
   DRAG & DROP
══════════════════════════════════ */
function initDragDrop() {
    const overlay  = document.getElementById('drop-overlay');
    const dropZone = document.getElementById('drop-zone');
    let dragCounter = 0;

    document.addEventListener('dragover',  (e) => e.preventDefault());
    document.addEventListener('drop',      (e) => e.preventDefault());

    document.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        overlay.classList.add('active');
        dropZone.classList.add('drag-over');
    });

    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            overlay.classList.remove('active');
            dropZone.classList.remove('drag-over');
        }
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        overlay.classList.remove('active');
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });
}

/* ══════════════════════════════════
   FILE INPUT (button)
══════════════════════════════════ */
document.getElementById('file-input').onchange = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
};

/* ══════════════════════════════════
   FILE HANDLER
══════════════════════════════════ */
function showRemoveBtn(show) {
    const btn = document.getElementById('btn-remove-file');
    if (btn) btn.style.display = show ? 'inline-flex' : 'none';
}

function removeFile() {
    if (cropper) { cropper.destroy(); cropper = null; }
    mainImage.removeAttribute('src');
    document.getElementById('pdf-nav').classList.remove('visible');
    pdfDoc = null;
    document.getElementById('file-input').value = '';
    showRemoveBtn(false);
}

function handleFile(file) {
    const reader = new FileReader();
    if (file.type === 'application/pdf') {
        reader.onload = async function () {
            setLoading(true);
            pdfDoc         = await pdfjsLib.getDocument(new Uint8Array(this.result)).promise;
            pdfTotalPages  = pdfDoc.numPages;
            pdfCurrentPage = 1;
            buildPdfNav();
            showRemoveBtn(true);
            await renderPdfPage(1);
        };
        reader.readAsArrayBuffer(file);
    } else if (file.type.startsWith('image/')) {
        document.getElementById('pdf-nav').classList.remove('visible');
        pdfDoc = null;
        reader.onload = (ev) => { initCropper(ev.target.result); showRemoveBtn(true); };
        reader.readAsDataURL(file);
    }
}

/* ══════════════════════════════════
   HISTORY
══════════════════════════════════ */
function toggleHistory() { historyPanel.classList.toggle('closed'); }

function clearHistory(e) {
    e.stopPropagation();
    if (confirm('¿Borrar todo el historial?')) {
        db = [];
        localStorage.removeItem('labels_v5');
        renderGallery();
    }
}

/* ══════════════════════════════════
   PDF NAVIGATION
══════════════════════════════════ */
function buildPdfNav() {
    const nav         = document.getElementById('pdf-nav');
    const pillsEl     = document.getElementById('pdf-pills');
    const manualWrap  = document.getElementById('pdf-manual-wrap');
    const totalEl     = document.getElementById('pdf-total');
    const manualInput = document.getElementById('pdf-manual-input');

    nav.classList.add('visible');
    totalEl.textContent = 'de ' + pdfTotalPages;
    manualInput.max     = pdfTotalPages;

    pillsEl.innerHTML = '';
    const pillCount = Math.min(pdfTotalPages, MAX_PILLS);
    for (let i = 1; i <= pillCount; i++) {
        const pill = document.createElement('button');
        pill.className    = 'pdf-pill' + (i === 1 ? ' active' : '');
        pill.textContent  = i;
        pill.dataset.page = i;
        pill.onclick      = () => goToPage(i);
        pillsEl.appendChild(pill);
    }

    manualWrap.style.display = pdfTotalPages > MAX_PILLS ? 'flex' : 'none';
    updateNavButtons();
}

function updateNavButtons() {
    document.getElementById('pdf-prev').disabled = pdfCurrentPage <= 1;
    document.getElementById('pdf-next').disabled = pdfCurrentPage >= pdfTotalPages;
    document.querySelectorAll('.pdf-pill').forEach(p => {
        p.classList.toggle('active', parseInt(p.dataset.page) === pdfCurrentPage);
    });
}

async function renderPdfPage(pageNum) {
    setLoading(true);
    const page     = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.5 });
    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    initCropper(canvas.toDataURL('image/jpeg', 0.9));
    setLoading(false);
    updateNavButtons();
}

async function goToPage(pageNum) {
    if (pageNum < 1 || pageNum > pdfTotalPages) return;
    pdfCurrentPage = pageNum;
    await renderPdfPage(pageNum);
}

async function changePdfPage(delta) { await goToPage(pdfCurrentPage + delta); }

async function goToManualPage() {
    const input = document.getElementById('pdf-manual-input');
    const num   = parseInt(input.value);
    if (!num || num < 1 || num > pdfTotalPages) {
        input.style.borderColor = 'var(--danger)';
        setTimeout(() => input.style.borderColor = '', 800);
        return;
    }
    input.value = '';
    await goToPage(num);
}

document.getElementById('pdf-manual-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') goToManualPage();
});

function setLoading(show) {
    document.getElementById('pdf-loading').classList.toggle('visible', show);
}

/* ══════════════════════════════════
   CROPPER
══════════════════════════════════ */
function initCropper(src) {
    mainImage.src = src;
    if (cropper) cropper.destroy();
    cropper = new Cropper(mainImage, {
        viewMode: 1,
        autoCropArea: 1,
        responsive: true
    });
}

/* ══════════════════════════════════
   FIVEMANAGE — subir imagen
══════════════════════════════════ */
async function uploadToFiveManage(blob) {
    const formData = new FormData();
    formData.append('image', blob, 'etiqueta_' + Date.now() + '.jpg');

    const res = await fetch(FIVEMANAGE_UPLOAD_URL, {
        method: 'POST',
        headers: { 'Authorization': FIVEMANAGE_API_KEY },
        body: formData
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error('FiveManage error ' + res.status + ': ' + text);
    }

    const data = await res.json();
    // FiveManage devuelve { url: "https://..." }
    if (!data.url) throw new Error('FiveManage no devolvió URL: ' + JSON.stringify(data));
    return data.url;
}

/* ══════════════════════════════════
   GUARDAR EN HISTORIAL (solo URLs)
══════════════════════════════════ */
function saveToHistory(url) {
    db.unshift({ id: Date.now(), url });
    db = db.slice(0, 100); // 100 items — solo URLs, pesa casi nada
    try {
        localStorage.setItem('labels_v5', JSON.stringify(db));
    } catch (e) {
        console.warn('localStorage lleno, historial no guardado localmente.');
    }
}

/* ══════════════════════════════════
   BOTÓN — Recortar e imprimir
══════════════════════════════════ */
document.getElementById('btn-crop').onclick = async () => {
    if (!cropper) return;

    const btn = document.getElementById('btn-crop');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Subiendo…';

    try {
        const canvas = cropper.getCroppedCanvas({ fillColor: '#fff' });

        const blob = await new Promise(resolve =>
            canvas.toBlob(resolve, 'image/jpeg', 0.92)
        );

        // Imprimir inmediatamente desde URL local (sin esperar red)
        const localUrl = URL.createObjectURL(blob);
        prepararImpresion(localUrl);

        // Subir a FiveManage en paralelo para guardar en historial
        uploadToFiveManage(blob).then(remoteUrl => {
            URL.revokeObjectURL(localUrl);
            saveToHistory(remoteUrl);
            renderGallery();
        }).catch(err => {
            console.error('Error subiendo a FiveManage:', err);
            // Fallback: guardar base64 localmente
            const reader = new FileReader();
            reader.onload = (e) => { saveToHistory(e.target.result); renderGallery(); };
            reader.readAsDataURL(blob);
            alert('No se pudo subir a FiveManage, guardado localmente.\n' + err.message);
        });

    } catch (err) {
        console.error(err);
        alert('Error al procesar la imagen:\n' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-scissors"></i> Recortar e imprimir';
    }
};

/* ══════════════════════════════════
   GALERÍA
══════════════════════════════════ */
function renderGallery() {
    gallery.innerHTML = '';
    if (!db.length) {
        gallery.innerHTML =
            '<div class="empty-gallery">' +
            '<i class="fa-regular fa-folder-open"></i>' +
            'Sin etiquetas guardadas</div>';
        return;
    }
    db.forEach(item => {
        const div = document.createElement('div');
        div.className = 'item-card';
        div.innerHTML =
            '<div class="item-thumb-wrap" onclick="openFull(\'' + item.url + '\')">' +
            '<img src="' + item.url + '" class="item-thumb" loading="lazy"></div>' +
            '<div class="item-footer">' +
            '<button class="btn-print" onclick="prepararImpresion(\'' + item.url + '\')">' +
            '<i class="fa-solid fa-print"></i> Imprimir</button></div>';
        gallery.appendChild(div);
    });
}

/* ══════════════════════════════════
   MODAL
══════════════════════════════════ */
function openFull(url) {
    document.getElementById('modal-img').src = url;
    document.getElementById('modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

/* ══════════════════════════════════
   IMPRESIÓN
══════════════════════════════════ */
function prepararImpresion(url) {
    // Inyectamos el <img> directamente en el DOM — el navegador
    // puede mostrar imágenes cross-origin en un <img> tag normal.
    // No usamos new Image() + onload porque eso activa restricciones CORS.
    const area = document.getElementById('print-area');
    area.innerHTML = '<img src="' + url + '" style="display:block;width:100%;height:100%;object-fit:contain;margin:0;padding:0;">';

    const styleId = 'print-style';
    if (document.getElementById(styleId)) document.getElementById(styleId).remove();
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = [
        '@media print {',
        '  @page { margin: 0; size: auto; }',
        '  html { height: auto !important; overflow: hidden !important; }',
        '  body { height: auto !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; }',
        '  #print-area {',
        '    display: block !important;',
        '    position: fixed !important;',
        '    top: 0 !important; left: 0 !important;',
        '    width: 100vw !important;',
        '    height: 100vh !important;',
        '    overflow: hidden !important;',
        '    margin: 0 !important; padding: 0 !important; line-height: 0 !important;',
        '  }',
        '  #print-area img {',
        '    display: block !important;',
        '    width: 100% !important;',
        '    height: 100% !important;',
        '    object-fit: contain !important;',
        '    margin: 0 !important; padding: 0 !important;',
        '    page-break-after: avoid !important;',
        '    page-break-inside: avoid !important;',
        '  }',
        '}'
    ].join('\n');
    document.head.appendChild(style);

    // Esperar a que la imagen cargue antes de imprimir
    const img = area.querySelector('img');
    const doPrint = () => setTimeout(() => window.print(), 150);
    if (img.complete) {
        doPrint();
    } else {
        img.onload  = doPrint;
        img.onerror = doPrint; // intentar imprimir igual si falla la carga
    }
}
