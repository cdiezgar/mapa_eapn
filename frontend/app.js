import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Configuración Supabase
export const supabase = createClient(
    "https://uuwbyjaeuqqtsesxvvlj.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1d2J5amFldXFxdHNlc3h2dmxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwODM0MzgsImV4cCI6MjA4NjY1OTQzOH0.mUmcDzSG_MslsTgUxQzKdjP7TcLKwOKVl-WeCL3m4t0"
);

export const CONFIG_SECTORES = {
    "POBLACIÓN GENERAL": { color: "#64748b", icon: "groups" },
    "MUJER": { color: "#db2777", icon: "woman" },
    "INCLUSIÓN": { color: "#E30613", icon: "favorite" },
    "PERSONAS CON DISCAPACIDAD": { color: "#2563eb", icon: "accessibility_new" },
    "VOLUNTARIADO": { color: "#16a34a", icon: "volunteer_activism" },
    "TOXICOMANÍAS Y ADICCIONES": { color: "#7c3aed", icon: "medical_services" },
    "FAMILIA": { color: "#ea580c", icon: "family_restroom" },
    "INFANCIA (Y JUVENTUD)": { color: "#0891b2", icon: "child_care" },
    "PERSONAS MAYORES": { color: "#d97706", icon: "elderly" },
};

if (document.getElementById('map')) {
    let estado = {
        entidades: [],
        servicios: [],
        catalogoCompleto: [],
        entidadSeleccionada: null,
        filtros: { texto: "", entidad: "", sector: "", catalogosSeleccionados: [] },
        paginacionEntidades: { paginaActual: 1, itemsPorPagina: 10 },
        paginacionServicios: { paginaActual: 1, itemsPorPagina: 10 }
    };

    let map;
    let markersGroup = L.markerClusterGroup({
        showCoverageOnHover: false, zoomToBoundsOnClick: true, spiderfyOnMaxZoom: true, maxClusterRadius: 50
    });

    const init = async () => {
        map = L.map('map').setView([41.652, -4.724], 8);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO' }).addTo(map);
        markersGroup.addTo(map);
        await cargarDatos();
        initEventos();
    };

    const cargarDatos = async () => {
        const { data: ent } = await supabase.from("eapn_entidad").select("*").order("denominacion");
        const { data: srv } = await supabase.from("vista_servicios").select("*").order("servicio");
        const { data: cat } = await supabase.from("catalogos_servicios").select("*").order("codigo");

        estado.entidades = ent || [];
        estado.servicios = srv || [];
        estado.catalogoCompleto = cat || [];
        renderFiltros();
        render();
    };

    const renderFiltros = () => {
        const selEnt = document.getElementById('filtro-entidad');
        if (selEnt) {
            selEnt.innerHTML = '<option value="">Todas las Entidades</option>';
            estado.entidades.forEach(e => selEnt.innerHTML += `<option value="${e.entidad_id}">${e.denominacion}</option>`);
        }
        const selSec = document.getElementById('filtro-sector');
        if (selSec) {
            selSec.innerHTML = '<option value="">Todos los Sectores</option>';
            Object.keys(CONFIG_SECTORES).forEach(s => selSec.innerHTML += `<option value="${s}">${s}</option>`);
        }
        const containerChecks = document.getElementById('catalogo-checkboxes');
        if (containerChecks) {
            containerChecks.innerHTML = '';
            estado.catalogoCompleto.forEach(cat => {
                const div = document.createElement('div');
                div.className = "flex items-start gap-2 hover:bg-gray-50 p-1 rounded cursor-pointer";
                div.innerHTML = `<input type="checkbox" value="${cat.codigo}" id="cat-${cat.codigo}" class="mt-1 cursor-pointer"><label for="cat-${cat.codigo}" class="text-xs text-gray-700 cursor-pointer leading-tight"><span class="font-bold">${cat.codigo}</span> - ${cat.nombre}</label>`;
                div.querySelector('input').addEventListener('change', (e) => {
                    if (e.target.checked) estado.filtros.catalogosSeleccionados.push(e.target.value);
                    else estado.filtros.catalogosSeleccionados = estado.filtros.catalogosSeleccionados.filter(c => c !== e.target.value);
                    actualizarFiltros();
                });
                containerChecks.appendChild(div);
            });
        }
    };

    const actualizarFiltros = () => {
        const count = estado.filtros.catalogosSeleccionados.length;
        const textSpan = document.getElementById('catalogo-selected-text');
        if (textSpan) textSpan.textContent = count === 0 ? "Seleccionar..." : `${count} seleccionados`;
        estado.paginacionEntidades.paginaActual = 1;
        estado.paginacionServicios.paginaActual = 1;
        render();
    };

    const render = () => {
        const srvFiltrados = estado.servicios.filter(s => {
            if (estado.filtros.texto && !s.servicio.toLowerCase().includes(estado.filtros.texto)) return false;
            if (estado.entidadSeleccionada && s.entidad_id !== estado.entidadSeleccionada.entidad_id) return false;
            if (estado.filtros.entidad && s.entidad_id != estado.filtros.entidad) return false;
            if (estado.filtros.sector && s.sector !== estado.filtros.sector) return false;
            if (estado.filtros.catalogosSeleccionados.length > 0 && (!s.cod_catalogo || !estado.filtros.catalogosSeleccionados.includes(s.cod_catalogo))) return false;
            return true;
        });

        const idsValidas = new Set(srvFiltrados.map(s => s.entidad_id));
        const entFiltradas = estado.entidades.filter(e => {
            if (estado.filtros.entidad && e.entidad_id != estado.filtros.entidad) return false;
            if ((estado.filtros.texto || estado.filtros.sector || estado.filtros.catalogosSeleccionados.length > 0) && !idsValidas.has(e.entidad_id)) return false;
            return true;
        });

        renderLista(document.getElementById('lista-entidades'), entFiltradas, estado.paginacionEntidades, renderEntidadCard);
        renderLista(document.getElementById('lista-servicios'), srvFiltrados, estado.paginacionServicios, renderServicioCard);
        
        actualizarPaginacionUI('ent', entFiltradas.length, estado.paginacionEntidades);
        actualizarPaginacionUI('srv', srvFiltrados.length, estado.paginacionServicios);

        markersGroup.clearLayers();
        entFiltradas.forEach(ent => {
            if (!ent.latitud || !ent.longitud) return;
            const marker = L.marker([ent.latitud, ent.longitud], { 
                icon: L.divIcon({ html: '<div class="pin-marker"><span class="material-symbols-outlined icon-shadow" style="font-size: 48px; color: #7C3844;">location_on</span></div>', className: '', iconSize: [48, 48], iconAnchor: [24, 46] }) 
            });
            marker.bindTooltip(`
                <div class="flex items-center gap-3 p-1">
                    <img src="${ent.logo_url}" class="w-12 h-12 object-contain border rounded-lg bg-white shadow-sm">
                    <div class="font-bold text-sm text-brand-red leading-tight">${ent.denominacion}</div>
                </div>`, { direction: 'top', className: 'custom-tooltip-style' });
            marker.on('click', () => { estado.entidadSeleccionada = ent; render(); window.openModalEntidad(ent); });
            markersGroup.addLayer(marker);
        });
    };

    const renderLista = (container, items, paginacion, renderFn) => {
        if (!container) return;
        container.innerHTML = items.length === 0 ? '<div class="p-8 text-center text-gray-400 text-sm">Sin resultados</div>' : '';
        const visible = items.slice((paginacion.paginaActual - 1) * paginacion.itemsPorPagina, paginacion.paginaActual * paginacion.itemsPorPagina);
        visible.forEach(item => container.appendChild(renderFn(item)));
    };

    const renderEntidadCard = (ent) => {
        const div = document.createElement('div');
        const isSel = estado.entidadSeleccionada?.entidad_id === ent.entidad_id;
        div.className = `p-3 border-b hover:bg-red-50 cursor-pointer flex items-center gap-3 card-item ${isSel ? 'bg-red-50 border-l-4 border-brand-red' : ''}`;
        div.innerHTML = `<img src="${ent.logo_url}" class="w-10 h-10 object-contain border rounded-full bg-white shadow-sm"><h3 class="font-semibold text-xs truncate flex-1">${ent.denominacion}</h3><span class="material-symbols-outlined text-gray-300 text-sm">chevron_right</span>`;
        div.onclick = () => { 
            estado.entidadSeleccionada = ent; 
            map.flyTo([ent.latitud, ent.longitud], 15); 
            render(); 
            window.openModalEntidad(ent);
        };
        return div;
    };

    const renderServicioCard = (serv) => {
        const conf = CONFIG_SECTORES[serv.sector] || { color: "#666", icon: "circle" };
        const div = document.createElement('div');
        div.className = "border rounded-xl p-3 bg-white hover:shadow-lg cursor-pointer border-l-4 card-item relative overflow-hidden group transition-all";
        div.style.borderLeftColor = conf.color;
        div.innerHTML = `
            ${serv.cod_catalogo ? `<div class="absolute top-2 right-2 bg-blue-50 text-blue-600 font-mono font-bold text-[9px] px-1.5 py-0.5 rounded border border-blue-100">${serv.cod_catalogo}</div>` : ''}
            <div class="flex items-center gap-1.5 mb-2">
                <div class="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white" style="background:${conf.color}">
                    <span class="material-symbols-outlined text-[12px]">${conf.icon}</span>${serv.sector}
                </div>
            </div>
            <h4 class="font-bold text-xs mb-2 text-gray-800 leading-tight group-hover:text-brand-red">${serv.servicio}</h4>
            <div class="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">
                <img src="${serv.entidad_logo}" class="w-5 h-5 object-contain rounded-full border">
                <div class="text-[9px] text-gray-400 truncate">${serv.entidad_nombre}</div>
            </div>`;
        div.onclick = () => window.openModalServicio(serv);
        return div;
    };

    const actualizarPaginacionUI = (prefix, total, pag) => {
        const info = document.getElementById(`info-paginacion-${prefix}`);
        const btnPrev = document.getElementById(`btn-prev-${prefix}`);
        const btnNext = document.getElementById(`btn-next-${prefix}`);
        const cont = document.getElementById(`contador-${prefix === 'ent' ? 'entidades' : 'servicios'}`);
        if (info) {
            const totalPags = Math.ceil(total / pag.itemsPorPagina) || 1;
            info.textContent = `${pag.paginaActual}/${totalPags}`;
            if (btnPrev) btnPrev.disabled = pag.paginaActual === 1;
            if (btnNext) btnNext.disabled = pag.paginaActual >= totalPags;
        }
        if (cont) cont.textContent = total;
    };

    const initEventos = () => {
        document.getElementById('filtro-texto')?.addEventListener('input', e => { estado.filtros.texto = e.target.value.toLowerCase(); render(); });
        document.getElementById('filtro-entidad')?.addEventListener('change', e => { estado.filtros.entidad = e.target.value; render(); });
        document.getElementById('filtro-sector')?.addEventListener('change', e => { estado.filtros.sector = e.target.value; render(); });
        document.getElementById('btn-catalogo-dropdown')?.addEventListener('click', () => document.getElementById('catalogo-dropdown-list').classList.toggle('hidden'));
        document.getElementById('btn-limpiar')?.addEventListener('click', () => window.location.reload());
        
        document.getElementById('btn-prev-ent')?.addEventListener('click', () => { if (estado.paginacionEntidades.paginaActual > 1) { estado.paginacionEntidades.paginaActual--; render(); }});
        document.getElementById('btn-next-ent')?.addEventListener('click', () => { if (estado.paginacionEntidades.paginaActual < Math.ceil(estado.entidades.length / 10)) { estado.paginacionEntidades.paginaActual++; render(); }});
        document.getElementById('btn-prev-srv')?.addEventListener('click', () => { if (estado.paginacionServicios.paginaActual > 1) { estado.paginacionServicios.paginaActual--; render(); }});
        document.getElementById('btn-next-srv')?.addEventListener('click', () => { if (estado.paginacionServicios.paginaActual < Math.ceil(estado.servicios.length / 10)) { estado.paginacionServicios.paginaActual++; render(); }});
    };

    // Funciones Globales para Modal
    window.cerrarModal = () => document.getElementById('modal-overlay').classList.add('hidden');
    window.cerrarModalCatalogo = () => document.getElementById('modal-catalogo-overlay').classList.add('hidden');

    const updateModalHeader = (logo, title, subtitle, extraActions = '') => {
        const img = document.getElementById('modal-img');
        const tit = document.getElementById('modal-title');
        const sub = document.getElementById('modal-subtitle');
        const act = document.getElementById('modal-header-actions');
        
        if (img) img.src = logo || '';
        if (tit) tit.textContent = title || '';
        if (sub) sub.innerHTML = subtitle || '';
        if (act) act.innerHTML = extraActions;
    };

    window.openModalEntidad = (e) => {
        const headerActions = `
            ${e.web_url || e.web ? `<button class="btn-contact-outline btn-web" onclick="window.open('${e.web_url || e.web}', '_blank')"><span class="material-symbols-outlined text-sm">language</span> Web</button>` : ''}
            ${e.email ? `<button class="btn-contact-outline btn-mail" onclick="window.location.href='mailto:${e.email}'"><span class="material-symbols-outlined text-sm">alternate_email</span></button>` : ''}
        `;
        updateModalHeader(e.logo_url, e.denominacion, `<span class="bg-gray-200 text-gray-600 text-[10px] font-black px-2 py-0.5 rounded-lg">ENTIDAD SOCIAL</span>`, headerActions);
        
        document.getElementById('modal-body').innerHTML = `
            <div class="space-y-4">
                <div class="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <span class="material-symbols-outlined text-brand-red p-2 bg-white rounded-xl shadow-sm">location_on</span>
                    <div class="flex-1">
                        <div class="text-[10px] text-gray-400 font-black uppercase">Dirección</div>
                        <div class="text-sm font-semibold text-gray-700">${e.direccion || 'No especificada'}</div>
                    </div>
                </div>
                ${e.telefono ? `<div class="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100"><span class="material-symbols-outlined text-blue-500 p-2 bg-white rounded-xl shadow-sm">call</span><div class="flex-1"><div class="text-[10px] text-gray-400 font-black uppercase">Teléfono</div><div class="text-sm font-semibold text-gray-700">${e.telefono}</div></div></div>` : ''}
                ${e.email ? `<div class="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100"><span class="material-symbols-outlined text-orange-500 p-2 bg-white rounded-xl shadow-sm">mail</span><div class="flex-1"><div class="text-[10px] text-gray-400 font-black uppercase">Email</div><div class="text-sm font-semibold text-gray-700">${e.email}</div></div></div>` : ''}
            </div>`;
        document.getElementById('modal-btn-llegar').onclick = () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${e.latitud},${e.longitud}`);
        document.getElementById('modal-overlay').classList.remove('hidden');
    };

    window.openModalServicio = (s) => {
        const conf = CONFIG_SECTORES[s.sector] || { color: "#666", icon: 'help' };
        updateModalHeader(s.entidad_logo, s.servicio, `<div class="flex items-center gap-1 px-2 py-0.5 rounded-lg text-white text-[10px] font-black shadow-sm" style="background:${conf.color}"><span class="material-symbols-outlined text-[14px]">${conf.icon}</span>${s.sector}</div>`);
        
        let contactItems = '';
        if (s.direccion) contactItems += `<div class="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100"><span class="material-symbols-outlined text-brand-red p-2 bg-white rounded-xl shadow-sm">location_on</span><div class="flex-1"><div class="text-[10px] text-gray-400 font-black uppercase">Dirección</div><div class="text-sm font-semibold text-gray-700">${s.direccion}</div></div></div>`;
        if (s.telefono) contactItems += `<div class="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100"><span class="material-symbols-outlined text-blue-500 p-2 bg-white rounded-xl shadow-sm">call</span><div class="flex-1"><div class="text-[10px] text-gray-400 font-black uppercase">Teléfono</div><div class="text-sm font-semibold text-gray-700">${s.telefono}</div></div></div>`;
        if (s.email) contactItems += `<div class="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100"><span class="material-symbols-outlined text-orange-500 p-2 bg-white rounded-xl shadow-sm">mail</span><div class="flex-1"><div class="text-[10px] text-gray-400 font-black uppercase">Email</div><div class="text-sm font-semibold text-gray-700">${s.email}</div></div></div>`;

        document.getElementById('modal-body').innerHTML = `
            <div class="space-y-4">
                ${contactItems}
                ${s.cod_catalogo ? `<div class="p-4 bg-blue-50 border border-blue-100 rounded-2xl"><div class="flex items-center gap-2 mb-2"><div class="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-lg">${s.cod_catalogo}</div><div class="text-xs font-bold text-blue-800 uppercase tracking-tighter">Catálogo RESO</div></div><div class="text-sm text-blue-700 leading-snug">${s.catalogo_nombre}</div></div>` : ''}
                <div class="mt-4 pt-4 border-t"><div class="text-[9px] text-gray-400 font-black uppercase mb-3">Entidad Responsable</div><div class="flex items-center gap-3 p-3 border-2 border-dashed rounded-2xl bg-white"><img src="${s.entidad_logo}" class="w-10 h-10 object-contain"><span class="text-xs font-bold text-gray-800">${s.entidad_nombre}</span></div></div>
            </div>`;
        document.getElementById('modal-btn-llegar').onclick = () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${s.latitud},${s.longitud}`);
        document.getElementById('modal-overlay').classList.remove('hidden');
    };

    window.onload = init;
}