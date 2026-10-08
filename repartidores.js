/* ══════════════════════════════════
   REPARTIDORES — lógica
   Guarda en localStorage: { id, name, phone, logo, color }
   · logo  → imagen subida (dataURL reducido) o URL. Si no hay, se muestra
             una insignia con las iniciales.
══════════════════════════════════ */
(function () {
    const KEY = 'repartidores_v1';
    // Lista compartida: viene del archivo repartidores-data.js (generado con "Exportar").
    const BASE = window.REPARTIDORES_BASE || { version: 0, items: [] };
    const VKEY = 'repartidores_base_v';

    // Empresas de partida (sin teléfono: rellénalos con "Editar").
    const SEED = [
        { name: 'SEUR',           color: '#e30613' },
        { name: 'Correos',        color: '#f2b600' },
        { name: 'Correos Express', color: '#d4a000' },
        { name: 'MRW',            color: '#c8102e' },
        { name: 'GLS',            color: '#0b3d91' },
        { name: 'DHL',            color: '#d40511' },
        { name: 'UPS',            color: '#5c3a1e' },
        { name: 'Amazon',         color: '#232f3e' }
    ];

    let list = load();
    let editingId = null;
    let pendingLogo = '';   // logo del formulario (dataURL o URL)

    const $ = (id) => document.getElementById(id);

    function uid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    function load() {
        // 1) Si el archivo compartido es más nuevo que lo que vio este navegador, manda el archivo.
        const seen = Number(localStorage.getItem(VKEY) || 0);
        if (BASE.items && BASE.items.length && BASE.version > seen) {
            const shared = JSON.parse(JSON.stringify(BASE.items));
            try {
                localStorage.setItem(KEY, JSON.stringify(shared));
                localStorage.setItem(VKEY, String(BASE.version));
            } catch (e) { /* ignorar */ }
            return shared;
        }
        // 2) Si no, lo que haya guardado en este navegador.
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { /* ignorar */ }
        // 3) Primera vez y sin archivo compartido: empresas de partida.
        const seeded = SEED.map(s => ({ id: uid(), name: s.name, phone: '', logo: '', color: s.color }));
        try { localStorage.setItem(KEY, JSON.stringify(seeded)); } catch (e) { /* ignorar */ }
        return seeded;
    }

    // Descarga repartidores-data.js con la lista actual para compartirla con todos.
    function exportData() {
        const out = { version: Date.now(), items: list };
        const txt = '// Generado desde el panel Repartidores (botón Exportar).\n' +
                    '// Sustituye este archivo en el proyecto y vuelve a subir la web.\n' +
                    'window.REPARTIDORES_BASE = ' + JSON.stringify(out, null, 2) + ';\n';
        const blob = new Blob([txt], { type: 'text/javascript' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'repartidores-data.js';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        try { localStorage.setItem(VKEY, String(out.version)); } catch (e) { /* ignorar */ }
    }

    function save() {
        try {
            localStorage.setItem(KEY, JSON.stringify(list));
        } catch (e) {
            alert('No se pudo guardar (almacenamiento lleno). Prueba con un logo más pequeño.');
        }
    }

    function initials(name) {
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '?';
        return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toUpperCase();
    }

    function telHref(phone) { return 'tel:' + phone.replace(/[^\d+]/g, ''); }

    // Logo (imagen o insignia). Se usa en las tarjetas y en la vista previa del formulario.
    function buildLogo(item) {
        const box = document.createElement('div');
        box.className = 'rep-logo';

        const badge = () => {
            box.className = 'rep-logo is-badge';
            box.style.background = item.color || '#47b5ff';
            box.textContent = initials(item.name || '?');
        };

        if (item.logo) {
            const img = document.createElement('img');
            img.alt = item.name || '';
            img.referrerPolicy = 'no-referrer';
            img.onerror = () => { box.textContent = ''; badge(); };
            img.src = item.logo;
            box.appendChild(img);
        } else {
            badge();
        }
        return box;
    }

    function iconBtn(icon, title, cls, onClick, tag) {
        const el = document.createElement(tag || 'button');
        el.className = 'rep-act' + (cls ? ' ' + cls : '');
        el.title = title;
        if (el.tagName === 'BUTTON') el.type = 'button';
        const i = document.createElement('i');
        i.className = icon;
        el.appendChild(i);
        if (onClick) el.addEventListener('click', onClick);
        return el;
    }

    /* ── Render ── */
    function render() {
        const grid = $('rep-grid');
        const q = ($('rep-search').value || '').trim().toLowerCase();
        grid.textContent = '';

        const items = list.filter(it =>
            !q || it.name.toLowerCase().includes(q) || (it.phone || '').replace(/\s/g, '').includes(q.replace(/\s/g, ''))
        );

        if (!items.length) {
            const e = document.createElement('div');
            e.className = 'rep-empty';
            e.innerHTML = '<i class="fa-solid fa-truck-fast"></i>';
            e.appendChild(document.createTextNode(list.length ? 'Sin resultados' : 'Aún no hay repartidores. Pulsa + para añadir uno.'));
            grid.appendChild(e);
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'rep-card';

            card.appendChild(buildLogo(item));

            const name = document.createElement('div');
            name.className = 'rep-name';
            name.textContent = item.name;
            card.appendChild(name);

            if (item.phone) {
                const a = document.createElement('a');
                a.className = 'rep-phone';
                a.href = telHref(item.phone);
                a.textContent = item.phone;
                card.appendChild(a);
            } else {
                const s = document.createElement('span');
                s.className = 'rep-phone empty';
                s.textContent = 'Añadir número';
                s.onclick = () => openForm(item.id);
                card.appendChild(s);
            }

            const actions = document.createElement('div');
            actions.className = 'rep-actions';
            if (item.phone) {
                actions.appendChild(iconBtn('fa-solid fa-phone', 'Llamar', '', null, 'a')).href = telHref(item.phone);
                const copyBtn = iconBtn('fa-regular fa-copy', 'Copiar número', '', () => copyPhone(item.phone, copyBtn));
                actions.appendChild(copyBtn);
            }
            actions.appendChild(iconBtn('fa-solid fa-pen', 'Editar', '', () => openForm(item.id)));
            actions.appendChild(iconBtn('fa-solid fa-trash', 'Eliminar', 'danger', () => remove(item.id)));
            card.appendChild(actions);

            grid.appendChild(card);
        });
    }

    function copyPhone(phone, btn) {
        const done = () => {
            btn.classList.add('ok');
            btn.firstChild.className = 'fa-solid fa-check';
            setTimeout(() => { btn.classList.remove('ok'); btn.firstChild.className = 'fa-regular fa-copy'; }, 1200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(phone).then(done).catch(() => {});
        } else {
            const t = document.createElement('textarea');
            t.value = phone; document.body.appendChild(t); t.select();
            try { document.execCommand('copy'); done(); } catch (e) { /* ignorar */ }
            t.remove();
        }
    }

    function remove(id) {
        const it = list.find(x => x.id === id);
        if (!it || !confirm('¿Eliminar "' + it.name + '"?')) return;
        list = list.filter(x => x.id !== id);
        save(); render();
    }

    /* ── Formulario ── */
    function refreshPreview() {
        const wrap = $('rep-logo-preview');
        wrap.textContent = '';
        wrap.appendChild(buildLogo({
            name: $('rep-f-name').value || '?',
            logo: pendingLogo,
            color: (editingId && (list.find(x => x.id === editingId) || {}).color) || '#47b5ff'
        }));
    }

    function openForm(id) {
        editingId = id || null;
        const it = id ? list.find(x => x.id === id) : null;
        $('rep-f-name').value  = it ? it.name  : '';
        $('rep-f-phone').value = it ? it.phone : '';
        pendingLogo = it ? it.logo : '';
        $('rep-f-url').value = (pendingLogo && !pendingLogo.startsWith('data:')) ? pendingLogo : '';
        $('rep-f-file').value = '';
        $('rep-form-title').textContent = it ? 'Editar repartidor' : 'Nuevo repartidor';
        $('rep-form').classList.add('open');
        refreshPreview();
        $('rep-f-name').focus();
    }

    function closeForm() {
        $('rep-form').classList.remove('open');
        editingId = null;
        pendingLogo = '';
    }

    function submitForm() {
        const name = $('rep-f-name').value.trim();
        if (!name) { $('rep-f-name').focus(); return; }
        const phone = $('rep-f-phone').value.trim();

        if (editingId) {
            const it = list.find(x => x.id === editingId);
            Object.assign(it, { name, phone, logo: pendingLogo });
        } else {
            list.push({ id: uid(), name, phone, logo: pendingLogo, color: '#47b5ff' });
        }
        save(); closeForm(); render();
    }

    // Reduce la imagen subida a 160px máx. para que localStorage no se llene.
    function handleLogoFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const max = 160;
                const k = Math.min(1, max / Math.max(img.width, img.height));
                const c = document.createElement('canvas');
                c.width = Math.round(img.width * k);
                c.height = Math.round(img.height * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                pendingLogo = c.toDataURL('image/png');
                $('rep-f-url').value = '';
                refreshPreview();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    /* ── Abrir / cerrar panel ── */
    window.openRepartidores = function () {
        $('rep-overlay').classList.add('open');
        $('rep-search').value = '';
        render();
    };
    window.closeRepartidores = function () {
        $('rep-overlay').classList.remove('open');
        closeForm();
    };

    document.addEventListener('DOMContentLoaded', () => {
        $('rep-overlay').addEventListener('click', (e) => { if (e.target.id === 'rep-overlay') window.closeRepartidores(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('rep-overlay').classList.contains('open')) window.closeRepartidores(); });
        $('rep-search').addEventListener('input', render);
        $('rep-add').addEventListener('click', () => openForm(null));
        $('rep-export').addEventListener('click', exportData);
        $('rep-f-cancel').addEventListener('click', closeForm);
        $('rep-f-save').addEventListener('click', submitForm);
        $('rep-f-name').addEventListener('input', refreshPreview);
        $('rep-f-file').addEventListener('change', (e) => handleLogoFile(e.target.files[0]));
        $('rep-f-url').addEventListener('input', (e) => { pendingLogo = e.target.value.trim(); refreshPreview(); });
        $('rep-f-clear').addEventListener('click', () => { pendingLogo = ''; $('rep-f-url').value = ''; $('rep-f-file').value = ''; refreshPreview(); });
        ['rep-f-name', 'rep-f-phone'].forEach(id => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') submitForm(); }));
    });
})();
