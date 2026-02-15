import { supabase, CONFIG_SECTORES } from './app.js';

let adminState = {
    activeTab: 'tab-entidad',
    modo: 'create',
    selectedId: null,
    entidades: [],
    servicios: [],
    catalogo: []
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
    renderList();
    initMapFunctions();
}

async function loadData() {
    const [eRes, sRes, cRes] = await Promise.all([
        supabase.from("eapn_entidad").select("*").order("denominacion"),
        supabase.from("vista_servicios").select("*").order("servicio"),
        supabase.from("catalogos_servicios").select("*").order("codigo")
    ]);

    adminState.entidades = eRes.data || [];
    adminState.servicios = sRes.data || [];
    adminState.catalogo = cRes.data || [];

    const selEnt = document.getElementById('admin-select-entidad');
    selEnt.innerHTML = '<option value="">Seleccione Entidad...</option>';
    adminState.entidades.forEach(e => selEnt.innerHTML += `<option value="${e.entidad_id}">${e.denominacion}</option>`);

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
    document.getElementById('btn-crear-nuevo').onclick = resetForm;
    document.getElementById('form-entidad').onsubmit = handleSave;
    document.getElementById('form-servicio').onsubmit = handleSave;
    document.getElementById('btn-delete-entidad').onclick = () => handleDelete('entidad');
    document.getElementById('btn-delete-servicio').onclick = () => handleDelete('servicio');

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

window.switchTab = (tab) => {
    adminState.activeTab = tab;
    const isEnt = tab === 'tab-entidad';
    
    document.getElementById('btn-tab-entidad').className = isEnt ? "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold bg-brand-red text-white transition" : "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-100 transition";
    document.getElementById('btn-tab-servicio').className = !isEnt ? "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold bg-brand-red text-white transition" : "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-100 transition";
    
    document.getElementById('form-entidad').classList.toggle('hidden', !isEnt);
    document.getElementById('form-servicio').classList.toggle('hidden', isEnt);
    
    resetForm();
    renderList();
};

function resetForm() {
    adminState.modo = 'create';
    adminState.selectedId = null;
    document.getElementById('form-entidad').reset();
    document.getElementById('form-servicio').reset();
    document.getElementById('form-title').textContent = adminState.activeTab === 'tab-entidad' ? 'Nueva Entidad' : 'Nuevo Servicio';
    document.getElementById('form-mode-badge').textContent = 'Creación';
    document.getElementById('btn-delete-entidad').classList.add('hidden');
    document.getElementById('btn-delete-servicio').classList.add('hidden');
    
    const toggle = document.getElementById('toggle-reso');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
}

function renderList() {
    const container = document.getElementById('admin-list-container');
    const search = document.getElementById('admin-search').value.toLowerCase();
    container.innerHTML = '';

    const items = adminState.activeTab === 'tab-entidad' 
        ? adminState.entidades.filter(e => e.denominacion.toLowerCase().includes(search))
        : adminState.servicios.filter(s => s.servicio.toLowerCase().includes(search));

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = "p-3 bg-white border rounded-lg hover:border-brand-red cursor-pointer transition shadow-sm group flex justify-between items-center";
        const title = adminState.activeTab === 'tab-entidad' ? item.denominacion : item.servicio;
        div.innerHTML = `<div class="text-xs font-bold text-gray-700 truncate w-full">${title}</div><span class="material-symbols-outlined text-gray-300 group-hover:text-brand-red text-sm">edit</span>`;
        div.onclick = () => setEditMode(item);
        container.appendChild(div);
    });
}

function setEditMode(item) {
    adminState.modo = 'edit';
    document.getElementById('form-mode-badge').textContent = 'Edición';
    
    if (adminState.activeTab === 'tab-entidad') {
        adminState.selectedId = item.entidad_id;
        const f = document.getElementById('form-entidad');
        f.denominacion.value = item.denominacion;
        f.direccion.value = item.direccion;
        f.telefono.value = item.telefono || '';
        f.email.value = item.email || '';
        f.logo_url.value = item.logo_url || '';
        f.latitud.value = item.latitud || '';
        f.longitud.value = item.longitud || '';
        document.getElementById('btn-delete-entidad').classList.remove('hidden');
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
    if (data.latitud === "") data.latitud = null;
    if (data.longitud === "") data.longitud = null;

    try {
        if (adminState.activeTab === 'tab-entidad') {
            if (adminState.modo === 'create') await supabase.from('eapn_entidad').insert([data]);
            else await supabase.from('eapn_entidad').update(data).eq('entidad_id', adminState.selectedId);
        } else {
            const entidad_id = data.entidad_id;
            const srvData = { ...data };
            delete srvData.entidad_id;
            
            const isReso = document.getElementById('toggle-reso').checked;
            if (isReso) srvData.subtipo = null;
            else srvData.cod_catalogo = null;

            if (adminState.modo === 'create') {
                const { data: newSrv } = await supabase.from('eapn_servicio').insert([srvData]).select().single();
                await supabase.from('eapn_servicio_entidad').insert([{ servicio_id: newSrv.servicio_id, entidad_id }]);
            } else {
                await supabase.from('eapn_servicio').update(srvData).eq('servicio_id', adminState.selectedId);
                await supabase.from('eapn_servicio_entidad').delete().eq('servicio_id', adminState.selectedId);
                await supabase.from('eapn_servicio_entidad').insert([{ servicio_id: adminState.selectedId, entidad_id }]);
            }
        }
        alert("¡Guardado correctamente!");
        await loadData();
        resetForm();
        renderList();
    } catch (err) { alert("Error al guardar: " + err.message); }
}

async function handleDelete(type) {
    if (!confirm("¿Seguro que deseas eliminar este registro permanentemente?")) return;
    try {
        if (type === 'entidad') {
            await supabase.from('eapn_servicio_entidad').delete().eq('entidad_id', adminState.selectedId);
            await supabase.from('eapn_entidad').delete().eq('entidad_id', adminState.selectedId);
        } else {
            await supabase.from('eapn_servicio_entidad').delete().eq('servicio_id', adminState.selectedId);
            await supabase.from('eapn_servicio').delete().eq('servicio_id', adminState.selectedId);
        }
        alert("Eliminado.");
        await loadData();
        resetForm();
        renderList();
    } catch (err) { alert("Error al eliminar."); }
}

function initMapFunctions() {
    mapPicker.geocoder = new google.maps.Geocoder();

    window.openMapPicker = (type) => {
        mapPicker.targetForm = type;
        document.getElementById('map-picker-container').classList.remove('hidden');

        // Referencia al campo de dirección del formulario activo
        const form = document.getElementById(`form-${type}`);
        const addressValue = form.querySelector('[name="direccion"]').value;

        const currentLatInput = document.getElementById(`${type}-lat`).value;
        const currentLngInput = document.getElementById(`${type}-lng`).value;

        // Función para inicializar o actualizar el mapa en una posición
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

        // Lógica de prioridad:
        // 1. Si hay coordenadas ya puestas, usamos esas.
        // 2. Si no hay coordenadas pero hay dirección escrita, geocodificamos.
        // 3. Si no hay nada, usamos Valladolid por defecto.

        if (currentLatInput && currentLngInput) {
            setupMapAt(parseFloat(currentLatInput), parseFloat(currentLngInput));
        } else if (addressValue && addressValue.trim() !== "") {
            // Intentar buscar por la dirección del formulario
            mapPicker.geocoder.geocode({ address: addressValue + ", Castilla y León, España" }, (results, status) => {
                if (status === "OK") {
                    const loc = results[0].geometry.location;
                    setupMapAt(loc.lat(), loc.lng());
                } else {
                    // Si falla la búsqueda, fallback a Valladolid
                    setupMapAt(41.6523, -4.7245);
                }
            });
        } else {
            // Fallback total
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