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

function handleSecretRouting() {
    const path = window.location.pathname;
    const hash = window.location.hash;
    if (path.endsWith('/admin') || hash === '#admin') {
        window.location.href = 'admin.html';
        return true;
    }
    return false;
}

if (document.getElementById('map')) {
    if (handleSecretRouting()) {
    } else {
        let estado = {
            entidades: [],
            servicios: [],
            catalogoCompleto: [],
            entidadSeleccionada: null,
            filtros: { texto: "", entidad: "", sector: "", catalogosSeleccionados: [] },
            paginacionEntidades: { paginaActual: 1, itemsPorPagina: 20 },
            paginacionServicios: { paginaActual: 1, itemsPorPagina: 20 }
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
            initMobileNavigation(); 
        };
        
        // --- LÓGICA RESPONSIVE MÓVIL ---
        const initMobileNavigation = () => {
            const panels = {
                'entidades': document.getElementById('panel-entidades'),
                'mapa': document.getElementById('panel-mapa'),
                'servicios': document.getElementById('panel-servicios')
            };
            const btns = {
                'entidades': document.getElementById('nav-entidades'),
                'mapa': document.getElementById('nav-mapa'),
                'servicios': document.getElementById('nav-servicios')
            };

            const switchTab = (tabName) => {
                Object.values(panels).forEach(p => {
                    if(p) {
                        p.classList.add('hidden');
                        p.classList.remove('flex');
                    }
                });
                
                Object.values(btns).forEach(b => {
                    if(b) {
                        b.classList.remove('text-brand-red', 'bg-red-50');
                        b.classList.add('text-gray-500');
                    }
                });

                if(panels[tabName]) {
                    panels[tabName].classList.remove('hidden');
                    panels[tabName].classList.add('flex');
                }
                
                if(btns[tabName]) {
                    btns[tabName].classList.add('text-brand-red', 'bg-red-50');
                    btns[tabName].classList.remove('text-gray-500');
                }

                if (tabName === 'mapa' && map) {
                    setTimeout(() => {
                        map.invalidateSize();
                    }, 100);
                }
            };

            if(btns.entidades) btns.entidades.onclick = () => switchTab('entidades');
            if(btns.mapa) btns.mapa.onclick = () => switchTab('mapa');
            if(btns.servicios) btns.servicios.onclick = () => switchTab('servicios');
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
                
                // MEJORA 2: Filtrar catálogos que realmente se usan
                const codigosUsados = new Set(estado.servicios.map(s => s.cod_catalogo).filter(c => c));
                
                estado.catalogoCompleto
                    .filter(cat => codigosUsados.has(cat.codigo)) // Solo mostramos los que tienen servicios
                    .forEach(cat => {
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
                    <div class="flex items-center gap-3 p-2 min-w-[220px]">
                        <img src="${ent.logo_url}" 
                            class="w-14 h-14 object-contain rounded border bg-white p-1">
                        <div class="font-bold text-sm text-brand-red leading-tight">
                            ${ent.denominacion}
                        </div>
                    </div>
                `, { direction: 'top', className: 'custom-tooltip-style' });
                
                marker.on('click', () => { estado.entidadSeleccionada = ent; render(); window.openModalEntidad(ent);});
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
            div.className = `p-3 border-b hover:bg-red-50 cursor-pointer flex items-center gap-3 transition-all ${isSel ? 'bg-red-50 border-l-4 border-brand-red' : ''}`;
            div.innerHTML = `<img src="${ent.logo_url}" class="w-10 h-10 object-contain border rounded-full bg-white"><h3 class="font-semibold text-xs truncate flex-1">${ent.denominacion}</h3><span class="material-symbols-outlined text-gray-300 text-sm">chevron_right</span>`;
            
            div.onclick = () => { 
                estado.entidadSeleccionada = ent; 
                
                // MEJORA 1: Cambiar automáticamente a pestaña Mapa en móvil si es necesario
                const btnMap = document.getElementById('nav-mapa');
                // Comprobamos si el botón es visible (offsetParent != null es una forma estándar de ver si es visible)
                if (btnMap && btnMap.offsetParent !== null) {
                    btnMap.click();
                }

                map.flyTo([ent.latitud, ent.longitud], 15); 
                render(); 
                window.openModalEntidad(ent);
            };
            return div;
        };

        const renderServicioCard = (serv) => {
            const conf = CONFIG_SECTORES[serv.sector] || { color: "#666", icon: "circle" };
            const div = document.createElement('div');
            div.className = "border rounded-xl p-4 bg-white hover:shadow-lg cursor-pointer border-l-[6px] transition-all relative overflow-hidden group";
            div.style.borderLeftColor = conf.color;
            div.innerHTML = `
                ${serv.cod_catalogo ? `<div class="absolute top-2 right-2 bg-blue-50 text-blue-600 font-mono font-bold text-[9px] px-1.5 py-0.5 rounded border border-blue-100">${serv.cod_catalogo}</div>` : ''}
                <div class="flex items-center gap-1.5 mb-2">
                    <div class="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold text-white shadow-sm" style="background:${conf.color}">
                        <span class="material-symbols-outlined text-[12px]">${conf.icon}</span>
                        ${serv.sector}
                    </div>
                </div>
                <h4 class="font-bold text-sm mb-2 text-gray-800 leading-tight group-hover:text-brand-red transition-colors">${serv.servicio}</h4>
                <div class="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">
                    <img src="${serv.entidad_logo}" class="w-5 h-5 object-contain rounded-full border">
                    <div class="text-[10px] text-gray-400 truncate">${serv.entidad_nombre}</div>
                </div>
            `;
            
            div.onclick = () => {
                // MEJORA 1: Cambiar automáticamente a pestaña Mapa en móvil
                const btnMap = document.getElementById('nav-mapa');
                if (btnMap && btnMap.offsetParent !== null) {
                    btnMap.click();
                }
                window.openModalServicio(serv);
            };
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
            const fTxt = document.getElementById('filtro-texto');
            if (fTxt) fTxt.addEventListener('input', e => { estado.filtros.texto = e.target.value.toLowerCase(); render(); });
            
            const fEnt = document.getElementById('filtro-entidad');
            if (fEnt) fEnt.addEventListener('change', e => { estado.filtros.entidad = e.target.value; render(); });
            
            const fSec = document.getElementById('filtro-sector');
            if (fSec) fSec.addEventListener('change', e => { estado.filtros.sector = e.target.value; render(); });

            const btnToggleFiltros = document.getElementById('btn-toggle-filtros');
                if (btnToggleFiltros) {
                    btnToggleFiltros.onclick = () => {
                        const container = document.getElementById('contenedor-filtros');
                        const isHidden = container.classList.contains('hidden');
                        
                        if (isHidden) {
                            container.classList.remove('hidden');
                            container.classList.add('flex');
                            btnToggleFiltros.classList.add('bg-red-50', 'text-brand-red', 'border-red-200');
                            btnToggleFiltros.classList.remove('bg-gray-100', 'text-gray-600');
                        } else {
                            container.classList.add('hidden');
                            container.classList.remove('flex');
                            btnToggleFiltros.classList.remove('bg-red-50', 'text-brand-red', 'border-red-200');
                            btnToggleFiltros.classList.add('bg-gray-100', 'text-gray-600');
                        }
                    };
                }

            
            const btnCat = document.getElementById('btn-catalogo-dropdown');
            if (btnCat) btnCat.onclick = () => document.getElementById('catalogo-dropdown-list').classList.toggle('hidden');
            
            const btnLim = document.getElementById('btn-limpiar');
            if (btnLim) btnLim.onclick = () => window.location.reload();
            
            const bpEnt = document.getElementById('btn-prev-ent');
            if (bpEnt) bpEnt.onclick = () => { if (estado.paginacionEntidades.paginaActual > 1) { estado.paginacionEntidades.paginaActual--; render(); }};

            
            const bnEnt = document.getElementById('btn-next-ent');
            if (bnEnt) bnEnt.onclick = () => { if (estado.paginacionEntidades.paginaActual < Math.ceil(estado.entidades.length / estado.paginacionEntidades.itemsPorPagina)) { estado.paginacionEntidades.paginaActual++; render(); }};

            const bpSrv = document.getElementById('btn-prev-srv');
            if (bpSrv) bpSrv.onclick = () => { if (estado.paginacionServicios.paginaActual > 1) { estado.paginacionServicios.paginaActual--; render(); }};
            
            const bnSrv = document.getElementById('btn-next-srv');
            if (bnSrv) bnSrv.onclick = () => { if (estado.paginacionServicios.paginaActual < Math.ceil(estado.servicios.length / estado.paginacionServicios.itemsPorPagina)) { estado.paginacionServicios.paginaActual++; render(); }};
            
            // Función reutilizable para abrir el catálogo
            const abrirCatalogo = () => {
                const tbody = document.getElementById('tabla-catalogo-body');
                tbody.innerHTML = '';
                estado.catalogoCompleto.forEach(c => {
                    tbody.innerHTML += `<tr class="hover:bg-blue-50 transition"><td class="p-3 border-b font-mono font-bold text-blue-600 text-xs">${c.codigo}</td><td class="p-3 border-b text-gray-700 text-sm">${c.nombre}</td><td class="p-3 border-b text-center"><a href="${c.url_info}" target="_blank" class="text-gray-400 hover:text-brand-red"><span class="material-symbols-outlined">visibility</span></a></td></tr>`;
                });
                document.getElementById('modal-catalogo-overlay').classList.remove('hidden');
            };

            // Asignar evento a ambos botones (móvil y desktop)
            const btnCatMobile = document.getElementById('btn-ver-catalogo-completo-mobile');
            if (btnCatMobile) btnCatMobile.onclick = abrirCatalogo;

            const btnCatDesktop = document.getElementById('btn-ver-catalogo-completo-desktop');
            if (btnCatDesktop) btnCatDesktop.onclick = abrirCatalogo;
        };

        window.cerrarModal = () => document.getElementById('modal-overlay').classList.add('hidden');
        window.cerrarModalCatalogo = () => document.getElementById('modal-catalogo-overlay').classList.add('hidden');
        
        window.openModalEntidad = (e) => {
            let web = e.web;
            document.getElementById('modal-img').src = e.logo_url;
            document.getElementById('modal-title').textContent = e.denominacion;
            document.getElementById('modal-subtitle').innerHTML = `<span class="px-2 py-0.5 rounded bg-gray-200 text-gray-600 text-[9px]">ENTIDAD SOCIAL</span>`;
            
            document.getElementById('modal-body').innerHTML = `
                <div class="space-y-3">
                    <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span class="material-symbols-outlined text-brand-red mt-0.5">location_on</span>
                        <div><div class="text-[10px] text-gray-400 uppercase font-bold">Dirección</div><div class="text-sm font-medium">${e.direccion || 'No especificada'}</div></div>
                    </div>
                    <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span class="material-symbols-outlined text-blue-500 mt-0.5">call</span>
                        <div><div class="text-[10px] text-gray-400 uppercase font-bold">Teléfono</div><div class="text-sm font-medium">${e.telefono || 'No disponible'}</div></div>
                    </div>
                    <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span class="material-symbols-outlined text-yellow-600 mt-0.5">mail</span>
                        <div><div class="text-[10px] text-gray-400 uppercase font-bold">Email</div><div class="text-sm font-medium">${e.email || 'No disponible'}</div></div>
                    </div>
                </div>`;

            let boton_acceso_web = document.getElementById('modal-btn-web');

            if (web == null) {
                boton_acceso_web.classList.add("hidden")
            } else {
                boton_acceso_web.classList.remove("hidden")
                boton_acceso_web.onclick = () => window.open(web);
            }
            
            document.getElementById('modal-btn-llegar').onclick = () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${e.latitud},${e.longitud}`);
            document.getElementById('modal-overlay').classList.remove('hidden');
        };

        window.openModalServicio = (s) => {
            const conf = CONFIG_SECTORES[s.sector] || { color: "#666", icon: 'help' };
            document.getElementById('modal-img').src = s.entidad_logo;
            document.getElementById('modal-title').textContent = s.servicio;
            document.getElementById('modal-subtitle').innerHTML = `
                <div class="flex items-center gap-1 px-2 py-0.5 rounded text-white text-[9px] font-bold" style="background:${conf.color}">
                    <span class="material-symbols-outlined text-[12px]">${conf.icon}</span>
                    ${s.sector}
                </div>`;
            
            document.getElementById('modal-body').innerHTML = `
                <div class="space-y-3">
                    <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span class="material-symbols-outlined text-brand-red mt-0.5">location_on</span>
                        <div><div class="text-[10px] text-gray-400 uppercase font-bold">Dirección</div><div class="text-sm font-medium">${s.direccion || 'No especificada'}</div></div>
                    </div>
                    <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span class="material-symbols-outlined text-blue-500 mt-0.5">call</span>
                        <div><div class="text-[10px] text-gray-400 uppercase font-bold">Teléfono</div><div class="text-sm font-medium">${s.telefono || 'Ver en entidad'}</div></div>
                    </div>
                    <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                        <span class="material-symbols-outlined text-yellow-600 mt-0.5">mail</span>
                        <div><div class="text-[10px] text-gray-400 uppercase font-bold">Email</div><div class="text-sm font-medium">${s.email || 'Ver en entidad'}</div></div>
                    </div>
                    
                    ${s.cod_catalogo ? `
                    <div class="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                        <div class="flex items-center gap-2 mb-2">
                             <div class="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded">${s.cod_catalogo}</div>
                             <div class="text-xs font-bold text-blue-800">Catálogo RESO</div>
                        </div>
                        <div class="text-sm text-blue-700 leading-snug">${s.catalogo_nombre}</div>
                        <a target="_blank" href="${s.catalogo_url}" class="inline-block mt-2 text-xs font-bold text-blue-600 hover:underline">Ver ficha técnica →</a>
                    </div>` : `
                    <div class="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                        <div class="flex items-center gap-2 mb-2">
                             <div class="text-xs font-bold text-blue-800">Servicio no catalogado en RESO</div>
                        </div>
                        <div class="text-sm text-blue-700 leading-snug">${s.subtipo}</div>
                    </div>`}

                    <div class="mt-4 pt-4 border-t">
                        <div class="text-[9px] text-gray-400 font-bold uppercase mb-2">Entidad Titular</div>
                        <div class="flex items-center gap-3 p-3 border rounded-xl bg-white shadow-sm">
                            <img src="${s.entidad_logo}" class="w-8 h-8 object-contain">
                            <span class="text-sm font-bold text-gray-700">${s.entidad_nombre}</span>
                        </div>
                    </div>
                </div>`;
            document.getElementById('modal-btn-llegar').onclick = () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${s.latitud},${s.longitud}`);
            document.getElementById('modal-overlay').classList.remove('hidden');
            document.getElementById('modal-btn-web').classList.add('hidden');
        };

        window.onload = init;
    }
}