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
    mostrarPanel();
  } else {
    mostrarLogin();
  }
}

function mostrarLogin() {
  document.getElementById('loginView').classList.remove('hidden');
  document.getElementById('ordersView').classList.add('hidden');
}

function mostrarPanel() {
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('ordersView').classList.remove('hidden');
  cargarPedidos();
  suscribirseATiempoReal();
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
  mostrarPanel();
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

  window.addEventListener('focus', () => {
    pedidosNuevosSinVer = 0;
    document.title = TITULO_BASE;
  });
});
