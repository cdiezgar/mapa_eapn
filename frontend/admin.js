import { supabase, CONFIG_SECTORES } from './app.js';

let adminState = {
    activeTab: 'tab-entidad',
    modo: 'create',
    selectedId: null,
    entidades: [],
    sedes: [],
    servicios: [],
    catalogo: [],
    provincias: [] // <--- NUEVO
};

let mapPicker = {
    map: null,
    marker: null,
    targetForm: null,
    geocoder: null
};

// --- FLUJO DE INICIALIZACIÓN ---
async function start() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        showAdminPanel(session.user);
    } else {
        initLoginForm();
    }
}

function initLoginForm() {
    const form = document.getElementById('login-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-pass').value;
        const btn = document.getElementById('btn-login-submit');
        const errorDiv = document.getElementById('login-error');

        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin material-symbols-outlined">sync</span>';
        
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            document.getElementById('login-error-text').textContent = "Acceso denegado: Credenciales incorrectas.";
            errorDiv.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined">login</span> ACCEDER AL PANEL';
        } else {
            showAdminPanel(data.user);
        }
    };
}

async function showAdminPanel(user) {
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('admin-content').classList.remove('hidden');
    document.getElementById('user-display').textContent = user.email;

    await loadData();
    initAdminEvents();
    initResizer(); 
    initMobileMenu(); // Inicializar menú móvil
    renderList();
    initMapFunctions();
}

async function loadData() {
    const [eRes, sRes, cRes, sedesRes, provRes] = await Promise.all([
        supabase.from("eapn_entidad").select("*").order("denominacion"),
        supabase.from("vista_servicios").select("*").order("servicio"),
        supabase.from("catalogos_servicios").select("*").order("codigo"),
        supabase.from("sedes_entidades").select("*"),
        supabase.from("provincia").select("*").order("provincia") // <--- NUEVO
    ]);

    adminState.entidades = eRes.data || [];
    adminState.servicios = sRes.data || [];
    adminState.sedes = sedesRes.data || [];
    adminState.catalogo = cRes.data || [];
    adminState.provincias = provRes.data || []; // <--- NUEVO

    const selEnt = document.getElementById('admin-select-entidad');
    selEnt.innerHTML = '<option value="">Seleccione Entidad...</option>';
    
    const filterEnt = document.getElementById('admin-filter-entidad');
    filterEnt.innerHTML = '<option value="">Todas las Entidades</option>';

    const selEntSede = document.getElementById('admin-select-entidad-sede');
    selEntSede.innerHTML = '<option value="">Seleccione Entidad...</option>';

    adminState.entidades.forEach(e => {
        const opt = `<option value="${e.entidad_id}">${e.denominacion}</option>`;
        selEnt.innerHTML += opt;
        filterEnt.innerHTML += opt;
        selEntSede.innerHTML += opt;
    });

    // Rellenar select de Provincias
    const selProv = document.getElementById('admin-select-provincia');
    selProv.innerHTML = '<option value="">Seleccione Provincia...</option>';
    adminState.provincias.forEach(p => {
        selProv.innerHTML += `<option value="${p.cod_provincia}">${p.provincia}</option>`;
    });

    const selCat = document.getElementById('admin-select-catalogo');
    selCat.innerHTML = '<option value="">-- No catalogado --</option>';
    adminState.catalogo.forEach(c => selCat.innerHTML += `<option value="${c.codigo}">${c.codigo} - ${c.nombre}</option>`);

    const selSec = document.querySelector('#form-servicio select[name="sector"]');
    selSec.innerHTML = '<option value="">Sector...</option>';
    Object.keys(CONFIG_SECTORES).forEach(s => selSec.innerHTML += `<option value="${s}">${s}</option>`);
}

function initAdminEvents() {
    document.getElementById('btn-logout').onclick = async () => {
        await supabase.auth.signOut();
        window.location.reload();
    };

    document.getElementById('admin-search').oninput = renderList;
    document.getElementById('admin-filter-entidad').onchange = renderList;

    document.getElementById('btn-crear-nuevo').onclick = () => {
        resetForm();
        // Cerrar menú en móvil si se pulsa nuevo
        toggleMobileMenu(false);
    };

    document.getElementById('form-entidad').onsubmit = handleSave;
    document.getElementById('form-servicio').onsubmit = handleSave;
    document.getElementById('form-sede').onsubmit = handleSave; // <--- NUEVO
    document.getElementById('btn-delete-entidad').onclick = () => handleDelete('entidad');
    document.getElementById('btn-delete-servicio').onclick = () => handleDelete('servicio');
    document.getElementById('btn-delete-sede').onclick = () => handleDelete('sede'); // <--- NUEVO

    const toggleReso = document.getElementById('toggle-reso');
    toggleReso.onchange = (e) => {
        const isChecked = e.target.checked;
        document.getElementById('group-catalogo').classList.toggle('hidden', !isChecked);
        document.getElementById('group-subtipo').classList.toggle('hidden', isChecked);
        
        const catSelect = document.getElementById('admin-select-catalogo');
        const subtipoInput = document.getElementById('field-subtipo');
        
        if (isChecked) {
            catSelect.setAttribute('required', '');
            subtipoInput.removeAttribute('required');
        } else {
            subtipoInput.setAttribute('required', '');
            catSelect.removeAttribute('required');
        }
    };
}

// NUEVA: Gestión del menú móvil
function initMobileMenu() {
    const btnOpen = document.getElementById('btn-mobile-menu');
    const btnClose = document.getElementById('btn-close-menu');
    const overlay = document.getElementById('mobile-overlay');

    btnOpen.onclick = () => toggleMobileMenu(true);
    btnClose.onclick = () => toggleMobileMenu(false);
    overlay.onclick = () => toggleMobileMenu(false);
}

function toggleMobileMenu(show) {
    const sidebar = document.getElementById('admin-sidebar');
    const overlay = document.getElementById('mobile-overlay');

    if (show) {
        sidebar.classList.remove('-translate-x-full');
        overlay.classList.remove('hidden');
        // Pequeño timeout para que la transición de opacidad funcione al quitar hidden
        setTimeout(() => overlay.classList.remove('opacity-0'), 10);
    } else {
        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
}

function initResizer() {
    const sidebar = document.getElementById('admin-sidebar');
    const resizer = document.getElementById('drag-handle');
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        if (window.innerWidth < 768) return; // Desactivar en móvil
        isResizing = true;
        document.body.style.cursor = 'col-resize';
        resizer.classList.add('resizing');
        document.body.style.userSelect = 'none'; 
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = e.clientX;
        if (newWidth > 300 && newWidth < window.innerWidth * 0.8) {
            sidebar.style.width = `${newWidth}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            resizer.classList.remove('resizing');
        }
    });
}

window.switchTab = (tab) => {
    adminState.activeTab = tab;
    
    // Actualizar clases de botones (puedes refactorizar esto, pero siguiendo tu estilo):
    const activeClass = "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold bg-brand-red text-white transition";
    const inactiveClass = "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-100 transition";
    
    document.getElementById('btn-tab-entidad').className = tab === 'tab-entidad' ? activeClass : inactiveClass;
    document.getElementById('btn-tab-servicio').className = tab === 'tab-servicio' ? activeClass : inactiveClass;
    document.getElementById('btn-tab-sede').className = tab === 'tab-sede' ? activeClass : inactiveClass; // <--- NUEVO

    // Visibilidad de formularios
    document.getElementById('form-entidad').classList.toggle('hidden', tab !== 'tab-entidad');
    document.getElementById('form-servicio').classList.toggle('hidden', tab !== 'tab-servicio');
    document.getElementById('form-sede').classList.toggle('hidden', tab !== 'tab-sede'); // <--- NUEVO
    
    // El filtro de entidad es útil tanto para servicios como para sedes
    document.getElementById('filter-entidad-container').classList.toggle('hidden', tab === 'tab-entidad');

    document.getElementById('admin-filter-entidad').value = "";
    document.getElementById('admin-search').value = "";
    
    resetForm();
    renderList();
};

function resetForm() {
    adminState.modo = 'create';
    adminState.selectedId = null;
    document.getElementById('form-entidad').reset();
    document.getElementById('form-servicio').reset();
    document.getElementById('form-sede').reset(); // <--- NUEVO

    if(adminState.activeTab === 'tab-entidad') document.getElementById('form-title').textContent = 'Nueva Entidad';
    else if(adminState.activeTab === 'tab-servicio') document.getElementById('form-title').textContent = 'Nuevo Servicio';
    else document.getElementById('form-title').textContent = 'Nueva Sede'; // <--- NUEVO    document.getElementById('form-mode-badge').textContent = 'Creación';
    
    document.getElementById('btn-delete-entidad').classList.add('hidden');
    document.getElementById('btn-delete-servicio').classList.add('hidden');
    document.getElementById('btn-delete-sede').classList.add('hidden'); // <--- NUEVO

    const toggle = document.getElementById('toggle-reso');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
}

function renderList() {
    const container = document.getElementById('admin-list-container');
    const search = document.getElementById('admin-search').value.toLowerCase();
    const filterEntidadId = document.getElementById('admin-filter-entidad').value; 
    container.innerHTML = '';

    if (adminState.activeTab === 'tab-entidad') {
        const items = adminState.entidades.filter(e => e.denominacion.toLowerCase().includes(search));

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = "p-3 bg-white border rounded-lg hover:border-brand-red cursor-pointer transition shadow-sm group flex justify-between items-center min-h-[50px]";
            div.innerHTML = `<div class="text-xs font-bold text-gray-700 whitespace-normal leading-tight w-full pr-2">${item.denominacion}</div><span class="material-symbols-outlined text-gray-300 group-hover:text-brand-red text-sm shrink-0">edit</span>`;
            div.onclick = () => {
                setEditMode(item);
                toggleMobileMenu(false); // Cerrar menú en móvil al seleccionar
            };
            container.appendChild(div);
        });

    } else if (adminState.activeTab === 'tab-sede') { // <--- NUEVA LÓGICA SEDES
        
        // Enriquecer sedes con nombre de entidad
        let sedesEnriquecidas = adminState.sedes.map(s => {
            const entidad = adminState.entidades.find(e => e.entidad_id === s.entidad_id);
            return {
                ...s,
                nombre_entidad: entidad ? entidad.denominacion : 'Sin Entidad Asignada'
            };
        });

        // Filtrar
        sedesEnriquecidas = sedesEnriquecidas.filter(s => {
            const matchesText = (s.direccion || '').toLowerCase().includes(search) || s.nombre_entidad.toLowerCase().includes(search);
            const matchesEntidad = filterEntidadId === "" || String(s.entidad_id) === filterEntidadId;
            return matchesText && matchesEntidad;
        });

        sedesEnriquecidas.sort((a, b) => {
            // 1. Primero agrupamos por el nombre de la entidad
            if (a.nombre_entidad < b.nombre_entidad) return -1;
            if (a.nombre_entidad > b.nombre_entidad) return 1;
            
            // 2. Si son de la misma entidad, ordenamos alfabéticamente por la dirección
            const dirA = a.direccion || '';
            const dirB = b.direccion || '';
            return dirA.localeCompare(dirB);
        });

        let lastEntidad = null;
        let groupContainer = null; // NUEVO: Contenedor agrupador

        sedesEnriquecidas.forEach(item => {
            if (item.nombre_entidad !== lastEntidad) {
                // 1. Creamos la caja "padre" para agrupar esta entidad
                groupContainer = document.createElement('div');
                groupContainer.className = "relative pb-3"; // pb-3 da espacio entre entidades
                container.appendChild(groupContainer);

                // 2. Metemos el encabezado sticky DENTRO del grupo
                const header = document.createElement('div');
                header.className = "sticky top-0 bg-gray-100 z-10 px-2 py-2 text-[10px] font-black text-brand-red uppercase tracking-widest border-b border-gray-200 shadow-sm whitespace-normal break-words";
                header.textContent = item.nombre_entidad;
                groupContainer.appendChild(header);
                
                lastEntidad = item.nombre_entidad;
            }

            // 3. Metemos las tarjetas DENTRO del grupo, no sueltas
            const div = document.createElement('div');
            div.className = "ml-2 mt-1 p-3 bg-white border rounded-lg hover:border-brand-red cursor-pointer transition shadow-sm group flex justify-between items-center";
            div.innerHTML = `<div class="text-xs font-medium text-gray-700 w-full">${item.direccion || 'Sin dirección'} (${item.municipio || '-'})</div><span class="material-symbols-outlined text-gray-300 group-hover:text-brand-red text-sm">edit</span>`;
            div.onclick = () => {
                setEditMode(item);
                toggleMobileMenu(false);
            };
            
            groupContainer.appendChild(div); // <--- IMPORTANTE
        });

    } else  {
        let serviciosEnriquecidos = adminState.servicios.map(s => {
            const entidad = adminState.entidades.find(e => e.entidad_id === s.entidad_id);
            return {
                ...s,
                nombre_entidad: entidad ? entidad.denominacion : 'Sin Entidad Asignada'
            };
        });

        serviciosEnriquecidos = serviciosEnriquecidos.filter(s => {
            const matchesText = s.servicio.toLowerCase().includes(search) || s.nombre_entidad.toLowerCase().includes(search);
            const matchesEntidad = filterEntidadId === "" || String(s.entidad_id) === filterEntidadId;
            return matchesText && matchesEntidad;
        });

        serviciosEnriquecidos.sort((a, b) => {
            if (a.nombre_entidad < b.nombre_entidad) return -1;
            if (a.nombre_entidad > b.nombre_entidad) return 1;
            return a.servicio.localeCompare(b.servicio);
        });

        let lastEntidad = null;
        let groupContainer = null; // NUEVO: Contenedor agrupador

        serviciosEnriquecidos.forEach(item => {
            if (item.nombre_entidad !== lastEntidad) {
                // 1. Creamos la caja "padre"
                groupContainer = document.createElement('div');
                groupContainer.className = "relative pb-3";
                container.appendChild(groupContainer);

                // 2. Metemos el encabezado sticky
                const header = document.createElement('div');
                header.className = "sticky top-0 bg-gray-100 z-10 px-2 py-2 text-[10px] font-black text-brand-red uppercase tracking-widest border-b border-gray-200 shadow-sm whitespace-normal break-words";
                header.textContent = item.nombre_entidad;
                groupContainer.appendChild(header);
                
                lastEntidad = item.nombre_entidad;
            }

            // 3. Metemos la tarjeta
            const div = document.createElement('div');
            div.className = "ml-2 mt-1 p-3 bg-white border rounded-lg hover:border-brand-red cursor-pointer transition shadow-sm group flex justify-between items-center";
            div.innerHTML = `<div class="text-xs font-medium text-gray-700 w-full">${item.servicio}</div><span class="material-symbols-outlined text-gray-300 group-hover:text-brand-red text-sm">edit</span>`;
            div.onclick = () => {
                setEditMode(item);
                toggleMobileMenu(false);
            };
            
            groupContainer.appendChild(div); // <--- IMPORTANTE
        }); 
        if (serviciosEnriquecidos.length === 0) {
            container.innerHTML = '<div class="text-center text-xs text-gray-400 mt-4">No se encontraron servicios.</div>';
        }
    }
}

function setEditMode(item) {
    adminState.modo = 'edit';
    document.getElementById('form-mode-badge').textContent = 'Edición';
    
    if (adminState.activeTab === 'tab-entidad') {
        adminState.selectedId = item.entidad_id;
        const f = document.getElementById('form-entidad');
        f.denominacion.value = item.denominacion;
        f.web.value = item.web || '';
        f.logo_url.value = item.logo_url || '';
        document.getElementById('btn-delete-entidad').classList.remove('hidden');
    } else if (adminState.activeTab === 'tab-sede') { // <--- NUEVO
        adminState.selectedId = item.id; // La tabla sedes tiene columna 'id'
        const f = document.getElementById('form-sede');
        f.entidad_id.value = item.entidad_id;
        f.direccion.value = item.direccion || '';
        f.municipio.value = item.municipio || '';
        f.cod_provincia.value = item.cod_provincia || '';
        f.codigo_postal.value = item.codigo_postal || '';
        f.telefono.value = item.telefono || '';
        f.email.value = item.email || '';
        f.latitud.value = item.latitud || '';
        f.longitud.value = item.longitud || '';
        document.getElementById('btn-delete-sede').classList.remove('hidden');
    } else {
        adminState.selectedId = item.servicio_id;
        const f = document.getElementById('form-servicio');
        f.servicio.value = item.servicio;
        f.sector.value = item.sector;
        f.entidad_id.value = item.entidad_id;
        f.direccion.value = item.direccion || '';
        f.telefono.value = item.telefono || '';
        f.email.value = item.email || '';
        f.web.value = item.web || '';
        f.latitud.value = item.latitud || '';
        f.longitud.value = item.longitud || '';
        
        const hasReso = !!item.cod_catalogo;
        const toggle = document.getElementById('toggle-reso');
        toggle.checked = hasReso;
        toggle.dispatchEvent(new Event('change'));
        
        if (hasReso) f.cod_catalogo.value = item.cod_catalogo;
        else f.subtipo.value = item.subtipo || '';

        document.getElementById('btn-delete-servicio').classList.remove('hidden');
    }
}

async function handleSave(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    
    if (adminState.modo === 'create') {
        if (adminState.activeTab === 'tab-entidad') {
            delete data.entidad_id; 
        } else {
            delete data.servicio_id;
        }
    }
    
// Solo formateamos latitud y longitud si NO estamos en entidades
    if (adminState.activeTab !== 'tab-entidad') {
        if (data.latitud === "" || data.latitud === undefined) data.latitud = null;
        else data.latitud = parseFloat(data.latitud);
        
        if (data.longitud === "" || data.longitud === undefined) data.longitud = null;
        else data.longitud = parseFloat(data.longitud);
    } else {
        // Por seguridad, si se colaran en el objeto data, las eliminamos antes de enviar a Supabase
        delete data.latitud;
        delete data.longitud;
        delete data.direccion;
        delete data.telefono;
        delete data.email;
    }

    try {
        if (adminState.activeTab === 'tab-entidad') {
            let res;
            if (adminState.modo === 'create') {
                res = await supabase.from('eapn_entidad').insert([data]);
            } else {
                res = await supabase.from('eapn_entidad').update(data).eq('entidad_id', adminState.selectedId);
            }
            if (res.error) throw res.error;

        } else if (adminState.activeTab === 'tab-sede') { // <--- NUEVO
            let res;
            // Eliminar ID del objeto data si existe por accidente
            if (adminState.modo === 'create') {
                res = await supabase.from('sedes_entidades').insert([data]);
            } else {
                res = await supabase.from('sedes_entidades').update(data).eq('id', adminState.selectedId);
            }
            if (res.error) throw res.error;
        } else {
            const entidad_id_referencia = data.entidad_id; 
            const srvData = { ...data };
            delete srvData.entidad_id; 
            
            const isReso = document.getElementById('toggle-reso').checked;
            if (isReso) srvData.subtipo = null;
            else srvData.cod_catalogo = null;

            if (adminState.modo === 'create') {
                const { data: newSrv, error: sErr } = await supabase.from('eapn_servicio').insert([srvData]).select().single();
                if (sErr) throw sErr;
                
                const { error: rErr } = await supabase.from('eapn_servicio_entidad').insert([{ 
                    servicio_id: newSrv.servicio_id, 
                    entidad_id: entidad_id_referencia 
                }]);
                if (rErr) throw rErr;
            } else {
                const { error: sErr } = await supabase.from('eapn_servicio').update(srvData).eq('servicio_id', adminState.selectedId);
                if (sErr) throw sErr;
                
                await supabase.from('eapn_servicio_entidad').delete().eq('servicio_id', adminState.selectedId);
                const { error: rErr } = await supabase.from('eapn_servicio_entidad').insert([{ 
                    servicio_id: adminState.selectedId, 
                    entidad_id: entidad_id_referencia 
                }]);
                if (rErr) throw rErr;
            }
        }

        alert("¡Guardado correctamente!");
        await loadData();
        resetForm();
        renderList();

    } catch (err) {
        console.error("Error completo de Supabase:", err);
        if (err.code === "23505") {
            alert("Error de base de datos: La secuencia de IDs está desincronizada.");
        } else {
            alert(`Error al guardar: ${err.message || 'Error desconocido'}`);
        }
    }
}

async function handleDelete(type) {
    if (!confirm("¿Seguro que deseas eliminar este registro permanentemente?")) return;
    try {
        if (type === 'entidad') {
            await supabase.from('eapn_servicio_entidad').delete().eq('entidad_id', adminState.selectedId);
            const { error } = await supabase.from('eapn_entidad').delete().eq('entidad_id', adminState.selectedId);
            if (error) throw error;
        } else if (type === 'sede') { // <--- NUEVO
             const { error } = await supabase.from('sedes_entidades').delete().eq('id', adminState.selectedId);
             if (error) throw error;
        } else {
            await supabase.from('eapn_servicio_entidad').delete().eq('servicio_id', adminState.selectedId);
            const { error } = await supabase.from('eapn_servicio').delete().eq('servicio_id', adminState.selectedId);
            if (error) throw error;
        }
        alert("Eliminado.");
        await loadData();
        resetForm();
        renderList();
    } catch (err) { 
        alert("Error al eliminar: " + err.message); 
    }
}

function initMapFunctions() {
    mapPicker.geocoder = new google.maps.Geocoder();

    window.openMapPicker = (type) => {
        mapPicker.targetForm = type;
        document.getElementById('map-picker-container').classList.remove('hidden');

        const form = document.getElementById(`form-${type}`);
        const addressValue = form.querySelector('[name=\"direccion\"]').value;

        const currentLatInput = document.getElementById(`${type}-lat`).value;
        const currentLngInput = document.getElementById(`${type}-lng`).value;

        const setupMapAt = (lat, lng) => {
            if (!mapPicker.map) {
                mapPicker.map = new google.maps.Map(document.getElementById('map-canvas'), { center: { lat, lng }, zoom: 15 });
                mapPicker.marker = new google.maps.Marker({ position: { lat, lng }, map: mapPicker.map, draggable: true });
                mapPicker.map.addListener('click', (e) => { 
                    mapPicker.marker.setPosition(e.latLng); 
                    updatePicker(e.latLng); 
                });
                mapPicker.marker.addListener('dragend', (e) => updatePicker(e.latLng));
            } else {
                mapPicker.map.setCenter({ lat, lng });
                mapPicker.map.setZoom(15);
                mapPicker.marker.setPosition({ lat, lng });
            }
            updatePicker({ lat: () => lat, lng: () => lng });
        };

        if (currentLatInput && currentLngInput) {
            setupMapAt(parseFloat(currentLatInput), parseFloat(currentLngInput));
        } else if (addressValue && addressValue.trim() !== "") {
            mapPicker.geocoder.geocode({ address: addressValue + ", Castilla y León, España" }, (results, status) => {
                if (status === "OK") {
                    const loc = results[0].geometry.location;
                    setupMapAt(loc.lat(), loc.lng());
                } else {
                    setupMapAt(41.6523, -4.7245);
                }
            });
        } else {
            setupMapAt(41.6523, -4.7245);
        }
    };

    function updatePicker(ll) {
        document.getElementById('picker-lat').value = ll.lat().toFixed(6);
        document.getElementById('picker-lng').value = ll.lng().toFixed(6);
    }

    document.getElementById('close-map-picker').onclick = () => document.getElementById('map-picker-container').classList.add('hidden');
    document.getElementById('confirm-picker').onclick = () => {
        document.getElementById(`${mapPicker.targetForm}-lat`).value = document.getElementById('picker-lat').value;
        document.getElementById(`${mapPicker.targetForm}-lng`).value = document.getElementById('picker-lng').value;
        document.getElementById('map-picker-container').classList.add('hidden');
    };
}

start();