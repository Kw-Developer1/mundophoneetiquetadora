  const mainImage = document.getElementById('main-image');
    const gallery = document.getElementById('gallery');
    const historyPanel = document.getElementById('history-panel');
    let cropper;
    let db = JSON.parse(localStorage.getItem('labels_v4')) || [];

    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

    window.onload = () => renderGallery();

    function toggleHistory() {
        historyPanel.classList.toggle('closed');
    }

    function clearHistory(e) {
        e.stopPropagation();
        if (confirm('¿Borrar todo el historial?')) {
            db = [];
            localStorage.removeItem('labels_v4');
            renderGallery();
        }
    }

    document.getElementById('file-input').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        if (file.type === 'application/pdf') {
            reader.onload = async function () {
                const pdf = await pdfjsLib.getDocument(new Uint8Array(this.result)).promise;
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 2.5 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                initCropper(canvas.toDataURL('image/jpeg', 0.9));
            };
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = (ev) => initCropper(ev.target.result);
            reader.readAsDataURL(file);
        }
    };

    function initCropper(src) {
        mainImage.src = src;
        if (cropper) cropper.destroy();
        cropper = new Cropper(mainImage, {
            viewMode: 1,
            autoCropArea: 1,
            responsive: true
        });
    }

    document.getElementById('btn-crop').onclick = () => {
        if (!cropper) return;
        const canvas = cropper.getCroppedCanvas({ fillColor: '#fff' });
        const jpgUrl = canvas.toDataURL('image/jpeg', 0.95);
        db.unshift({ id: Date.now(), url: jpgUrl });
        localStorage.setItem('labels_v4', JSON.stringify(db.slice(0, 40)));
        renderGallery();
        prepararImpresion(jpgUrl);
    };

    function renderGallery() {
        gallery.innerHTML = '';
        if (!db.length) {
            gallery.innerHTML = `<div class="empty-gallery"><i class="fa-regular fa-folder-open"></i>Sin etiquetas guardadas</div>`;
            return;
        }
        db.forEach(item => {
            const div = document.createElement('div');
            div.className = 'item-card';
            div.innerHTML = `
                <div class="item-thumb-wrap" onclick="openFull('${item.url}')">
                    <img src="${item.url}" class="item-thumb">
                </div>
                <div class="item-footer">
                    <button class="btn-print" onclick="prepararImpresion('${item.url}')">
                        <i class="fa-solid fa-print"></i> Imprimir
                    </button>
                </div>`;
            gallery.appendChild(div);
        });
    }

    function openFull(url) {
        document.getElementById('modal-img').src = url;
        document.getElementById('modal').style.display = 'flex';
    }

    function closeModal() {
        document.getElementById('modal').style.display = 'none';
    }

    function prepararImpresion(url) {
        const img = new Image();
        img.src = url;
        img.onload = () => {
            const area = document.getElementById('print-area');
            area.innerHTML = '';
            area.appendChild(img);
            const styleId = 'print-style';
            if (document.getElementById(styleId)) document.getElementById(styleId).remove();
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `@media print { @page { size: ${img.naturalWidth}px ${img.naturalHeight}px; margin: 0 !important; } }`;
            document.head.appendChild(style);
            setTimeout(() => window.print(), 250);
        };
    }