import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Configuración Supabase (Exportada para que admin.js pueda usarla)
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

// Solo ejecutar lógica de mapa si estamos en index.html
if (document.getElementById('map')) {
    let estado = {
        entidades: [],
        servicios: [],
        catalogoCompleto: [],
        entidadSeleccionada: null,
        filtros: { texto: "", entidad: "", sector: "", catalogosSeleccionados: [] },
        paginacionEntidades: { paginaActual: 1, itemsPorPagina: 8 },
        paginacionServicios: { paginaActual: 1, itemsPorPagina: 4 }
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
        selEnt.innerHTML = '<option value="">Todas las Entidades</option>';
        estado.entidades.forEach(e => selEnt.innerHTML += `<option value="${e.entidad_id}">${e.denominacion}</option>`);

        const selSec = document.getElementById('filtro-sector');
        selSec.innerHTML = '<option value="">Todos los Sectores</option>';
        Object.keys(CONFIG_SECTORES).forEach(s => selSec.innerHTML += `<option value="${s}">${s}</option>`);

        const containerChecks = document.getElementById('catalogo-checkboxes');
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
    };

    const actualizarFiltros = () => {
        const count = estado.filtros.catalogosSeleccionados.length;
        const textSpan = document.getElementById('catalogo-selected-text');
        textSpan.textContent = count === 0 ? "Seleccionar..." : `${count} seleccionados`;
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

        // Render Listas
        renderLista(document.getElementById('lista-entidades'), entFiltradas, estado.paginacionEntidades, renderEntidadCard);
        renderLista(document.getElementById('lista-servicios'), srvFiltrados, estado.paginacionServicios, renderServicioCard);
        
        // Contadores y Paginación
        actualizarPaginacionUI('ent', entFiltradas.length, estado.paginacionEntidades);
        actualizarPaginacionUI('srv', srvFiltrados.length, estado.paginacionServicios);

        // Mapa
        markersGroup.clearLayers();
        entFiltradas.forEach(ent => {
            if (!ent.latitud || !ent.longitud) return;
            const marker = L.marker([ent.latitud, ent.longitud], { 
                icon: L.divIcon({ html: '<div class="pin-marker"><span class="material-symbols-outlined icon-shadow" style="font-size: 48px; color: #7C3844;">location_on</span></div>', className: '', iconSize: [48, 48], iconAnchor: [24, 46] }) 
            });
            marker.bindTooltip(`<div class="text-center p-2"><h3 class="font-bold text-sm text-brand-red">${ent.denominacion}</h3></div>`, { direction: 'top', className: 'custom-tooltip-style' });
            marker.on('click', () => { estado.entidadSeleccionada = ent; render(); });
            markersGroup.addLayer(marker);
        });
    };

    const renderLista = (container, items, paginacion, renderFn) => {
        container.innerHTML = items.length === 0 ? '<div class="p-8 text-center text-gray-400 text-sm">Sin resultados</div>' : '';
        const visible = items.slice((paginacion.paginaActual - 1) * paginacion.itemsPorPagina, paginacion.paginaActual * paginacion.itemsPorPagina);
        visible.forEach(item => container.appendChild(renderFn(item)));
    };

    const renderEntidadCard = (ent) => {
        const div = document.createElement('div');
        const isSel = estado.entidadSeleccionada?.entidad_id === ent.entidad_id;
        div.className = `p-3 border-b hover:bg-red-50 cursor-pointer flex items-center gap-3 ${isSel ? 'bg-red-50 border-l-4 border-brand-red' : ''}`;
        div.innerHTML = `<img src="${ent.logo_url}" class="w-10 h-10 object-contain border rounded-full bg-white"><h3 class="font-semibold text-xs truncate">${ent.denominacion}</h3>`;
        div.onclick = () => { estado.entidadSeleccionada = ent; map.flyTo([ent.latitud, ent.longitud], 15); render(); };
        return div;
    };

    const renderServicioCard = (serv) => {
        const conf = CONFIG_SECTORES[serv.sector] || { color: "#666", icon: "circle" };
        const div = document.createElement('div');
        div.className = "border rounded-lg p-3 bg-white hover:shadow-md cursor-pointer border-l-4";
        div.style.borderLeftColor = conf.color;
        div.innerHTML = `<div class="text-[8px] font-bold uppercase mb-1" style="color:${conf.color}">${serv.sector}</div><h4 class="font-bold text-xs mb-2">${serv.servicio}</h4><div class="text-[10px] text-gray-400 truncate">${serv.entidad_nombre}</div>`;
        div.onclick = () => window.openModalServicio(serv);
        return div;
    };

    const actualizarPaginacionUI = (prefix, total, pag) => {
        const totalPags = Math.ceil(total / pag.itemsPorPagina) || 1;
        document.getElementById(`info-paginacion-${prefix}`).textContent = `${pag.paginaActual}/${totalPags}`;
        document.getElementById(`btn-prev-${prefix}`).disabled = pag.paginaActual === 1;
        document.getElementById(`btn-next-${prefix}`).disabled = pag.paginaActual >= totalPags;
        document.getElementById(`contador-${prefix === 'ent' ? 'entidades' : 'servicios'}`).textContent = total;
    };

    const initEventos = () => {
        document.getElementById('filtro-texto').addEventListener('input', e => { estado.filtros.texto = e.target.value.toLowerCase(); render(); });
        document.getElementById('filtro-entidad').addEventListener('change', e => { estado.filtros.entidad = e.target.value; render(); });
        document.getElementById('filtro-sector').addEventListener('change', e => { estado.filtros.sector = e.target.value; render(); });
        document.getElementById('btn-catalogo-dropdown').onclick = () => document.getElementById('catalogo-dropdown-list').classList.toggle('hidden');
        document.getElementById('btn-limpiar').onclick = () => window.location.reload();
        
        document.getElementById('btn-prev-ent').onclick = () => { if (estado.paginacionEntidades.paginaActual > 1) { estado.paginacionEntidades.paginaActual--; render(); }};
        document.getElementById('btn-next-ent').onclick = () => { if (estado.paginacionEntidades.paginaActual < Math.ceil(obtenerTotal('ent') / 8)) { estado.paginacionEntidades.paginaActual++; render(); }};
    };

    window.cerrarModal = () => document.getElementById('modal-overlay').classList.add('hidden');
    window.openModalServicio = (s) => {
        const conf = CONFIG_SECTORES[s.sector] || { color: "#666" };
        document.getElementById('modal-img').src = s.entidad_logo;
        document.getElementById('modal-title').textContent = s.servicio;
        document.getElementById('modal-subtitle').innerHTML = `<span class="px-2 py-0.5 rounded text-white text-[9px]" style="background:${conf.color}">${s.sector}</span>`;
        document.getElementById('modal-body').innerHTML = `
            <div class="space-y-3">
                <div class="p-3 bg-gray-50 rounded"><div class="text-[10px] text-gray-400 uppercase font-bold">Dirección</div><div class="text-sm">${s.direccion || 'No especificada'}</div></div>
                <div class="p-3 bg-gray-50 rounded"><div class="text-[10px] text-gray-400 uppercase font-bold">Entidad</div><div class="text-sm font-bold text-brand-red">${s.entidad_nombre}</div></div>
                ${s.cod_catalogo ? `<div class="p-3 bg-blue-50 border border-blue-100 rounded text-sm text-blue-700"><strong>Catálogo RESO:</strong> ${s.cod_catalogo} - ${s.catalogo_nombre}</div>` : ''}
            </div>`;
        document.getElementById('modal-btn-llegar').onclick = () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${s.latitud},${s.longitud}`);
        document.getElementById('modal-overlay').classList.remove('hidden');
    };

    window.onload = init;
}