const mainImage = document.getElementById('main-image');
const gallery   = document.getElementById('gallery');
const historyPanel = document.getElementById('history-panel');
let cropper;
let db = JSON.parse(localStorage.getItem('labels_v4')) || [];

// ── PDF state ──
let pdfDoc = null;
let pdfCurrentPage = 1;
let pdfTotalPages  = 0;
const MAX_PILLS = 3;

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
    if (theme === 'dark') {
        icon.className = 'fa-solid fa-moon';
    } else {
        icon.className = 'fa-solid fa-sun';
    }
}

/* ══════════════════════════════════
   DRAG & DROP
══════════════════════════════════ */
function initDragDrop() {
    const overlay  = document.getElementById('drop-overlay');
    const dropZone = document.getElementById('drop-zone');
    let dragCounter = 0; // track nested dragenter/dragleave

    // Prevent default browser open-file on drop everywhere
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop',     (e) => e.preventDefault());

    // Show overlay when dragging enters the window
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
   FILE HANDLER (shared by button + drag)
══════════════════════════════════ */
function showRemoveBtn(show) {
    const btn = document.getElementById('btn-remove-file');
    if (btn) btn.style.display = show ? 'inline-flex' : 'none';
}

function removeFile() {
    // Destroy cropper
    if (cropper) { cropper.destroy(); cropper = null; }
    // Clear image src
    mainImage.removeAttribute('src');
    // Hide PDF nav
    document.getElementById('pdf-nav').classList.remove('visible');
    pdfDoc = null;
    // Reset file input so same file can be re-selected
    document.getElementById('file-input').value = '';
    // Hide remove button
    showRemoveBtn(false);
}

function handleFile(file) {
    const reader = new FileReader();
    if (file.type === 'application/pdf') {
        reader.onload = async function () {
            setLoading(true);
            pdfDoc = await pdfjsLib.getDocument(new Uint8Array(this.result)).promise;
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
        localStorage.removeItem('labels_v4');
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
   RECORTAR E IMPRIMIR
══════════════════════════════════ */
document.getElementById('btn-crop').onclick = () => {
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({ fillColor: '#fff' });
    const jpgUrl = canvas.toDataURL('image/jpeg', 0.95);
    db.unshift({ id: Date.now(), url: jpgUrl });
    localStorage.setItem('labels_v4', JSON.stringify(db.slice(0, 40)));
    renderGallery();
    prepararImpresion(jpgUrl);
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
            '<img src="' + item.url + '" class="item-thumb"></div>' +
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
    const img = new Image();
    img.src = url;
    img.onload = () => {
        const area = document.getElementById('print-area');
        area.innerHTML = '';
        img.style.cssText = 'display:block;width:100%;height:auto;margin:0;padding:0;';
        area.appendChild(img);

        const styleId = 'print-style';
        if (document.getElementById(styleId)) document.getElementById(styleId).remove();
        const style = document.createElement('style');
        style.id = styleId;
        // Calcular ratio para @page
        const ratio = img.naturalHeight / img.naturalWidth;
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
        setTimeout(() => window.print(), 250);
    };
}