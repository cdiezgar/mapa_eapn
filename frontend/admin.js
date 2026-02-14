import { supabase, CONFIG_SECTORES } from './app.js';

let adminState = {
    activeTab: 'tab-entidad',
    modo: 'create',
    selectedId: null,
    entidades: [],
    servicios: [],
    catalogo: []
};

// --- FLUJO DE INICIALIZACIÓN ---
async function start() {
    // 1. Verificar si ya hay una sesión activa
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        showAdminPanel(session.user);
    } else {
        initLoginForm();
    }
}

// --- GESTIÓN DE LOGIN ---
function initLoginForm() {
    const form = document.getElementById('login-form');
    const errorDiv = document.getElementById('login-error');
    const errorText = document.getElementById('login-error-text');

    form.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-pass').value;
        const btn = document.getElementById('btn-login-submit');

        btn.disabled = true;
        btn.innerHTML = '<span class="animate-spin material-symbols-outlined">sync</span> VALIDANDO...';
        errorDiv.classList.add('hidden');

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            errorText.textContent = "Error: Correo o contraseña inválidos.";
            errorDiv.classList.remove('hidden');
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined">login</span> ACCEDER AL PANEL';
        } else {
            showAdminPanel(data.user);
        }
    };
}

async function showAdminPanel(user) {
    // UI Toggle
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('admin-content').classList.remove('hidden');
    document.getElementById('user-display').textContent = user.email;

    // Cargar datos reales
    await loadData();
    initAdminEvents();
    renderList();
}

// --- LÓGICA DE DATOS ---
async function loadData() {
    const [eRes, sRes, cRes] = await Promise.all([
        supabase.from("eapn_entidad").select("*").order("denominacion"),
        supabase.from("vista_servicios").select("*").order("servicio"),
        supabase.from("catalogos_servicios").select("*").order("codigo")
    ]);

    adminState.entidades = eRes.data || [];
    adminState.servicios = sRes.data || [];
    adminState.catalogo = cRes.data || [];

    // Rellenar Selects
    const selEnt = document.getElementById('admin-select-entidad');
    selEnt.innerHTML = '<option value="">Seleccione Entidad...</option>';
    adminState.entidades.forEach(e => selEnt.innerHTML += `<option value="${e.entidad_id}">${e.denominacion}</option>`);

    const selCat = document.getElementById('admin-select-catalogo');
    selCat.innerHTML = '<option value="">-- No catalogado --</option>';
    adminState.catalogo.forEach(c => selCat.innerHTML += `<option value="${c.codigo}">${c.codigo} - ${c.nombre}</option>`);

    const selSec = document.querySelector('#form-servicio select[name="sector"]');
    selSec.innerHTML = '<option value="">Seleccionar Sector...</option>';
    Object.keys(CONFIG_SECTORES).forEach(s => selSec.innerHTML += `<option value="${s}">${s}</option>`);
}

// --- EVENTOS DEL PANEL ---
function initAdminEvents() {
    document.getElementById('btn-logout').onclick = async () => {
        await supabase.auth.signOut();
        window.location.reload();
    };

    document.getElementById('admin-search').oninput = renderList;
    document.getElementById('btn-crear-nuevo').onclick = resetForm;

    // Handlers de formularios
    document.getElementById('form-entidad').onsubmit = handleSave;
    document.getElementById('form-servicio').onsubmit = handleSave;

    document.getElementById('btn-delete-entidad').onclick = () => handleDelete('entidad');
    document.getElementById('btn-delete-servicio').onclick = () => handleDelete('servicio');
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
    document.getElementById('form-mode-badge').textContent = 'MODO CREACIÓN';
    document.getElementById('btn-delete-entidad').classList.add('hidden');
    document.getElementById('btn-delete-servicio').classList.add('hidden');
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
        div.innerHTML = `
            <div class="text-xs font-bold text-gray-700 truncate w-full">${title}</div>
            <span class="material-symbols-outlined text-gray-300 group-hover:text-brand-red text-sm">edit</span>
        `;
        div.onclick = () => setEditMode(item);
        container.appendChild(div);
    });
}

function setEditMode(item) {
    adminState.modo = 'edit';
    document.getElementById('form-mode-badge').textContent = 'MODO EDICIÓN';
    
    if (adminState.activeTab === 'tab-entidad') {
        adminState.selectedId = item.entidad_id;
        const f = document.getElementById('form-entidad');
        f.denominacion.value = item.denominacion;
        f.direccion.value = item.direccion;
        f.telefono.value = item.telefono;
        f.email.value = item.email || '';
        f.logo_url.value = item.logo_url;
        f.latitud.value = item.latitud;
        f.longitud.value = item.longitud;
        document.getElementById('btn-delete-entidad').classList.remove('hidden');
    } else {
        adminState.selectedId = item.servicio_id;
        const f = document.getElementById('form-servicio');
        f.servicio.value = item.servicio;
        f.sector.value = item.sector;
        f.entidad_id.value = item.entidad_id;
        f.cod_catalogo.value = item.cod_catalogo || '';
        document.getElementById('btn-delete-servicio').classList.remove('hidden');
    }
}

async function handleSave(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const isEnt = adminState.activeTab === 'tab-entidad';

    try {
        if (isEnt) {
            if (adminState.modo === 'create') await supabase.from('eapn_entidad').insert([data]);
            else await supabase.from('eapn_entidad').update(data).eq('entidad_id', adminState.selectedId);
        } else {
            const srvData = { ...data };
            delete srvData.entidad_id;
            if (adminState.modo === 'create') {
                const { data: newSrv } = await supabase.from('eapn_servicio').insert([srvData]).select().single();
                await supabase.from('eapn_servicio_entidad').insert([{ servicio_id: newSrv.servicio_id, entidad_id: data.entidad_id }]);
            } else {
                await supabase.from('eapn_servicio').update(srvData).eq('servicio_id', adminState.selectedId);
                // Simple update of relationship
                await supabase.from('eapn_servicio_entidad').delete().eq('servicio_id', adminState.selectedId);
                await supabase.from('eapn_servicio_entidad').insert([{ servicio_id: adminState.selectedId, entidad_id: data.entidad_id }]);
            }
        }
        alert("¡Guardado correctamente!");
        await loadData();
        resetForm();
        renderList();
    } catch (err) {
        console.error(err);
        alert("Error al procesar la solicitud.");
    }
}

async function handleDelete(type) {
    if (!confirm("¿Seguro que deseas eliminar este registro?")) return;
    try {
        if (type === 'entidad') {
            await supabase.from('eapn_servicio_entidad').delete().eq('entidad_id', adminState.selectedId);
            await supabase.from('eapn_entidad').delete().eq('entidad_id', adminState.selectedId);
        } else {
            await supabase.from('eapn_servicio_entidad').delete().eq('servicio_id', adminState.selectedId);
            await supabase.from('eapn_servicio').delete().eq('servicio_id', adminState.selectedId);
        }
        await loadData();
        resetForm();
        renderList();
    } catch (err) { alert("Error al eliminar."); }
}

start();