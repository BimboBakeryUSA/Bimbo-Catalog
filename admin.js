// Panel de pedidos — requiere login real (Supabase Auth).
// CONFIG y supabaseClient vienen de config.js

let pedidos = [];
let filtroEstado = 'todos';
let pedidosNuevosSinVer = 0;
const TITULO_BASE = 'Panel de pedidos — Catálogo Bimbo';

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
    errorEl.textContent = 'Correo o contraseña incorrectos.';
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
  const filtrados =
    filtroEstado === 'todos' ? pedidos : pedidos.filter((p) => p.estado === filtroEstado);

  if (filtrados.length === 0) {
    wrap.innerHTML = '<p class="empty-state">No hay pedidos por aquí todavía.</p>';
    return;
  }

  wrap.innerHTML = filtrados.map((pedido) => tarjetaPedido(pedido)).join('');

  wrap.querySelectorAll('[data-marcar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [id, estado] = [btn.dataset.id, btn.dataset.marcar];
      actualizarEstado(id, estado);
    });
  });
}

function tarjetaPedido(pedido) {
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

  return `
    <div class="order-card ${pedido.estado === 'nuevo' ? 'is-nuevo' : ''}">
      <div class="order-head">
        <div>
          <div class="order-cliente">${pedido.cliente_nombre}${pedido.tienda_nombre ? ' — ' + pedido.tienda_nombre : ''}</div>
          <div class="order-meta">${pedido.cliente_telefono}</div>
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

async function cargarUsuarios() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .order('estado_cuenta', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando usuarios:', error);
    return;
  }
  usuarios = data || [];
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
  const filtrados =
    filtroUsuarios === 'todos' ? usuarios : usuarios.filter((u) => u.estado_cuenta === filtroUsuarios);

  if (filtrados.length === 0) {
    wrap.innerHTML = '<p class="empty-state">No hay usuarios en esta vista.</p>';
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
}

function tarjetaUsuario(u) {
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
document.addEventListener('DOMContentLoaded', () => {
  mostrarSegunSesion();

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

  window.addEventListener('focus', () => {
    pedidosNuevosSinVer = 0;
    document.title = TITULO_BASE;
  });
});
