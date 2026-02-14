import { supabase, CONFIG_SECTORES } from './app.js';

let adminState = {
    activeTab: 'tab-entidad',
    modo: 'create',
    selectedId: null,
    entidades: [],
    servicios: [],
    catalogo: []
};

const initAdmin = async () => {
    const session = await checkAuth();
    if (!session) return;

    document.getElementById('user-email').textContent = session.user.email;
    await loadData();
    initForms();
    renderList();
    
    document.getElementById('btn-logout').onclick = async () => {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    };
};

const checkAuth = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;

    const email = prompt("Email de Administrador:");
    if (!email) return window.location.href = 'index.html';
    const password = prompt("Contraseña:");
    
    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        alert("Acceso denegado.");
        window.location.href = 'index.html';
        return null;
    }
    return signInData.session;
};

const loadData = async () => {
    const { data: ent } = await supabase.from("eapn_entidad").select("*").order("denominacion");
    const { data: srv } = await supabase.from("vista_servicios").select("*").order("servicio");
    const { data: cat } = await supabase.from("catalogos_servicios").select("*").order("codigo");
    
    adminState.entidades = ent || [];
    adminState.servicios = srv || [];
    adminState.catalogo = cat || [];

    // Llenar selects
    const selEnt = document.getElementById('admin-select-entidad');
    selEnt.innerHTML = '<option value="">Seleccione Entidad...</option>';
    adminState.entidades.forEach(e => selEnt.innerHTML += `<option value="${e.entidad_id}">${e.denominacion}</option>`);

    const selCat = document.getElementById('admin-select-catalogo');
    selCat.innerHTML = '<option value="">Sin catalogar</option>';
    adminState.catalogo.forEach(c => selCat.innerHTML += `<option value="${c.codigo}">${c.codigo} - ${c.nombre}</option>`);

    const selSec = document.querySelector('#form-servicio select[name="sector"]');
    selSec.innerHTML = '<option value="">Sector...</option>';
    Object.keys(CONFIG_SECTORES).forEach(s => selSec.innerHTML += `<option value="${s}">${s}</option>`);
};

window.switchTab = (tab) => {
    adminState.activeTab = tab;
    const isEnt = tab === 'tab-entidad';
    
    document.getElementById('btn-tab-entidad').className = isEnt ? "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold bg-brand-red text-white" : "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-100";
    document.getElementById('btn-tab-servicio').className = !isEnt ? "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold bg-brand-red text-white" : "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-100";
    
    document.getElementById('form-entidad').classList.toggle('hidden', !isEnt);
    document.getElementById('form-servicio').classList.toggle('hidden', isEnt);
    
    resetForm();
    renderList();
};

const resetForm = () => {
    adminState.modo = 'create';
    adminState.selectedId = null;
    document.getElementById('form-entidad').reset();
    document.getElementById('form-servicio').reset();
    document.getElementById('form-title').textContent = adminState.activeTab === 'tab-entidad' ? 'Nueva Entidad' : 'Nuevo Servicio';
    document.getElementById('form-mode-badge').textContent = 'MODO CREACIÓN';
    document.getElementById('btn-delete-entidad').classList.add('hidden');
    document.getElementById('btn-delete-servicio').classList.add('hidden');
};

const renderList = () => {
    const container = document.getElementById('admin-list-container');
    const search = document.getElementById('admin-search').value.toLowerCase();
    container.innerHTML = '';

    const items = adminState.activeTab === 'tab-entidad' 
        ? adminState.entidades.filter(e => e.denominacion.toLowerCase().includes(search))
        : adminState.servicios.filter(s => s.servicio.toLowerCase().includes(search));

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = "p-3 bg-white border rounded-lg hover:border-red-500 cursor-pointer transition shadow-sm";
        const title = adminState.activeTab === 'tab-entidad' ? item.denominacion : item.servicio;
        div.innerHTML = `<div class="text-xs font-bold text-gray-800 truncate">${title}</div>`;
        div.onclick = () => setEditMode(item);
        container.appendChild(div);
    });
};

const setEditMode = (item) => {
    adminState.modo = 'edit';
    document.getElementById('form-mode-badge').textContent = 'MODO EDICIÓN';
    
    if (adminState.activeTab === 'tab-entidad') {
        adminState.selectedId = item.entidad_id;
        const f = document.getElementById('form-entidad');
        f.denominacion.value = item.denominacion;
        f.direccion.value = item.direccion;
        f.latitud.value = item.latitud;
        f.longitud.value = item.longitud;
        f.logo_url.value = item.logo_url;
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
};

const initForms = () => {
    document.getElementById('admin-search').oninput = renderList;
    document.getElementById('btn-crear-nuevo').onclick = resetForm;
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = Object.fromEntries(fd);
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
                    await supabase.from('eapn_servicio_entidad').update({ entidad_id: data.entidad_id }).eq('servicio_id', adminState.selectedId);
                }
            }
            alert("Operación exitosa");
            await loadData();
            resetForm();
            renderList();
        } catch (err) { alert("Error al guardar"); }
    };

    document.getElementById('form-entidad').onsubmit = handleSubmit;
    document.getElementById('form-servicio').onsubmit = handleSubmit;
};

initAdmin();