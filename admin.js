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
  cargarProductosAdmin();
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
  const expandido = pedidosExpandido.has(pedido.id);
  const info = ESTADO_PEDIDO_INFO[pedido.estado] || { label: pedido.estado, icon: '' };

  if (!expandido) {
    const fechaCorta = new Date(pedido.created_at).toLocaleDateString('es-MX', { dateStyle: 'medium' });
    return `
      <div class="order-row-compact ${pedido.estado === 'nuevo' ? 'is-nuevo' : ''}" data-expandir="${pedido.id}">
        <span class="compact-nombre">${pedido.tienda_nombre || pedido.cliente_nombre}</span>
        <span class="compact-meta">${fechaCorta}</span>
        <span class="order-badge ${pedido.estado}">${info.icon} ${info.label}</span>
        <span class="compact-total">$${Number(pedido.total).toFixed(2)}</span>
      </div>
    `;
  }

  const fecha = new Date(pedido.created_at).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const items = (pedido.items || [])
    .map(
      (i) =>
        `<div><span>${i.nombre} x${i.cantidad} ${i.unidad === 'caja' ? 'caja(s)' : i.unidad === 'pieza' ? 'pieza(s)' : ''}</span><span>$${(i.precio * i.cantidad).toFixed(2)}</span></div>`
    )
    .join('');

  const acciones = [];
  if (pedido.estado === 'nuevo') acciones.push(`<button data-id="${pedido.id}" data-marcar="visto">Marcar visto</button>`);
  if (pedido.estado !== 'completado') acciones.push(`<button data-id="${pedido.id}" data-marcar="completado">Marcar completado</button>`);
  acciones.push(`<button data-expandir="${pedido.id}">Minimizar</button>`);

  return `
    <div class="order-card ${pedido.estado === 'nuevo' ? 'is-nuevo' : ''}">
      <div class="order-head">
        <div>
          <div class="order-cliente">${pedido.cliente_nombre}${pedido.tienda_nombre ? ' — ' + pedido.tienda_nombre : ''}</div>
          <div class="order-meta">${pedido.cliente_telefono}${pedido.cliente_email ? ' · ' + pedido.cliente_email : ''}</div>
          <div class="order-meta">${pedido.cliente_direccion || ''}${pedido.cliente_ciudad ? ', ' + pedido.cliente_ciudad : ''}${pedido.cliente_estado ? ', ' + pedido.cliente_estado : ''} ${pedido.cliente_zip || ''}</div>
          <div class="order-meta">${fecha}</div>
          <span class="order-badge ${pedido.estado}">${info.icon} ${info.label}</span>
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
  wrap.querySelectorAll('[data-campo-cadena-usuario]').forEach((sel) => {
    sel.addEventListener('click', (e) => e.stopPropagation());
    sel.addEventListener('change', (e) => {
      e.stopPropagation();
      cambiarCadenaUsuario(sel.dataset.campoCadenaUsuario, sel.value);
    });
  });
}

async function cambiarCadenaUsuario(id, cadena) {
  const { error } = await supabaseClient.from('profiles').update({ cadena: cadena || null }).eq('id', id);
  if (error) {
    console.error('Error actualizando cadena:', error);
    return;
  }
  const u = usuarios.find((x) => x.id === id);
  if (u) u.cadena = cadena || null;
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

  const cadenaHtml =
    u.role !== 'admin'
      ? `
      <div class="order-meta" style="margin-top:6px;">
        Cadena:
        <select class="form-field" style="display:inline-block; width:auto; margin-left:4px;" data-campo-cadena-usuario="${u.id}">
          <option value="">(sin asignar — ve todo)</option>
          ${(typeof CADENAS !== 'undefined' ? CADENAS : [])
            .map((c) => `<option value="${c}" ${u.cadena === c ? 'selected' : ''}>${c}</option>`)
            .join('')}
        </select>
      </div>`
      : '';

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
          ${cadenaHtml}
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
  document.getElementById('panelProductos').classList.toggle('hidden', panel !== 'productos');
}

// ============================================================
// PRODUCTOS (editar precio / unidades) — vía Edge Function segura
// ============================================================
// La tabla `products` vive en OTRO proyecto de Supabase (bimbo-inventory-pro,
// compartido con la app de escaneo) y su RLS solo permite lectura pública.
// Para poder editar precio/unidades desde aquí sin exponer una service role
// key en el navegador, se llama a la función `admin-update-price` desplegada
// en ese proyecto: ella valida que el usuario sea admin en ESTE proyecto
// (catalogo-bimbo) y solo entonces hace el UPDATE con su propia service role.
let productosAdmin = [];
let busquedaProductosAdmin = '';
let filtroActivoProductos = 'todos';

async function cargarProductosAdmin() {
  if (!productsSupabaseClient) {
    console.error('productsSupabaseClient no está configurado (revisa config.js)');
    return;
  }
  const { data, error } = await productsSupabaseClient
    .from('products')
    .select('upc, producto, precio, unidades_caja, unidades_pallet, marca, activo, foto, cadenas_permitidas, es_nuevo')
    .order('producto');
  if (error) {
    console.error('Error cargando productos:', error);
    return;
  }
  productosAdmin = data || [];
  renderProductosAdmin();
}

function renderProductosAdmin() {
  const wrap = document.getElementById('productosWrap');
  const texto = busquedaProductosAdmin.trim().toLowerCase();

  const filtrados = productosAdmin.filter((p) => {
    const coincideTexto = !texto || (p.producto || '').toLowerCase().includes(texto) || (p.upc || '').includes(texto);
    const coincideActivo =
      filtroActivoProductos === 'todos' ||
      (filtroActivoProductos === 'activo' && p.activo !== false) ||
      (filtroActivoProductos === 'inactivo' && p.activo === false);
    return coincideTexto && coincideActivo;
  });

  if (filtrados.length === 0) {
    wrap.innerHTML = '<p class="empty-state">No hay productos con esta búsqueda.</p>';
    return;
  }

  wrap.innerHTML = filtrados.map((p) => tarjetaProductoAdmin(p)).join('');

  wrap.querySelectorAll('[data-guardar-producto]').forEach((btn) => {
    btn.addEventListener('click', () => guardarProductoAdminClick(btn.dataset.guardarProducto));
  });
  wrap.querySelectorAll('[data-ver-foto]').forEach((el) => {
    el.addEventListener('click', () => abrirImagenGrande(el.dataset.verFoto, el.dataset.verFotoNombre || ''));
  });
}

function tarjetaProductoAdmin(p) {
  const inactivo = p.activo === false;
  const esNuevo = p.es_nuevo === true;
  const fotoHtml = p.foto
    ? `<div class="prod-admin-photo" data-ver-foto="${p.foto}" data-ver-foto-nombre="${(p.producto || '').replace(/"/g, '&quot;')}"><img src="${p.foto}" alt=""></div>`
    : `<div class="prod-admin-photo"><span class="icon">🍞</span></div>`;

  const cadenasActuales = Array.isArray(p.cadenas_permitidas) ? p.cadenas_permitidas : [];
  const cadenasHtml = (typeof CADENAS !== 'undefined' ? CADENAS : [])
    .map(
      (c) => `
      <label class="cadena-check">
        <input type="checkbox" data-campo-cadena="${p.upc}" value="${c}" ${cadenasActuales.includes(c) ? 'checked' : ''} />
        ${c}
      </label>`
    )
    .join('');

  return `
    <div class="order-card prod-admin-card ${inactivo ? 'is-inactivo' : ''}">
      ${fotoHtml}
      <div class="prod-admin-body">
        <div class="order-cliente">${p.producto || '(sin nombre)'}</div>
        <div class="order-meta">UPC: ${p.upc}${p.marca ? ' · ' + p.marca : ''}</div>
        <div class="prod-admin-fields">
          <label>Precio<br />
            <input type="number" step="0.01" min="0" class="form-field" data-campo-precio="${p.upc}" value="${p.precio ?? ''}" />
          </label>
          <label>Pzas/caja<br />
            <input type="number" step="1" min="0" class="form-field" data-campo-caja="${p.upc}" value="${p.unidades_caja ?? ''}" />
          </label>
          <label>Cajas/tarima<br />
            <input type="number" step="1" min="0" class="form-field" data-campo-pallet="${p.upc}" value="${p.unidades_pallet ?? ''}" />
          </label>
          <label class="toggle-activo">
            <input type="checkbox" data-campo-activo="${p.upc}" ${inactivo ? '' : 'checked'} />
            <span class="switch"></span>
            <span data-label-activo="${p.upc}">${inactivo ? 'Pausado' : 'Activo'}</span>
          </label>
          <label class="toggle-activo">
            <input type="checkbox" data-campo-nuevo="${p.upc}" ${esNuevo ? 'checked' : ''} />
            <span class="switch"></span>
            <span data-label-nuevo="${p.upc}">${esNuevo ? 'Nuevo ✓' : 'Marcar como nuevo'}</span>
          </label>
          <button data-guardar-producto="${p.upc}">Guardar</button>
        </div>
        <div class="prod-admin-cadenas">
          <span class="hint-text" style="margin:0 8px 0 0;">Cadenas autorizadas (Independientes por defecto):</span>
          ${cadenasHtml}
        </div>
        <p class="hint-text" data-msg-producto="${p.upc}" style="margin-top:6px; text-align:left;"></p>
      </div>
    </div>
  `;
}

async function guardarProductoAdminClick(upc) {
  const btn = document.querySelector(`[data-guardar-producto="${upc}"]`);
  const inputPrecio = document.querySelector(`[data-campo-precio="${upc}"]`);
  const inputCaja = document.querySelector(`[data-campo-caja="${upc}"]`);
  const inputPallet = document.querySelector(`[data-campo-pallet="${upc}"]`);
  const inputActivo = document.querySelector(`[data-campo-activo="${upc}"]`);
  const inputNuevo = document.querySelector(`[data-campo-nuevo="${upc}"]`);
  const inputsCadena = document.querySelectorAll(`[data-campo-cadena="${upc}"]`);
  const msgEl = document.querySelector(`[data-msg-producto="${upc}"]`);

  const p = productosAdmin.find((x) => x.upc === upc);
  const cambios = {};
  if (inputPrecio.value !== '') cambios.precio = Number(inputPrecio.value);
  if (inputCaja.value !== '') cambios.unidades_caja = Number(inputCaja.value);
  if (inputPallet.value !== '') cambios.unidades_pallet = Number(inputPallet.value);
  const activoActual = p ? p.activo !== false : true;
  if (inputActivo.checked !== activoActual) cambios.activo = inputActivo.checked;
  const nuevoActual = p ? p.es_nuevo === true : false;
  if (inputNuevo.checked !== nuevoActual) cambios.es_nuevo = inputNuevo.checked;

  const cadenasSeleccionadas = Array.from(inputsCadena)
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
  const cadenasActuales = p && Array.isArray(p.cadenas_permitidas) ? p.cadenas_permitidas : [];
  const cadenasCambiaron =
    cadenasSeleccionadas.length !== cadenasActuales.length ||
    cadenasSeleccionadas.some((c) => !cadenasActuales.includes(c));
  if (cadenasCambiaron) cambios.cadenas_permitidas = cadenasSeleccionadas;

  if (Object.keys(cambios).length === 0) {
    msgEl.textContent = 'No hay cambios que guardar.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Guardando...';
  msgEl.textContent = '';
  msgEl.style.color = '';

  const resultado = await guardarProductoAdmin(upc, cambios);

  btn.disabled = false;
  btn.textContent = 'Guardar';

  if (!resultado.ok) {
    msgEl.textContent = '✕ ' + (resultado.mensaje || 'Error al guardar.');
    msgEl.style.color = '#c0392b';
    return;
  }

  msgEl.textContent = '✓ Guardado';
  msgEl.style.color = '#2e7d32';
  if (p) Object.assign(p, cambios);
  const card = btn.closest('.prod-admin-card');
  if (card) card.classList.toggle('is-inactivo', inputActivo.checked === false);
  const labelEl = document.querySelector(`[data-label-activo="${upc}"]`);
  if (labelEl) labelEl.textContent = inputActivo.checked ? 'Activo' : 'Pausado';
  const labelNuevoEl = document.querySelector(`[data-label-nuevo="${upc}"]`);
  if (labelNuevoEl) labelNuevoEl.textContent = inputNuevo.checked ? 'Nuevo ✓' : 'Marcar como nuevo';
  setTimeout(() => {
    if (msgEl) msgEl.textContent = '';
  }, 2500);
}

async function guardarProductoAdmin(upc, cambios) {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, mensaje: 'Sesión expirada, vuelve a iniciar sesión.' };

  try {
    const { data, error } = await productsSupabaseClient.functions.invoke('admin-update-price', {
      body: { upc, ...cambios },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) {
      let mensaje = error.message || 'Error actualizando producto';
      try {
        const ctx = await error.context?.json?.();
        if (ctx?.error) mensaje = ctx.error;
      } catch {
        // si no se puede leer el detalle, se queda con el mensaje genérico
      }
      return { ok: false, mensaje };
    }
    if (data?.error) return { ok: false, mensaje: data.error };
    return { ok: true, product: data.product };
  } catch (err) {
    return { ok: false, mensaje: String(err) };
  }
}

// ============================================================
// MODAL: imagen ampliada
// ============================================================
function abrirModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function cerrarModal(id) {
  document.getElementById(id).classList.add('hidden');
}
function abrirImagenGrande(url, nombre) {
  const img = document.getElementById('imageZoomImg');
  img.src = url;
  img.alt = nombre || '';
  abrirModal('imageZoomModal');
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

  document.getElementById('productosBusqueda').addEventListener('input', (e) => {
    busquedaProductosAdmin = e.target.value;
    renderProductosAdmin();
  });
  document.getElementById('productosFiltroActivo').addEventListener('change', (e) => {
    filtroActivoProductos = e.target.value;
    renderProductosAdmin();
  });

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => cerrarModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  window.addEventListener('focus', () => {
    pedidosNuevosSinVer = 0;
    document.title = TITULO_BASE;
  });
});
