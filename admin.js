// Panel de pedidos — requiere login real (Supabase Auth).
// CONFIG y supabaseClient vienen de config.js

let pedidos = [];
let filtroEstado = 'todos';
let busquedaPedidos = '';
let filtroEstadoUSPedidos = '';
let filtroZipPedidos = '';
let pedidosExpandido = new Set();
let pedidosNuevosSinVer = 0;
const TITULO_BASE = 'Panel de pedidos — Catálogo Bimbo';

function traducirErrorAuth(error) {
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
    return 'Todavía no se confirma este correo. Revisa la bandeja de entrada (y spam) y confirma antes de entrar.';
  }
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  return error?.message || 'Ocurrió un error. Intenta de nuevo.';
}

// ============================================================
// AUTENTICACIÓN
// ============================================================
async function mostrarSegunSesion() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    await intentarMostrarPanel();
  } else {
    mostrarLogin();
  }
}

function mostrarLogin() {
  document.getElementById('loginView').classList.remove('hidden');
  document.getElementById('ordersView').classList.add('hidden');
}

async function intentarMostrarPanel() {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  const { data: perfil } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (perfil?.role !== 'admin') {
    await supabaseClient.auth.signOut();
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = 'Esta cuenta no tiene permisos de admin.';
    errorEl.classList.remove('hidden');
    mostrarLogin();
    return;
  }
  mostrarPanel();
}

function mostrarPanel() {
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('ordersView').classList.remove('hidden');
  cargarPedidos();
  cargarUsuarios();
  suscribirseATiempoReal();
  suscribirseAUsuarios();
  initProfileMenu({ linkCatalogo: true, onLogout: cerrarSesion });
}

async function iniciarSesion() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  if (!email || !password) {
    errorEl.textContent = 'Completa correo y contraseña.';
    errorEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Entrando...';
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  btn.textContent = 'Entrar';

  if (error) {
    errorEl.textContent = traducirErrorAuth(error);
    errorEl.classList.remove('hidden');
    return;
  }
  errorEl.classList.add('hidden');
  await intentarMostrarPanel();
}

async function cerrarSesion() {
  await supabaseClient.auth.signOut();
  mostrarLogin();
}

// ============================================================
// CARGA Y RENDER DE PEDIDOS
// ============================================================
async function cargarPedidos() {
  const { data, error } = await supabaseClient
    .from('pedidos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando pedidos:', error);
    return;
  }
  pedidos = data || [];
  renderPedidos();
}

function renderPedidos() {
  const wrap = document.getElementById('ordersWrap');
  const texto = busquedaPedidos.trim().toLowerCase();

  const filtrados = pedidos.filter((p) => {
    const coincideEstado = filtroEstado === 'todos' || p.estado === filtroEstado;
    const coincideTexto =
      !texto ||
      (p.cliente_nombre || '').toLowerCase().includes(texto) ||
      (p.cliente_telefono || '').toLowerCase().includes(texto) ||
      (p.cliente_email || '').toLowerCase().includes(texto) ||
      (p.tienda_nombre || '').toLowerCase().includes(texto);
    const coincideEstadoUS = !filtroEstadoUSPedidos || p.cliente_estado === filtroEstadoUSPedidos;
    const coincideZip = !filtroZipPedidos || (p.cliente_zip || '').includes(filtroZipPedidos);
    return coincideEstado && coincideTexto && coincideEstadoUS && coincideZip;
  });

  if (filtrados.length === 0) {
    wrap.innerHTML = '<p class="empty-state">No hay pedidos con estos filtros.</p>';
    return;
  }

  wrap.innerHTML = filtrados.map((pedido) => tarjetaPedido(pedido)).join('');

  wrap.querySelectorAll('[data-marcar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [id, estado] = [btn.dataset.id, btn.dataset.marcar];
      actualizarEstado(id, estado);
    });
  });
  wrap.querySelectorAll('[data-expandir]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.expandir;
      if (pedidosExpandido.has(id)) pedidosExpandido.delete(id);
      else pedidosExpandido.add(id);
      renderPedidos();
    });
  });
}

function tarjetaPedido(pedido) {
  const expandido = pedido.estado !== 'completado' || pedidosExpandido.has(pedido.id);

  if (!expandido) {
    const fechaCorta = new Date(pedido.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' });
    return `
      <div class="order-row-compact" data-expandir="${pedido.id}">
        <span class="compact-nombre">${pedido.tienda_nombre || pedido.cliente_nombre}</span>
        <span class="compact-meta">${fechaCorta}</span>
        <span class="order-badge completado">completado</span>
        <span class="compact-total">$${Number(pedido.total).toFixed(2)}</span>
      </div>
    `;
  }

  const fecha = new Date(pedido.created_at).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const items = (pedido.items || [])
    .map((i) => `<div><span>${i.nombre} x${i.cantidad}</span><span>$${(i.precio * i.cantidad).toFixed(2)}</span></div>`)
    .join('');

  const acciones = [];
  if (pedido.estado === 'nuevo') acciones.push(`<button data-id="${pedido.id}" data-marcar="visto">Marcar visto</button>`);
  if (pedido.estado !== 'completado') acciones.push(`<button data-id="${pedido.id}" data-marcar="completado">Marcar completado</button>`);
  if (pedido.estado === 'completado') acciones.push(`<button data-expandir="${pedido.id}">Minimizar</button>`);

  return `
    <div class="order-card ${pedido.estado === 'nuevo' ? 'is-nuevo' : ''}">
      <div class="order-head">
        <div>
          <div class="order-cliente">${pedido.cliente_nombre}${pedido.tienda_nombre ? ' — ' + pedido.tienda_nombre : ''}</div>
          <div class="order-meta">${pedido.cliente_telefono}${pedido.cliente_email ? ' · ' + pedido.cliente_email : ''}</div>
          <div class="order-meta">${pedido.cliente_direccion || ''}${pedido.cliente_ciudad ? ', ' + pedido.cliente_ciudad : ''}${pedido.cliente_estado ? ', ' + pedido.cliente_estado : ''} ${pedido.cliente_zip || ''}</div>
          <div class="order-meta">${fecha}</div>
          <span class="order-badge ${pedido.estado}">${pedido.estado}</span>
        </div>
        <div class="order-total">$${Number(pedido.total).toFixed(2)}</div>
      </div>
      ${pedido.cliente_notas ? `<div class="order-meta">Notas: ${pedido.cliente_notas}</div>` : ''}
      <div class="order-items">${items}</div>
      <div class="order-actions">${acciones.join('')}</div>
    </div>
  `;
}

async function actualizarEstado(id, estado) {
  const { error } = await supabaseClient.from('pedidos').update({ estado }).eq('id', id);
  if (error) {
    console.error('Error actualizando pedido:', error);
    return;
  }
  const pedido = pedidos.find((p) => p.id === id);
  if (pedido) pedido.estado = estado;
  renderPedidos();
}

// ============================================================
// TIEMPO REAL: notificación de pedido nuevo
// ============================================================
function suscribirseATiempoReal() {
  supabaseClient
    .channel('pedidos-nuevos')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pedidos' },
      (payload) => {
        pedidos.unshift(payload.new);
        renderPedidos();
        notificarPedidoNuevo();
      }
    )
    .subscribe();
}

function notificarPedidoNuevo() {
  // Banner visual
  const banner = document.getElementById('newOrderBanner');
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 4000);

  // Sonido (beep simple, sin archivo externo)
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // si el navegador bloquea audio sin interacción, no pasa nada grave
  }

  // Notificación del sistema (si el navegador lo permite)
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification('Nuevo pedido — Catálogo Bimbo');
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }

  // Parpadeo del título de la pestaña
  pedidosNuevosSinVer++;
  document.title = `🔴 (${pedidosNuevosSinVer}) ${TITULO_BASE}`;
}

// ============================================================
// USUARIOS (clientes registrados + admins)
// ============================================================
let usuarios = [];
let filtroUsuarios = 'todos';
let busquedaUsuarios = '';
let filtroEstadoUSUsuarios = '';
let filtroZipUsuarios = '';
let usuariosExpandido = new Set();

// Orden de prioridad para mostrar pendientes primero (no alfabético).
const ORDEN_ESTADO_CUENTA = { pendiente: 0, rechazado: 1, aprobado: 2 };

async function cargarUsuarios() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando usuarios:', error);
    return;
  }
  usuarios = (data || []).sort(
    (a, b) => (ORDEN_ESTADO_CUENTA[a.estado_cuenta] ?? 9) - (ORDEN_ESTADO_CUENTA[b.estado_cuenta] ?? 9)
  );
  renderUsuarios();
  actualizarBadgePendientes();
}

function actualizarBadgePendientes() {
  const pendientes = usuarios.filter((u) => u.estado_cuenta === 'pendiente').length;
  const badge = document.getElementById('pendientesBadge');
  badge.textContent = pendientes;
  badge.classList.toggle('hidden', pendientes === 0);
}

function renderUsuarios() {
  const wrap = document.getElementById('usuariosWrap');
  const texto = busquedaUsuarios.trim().toLowerCase();

  const filtrados = usuarios.filter((u) => {
    const coincideFiltro = filtroUsuarios === 'todos' || u.estado_cuenta === filtroUsuarios;
    const coincideTexto =
      !texto ||
      (u.nombre || '').toLowerCase().includes(texto) ||
      (u.telefono || '').toLowerCase().includes(texto) ||
      (u.email || '').toLowerCase().includes(texto) ||
      (u.tienda_nombre || '').toLowerCase().includes(texto);
    const coincideEstadoUS = !filtroEstadoUSUsuarios || u.estado === filtroEstadoUSUsuarios;
    const coincideZip = !filtroZipUsuarios || (u.zip || '').includes(filtroZipUsuarios);
    return coincideFiltro && coincideTexto && coincideEstadoUS && coincideZip;
  });

  if (filtrados.length === 0) {
    wrap.innerHTML = '<p class="empty-state">No hay usuarios con estos filtros.</p>';
    return;
  }

  wrap.innerHTML = filtrados.map((u) => tarjetaUsuario(u)).join('');

  wrap.querySelectorAll('[data-aprobar]').forEach((btn) => {
    btn.addEventListener('click', () => cambiarEstadoCuenta(btn.dataset.aprobar, 'aprobado'));
  });
  wrap.querySelectorAll('[data-rechazar]').forEach((btn) => {
    btn.addEventListener('click', () => cambiarEstadoCuenta(btn.dataset.rechazar, 'rechazado'));
  });
  wrap.querySelectorAll('[data-hacer-admin]').forEach((btn) => {
    btn.addEventListener('click', () => hacerAdmin(btn.dataset.hacerAdmin));
  });
  wrap.querySelectorAll('[data-expandir-usuario]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.expandirUsuario;
      if (usuariosExpandido.has(id)) usuariosExpandido.delete(id);
      else usuariosExpandido.add(id);
      renderUsuarios();
    });
  });
}

function tarjetaUsuario(u) {
  const esCompactable = u.role !== 'admin' && u.estado_cuenta === 'aprobado';
  const expandido = !esCompactable || usuariosExpandido.has(u.id);

  if (!expandido) {
    return `
      <div class="order-row-compact" data-expandir-usuario="${u.id}">
        <span class="compact-nombre">${u.tienda_nombre || u.nombre || u.email}</span>
        <span class="compact-meta">${u.telefono || ''}</span>
        <span class="compact-meta">${u.estado || ''} ${u.zip || ''}</span>
        <span class="order-badge aprobado">aprobado</span>
      </div>
    `;
  }

  const fecha = new Date(u.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' });
  const acciones = [];

  if (u.role !== 'admin') {
    if (u.estado_cuenta === 'pendiente') {
      acciones.push(`<button data-aprobar="${u.id}">Aprobar</button>`);
      acciones.push(`<button data-rechazar="${u.id}">Rechazar</button>`);
    }
    if (u.estado_cuenta === 'rechazado') {
      acciones.push(`<button data-aprobar="${u.id}">Aprobar</button>`);
    }
    if (u.estado_cuenta === 'aprobado') {
      acciones.push(`<button data-rechazar="${u.id}">Rechazar</button>`);
      acciones.push(`<button data-hacer-admin="${u.id}">Hacer admin</button>`);
      acciones.push(`<button data-expandir-usuario="${u.id}">Minimizar</button>`);
    }
  }

  return `
    <div class="order-card ${u.estado_cuenta === 'pendiente' ? 'is-nuevo' : ''}">
      <div class="order-head">
        <div>
          <div class="order-cliente">${u.tienda_nombre || u.nombre || u.email}</div>
          <div class="order-meta">${u.nombre || ''}${u.telefono ? ' · ' + u.telefono : ''}</div>
          <div class="order-meta">${u.email || ''}</div>
          <div class="order-meta">${u.direccion || ''}${u.ciudad ? ', ' + u.ciudad : ''}${u.estado ? ', ' + u.estado : ''} ${u.zip || ''}</div>
          <div class="order-meta">Registrado: ${fecha}</div>
          <span class="order-badge ${u.role === 'admin' ? 'admin' : u.estado_cuenta}">${u.role === 'admin' ? 'admin' : u.estado_cuenta}</span>
        </div>
      </div>
      <div class="order-actions">${acciones.join('')}</div>
    </div>
  `;
}

async function cambiarEstadoCuenta(id, estado_cuenta) {
  const { error } = await supabaseClient.from('profiles').update({ estado_cuenta }).eq('id', id);
  if (error) {
    console.error('Error actualizando usuario:', error);
    return;
  }
  const u = usuarios.find((x) => x.id === id);
  if (u) u.estado_cuenta = estado_cuenta;
  renderUsuarios();
  actualizarBadgePendientes();
}

async function hacerAdmin(id) {
  if (!confirm('¿Seguro que quieres dar permisos de admin a este usuario?')) return;
  const { error } = await supabaseClient.from('profiles').update({ role: 'admin' }).eq('id', id);
  if (error) {
    console.error('Error promoviendo a admin:', error);
    return;
  }
  const u = usuarios.find((x) => x.id === id);
  if (u) u.role = 'admin';
  renderUsuarios();
}

function suscribirseAUsuarios() {
  supabaseClient
    .channel('perfiles-cambios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
      cargarUsuarios();
    })
    .subscribe();
}

function cambiarPanelAdmin(panel) {
  document.querySelectorAll('.admin-tabs .auth-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.panel === panel));
  document.getElementById('panelPedidos').classList.toggle('hidden', panel !== 'pedidos');
  document.getElementById('panelUsuarios').classList.toggle('hidden', panel !== 'usuarios');
}

// ============================================================
// INICIALIZACIÓN
// ============================================================
function poblarSelectsEstadoUS() {
  const opciones = ESTADOS_SERVICIO.map((e) => `<option value="${e.valor}">${e.nombre}</option>`).join('');
  document.getElementById('pedidosFiltroEstadoUS').insertAdjacentHTML('beforeend', opciones);
  document.getElementById('usuariosFiltroEstadoUS').insertAdjacentHTML('beforeend', opciones);
}

document.addEventListener('DOMContentLoaded', () => {
  mostrarSegunSesion();
  poblarSelectsEstadoUS();

  document.getElementById('loginBtn').addEventListener('click', iniciarSesion);
  document.getElementById('loginPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') iniciarSesion();
  });
  document.getElementById('ordersFilter').querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      filtroEstado = btn.dataset.estado;
      document.querySelectorAll('#ordersFilter .chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderPedidos();
    });
  });

  document.querySelectorAll('.admin-tabs .auth-tab').forEach((btn) => {
    btn.addEventListener('click', () => cambiarPanelAdmin(btn.dataset.panel));
  });

  document.getElementById('usuariosFilter').querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      filtroUsuarios = btn.dataset.filtro;
      document.querySelectorAll('#usuariosFilter .chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderUsuarios();
    });
  });

  document.getElementById('pedidosBusqueda').addEventListener('input', (e) => {
    busquedaPedidos = e.target.value;
    renderPedidos();
  });
  document.getElementById('pedidosFiltroEstadoUS').addEventListener('change', (e) => {
    filtroEstadoUSPedidos = e.target.value;
    renderPedidos();
  });
  document.getElementById('pedidosFiltroZip').addEventListener('input', (e) => {
    filtroZipPedidos = e.target.value;
    renderPedidos();
  });

  document.getElementById('usuariosBusqueda').addEventListener('input', (e) => {
    busquedaUsuarios = e.target.value;
    renderUsuarios();
  });
  document.getElementById('usuariosFiltroEstadoUS').addEventListener('change', (e) => {
    filtroEstadoUSUsuarios = e.target.value;
    renderUsuarios();
  });
  document.getElementById('usuariosFiltroZip').addEventListener('input', (e) => {
    filtroZipUsuarios = e.target.value;
    renderUsuarios();
  });

  window.addEventListener('focus', () => {
    pedidosNuevosSinVer = 0;
    document.title = TITULO_BASE;
  });
});
