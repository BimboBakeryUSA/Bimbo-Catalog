// Historial de pedidos del cliente logueado — solo lectura.
// RLS ya filtra: cada quien ve solo lo suyo (o todo, si es admin).

let misPedidos = [];
let misPedidosExpandido = new Set();

async function iniciar() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) {
    window.location.href = 'index.html';
    return;
  }
  initProfileMenu({
    linkCatalogo: true,
    onLogout: async () => {
      await supabaseClient.auth.signOut();
      window.location.href = 'index.html';
    },
  });
  await cargarMisPedidos();
  suscribirseATiempoReal();
}

async function cargarMisPedidos() {
  const { data, error } = await supabaseClient
    .from('pedidos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando pedidos:', error);
    return;
  }
  misPedidos = data || [];
  renderMisPedidos();
}

function renderMisPedidos() {
  const wrap = document.getElementById('ordersWrap');

  if (misPedidos.length === 0) {
    wrap.innerHTML = '<p class="empty-state">Todavía no has hecho ningún pedido.</p>';
    return;
  }

  wrap.innerHTML = misPedidos.map((pedido) => tarjetaMiPedido(pedido)).join('');

  wrap.querySelectorAll('[data-expandir]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.expandir;
      if (misPedidosExpandido.has(id)) misPedidosExpandido.delete(id);
      else misPedidosExpandido.add(id);
      renderMisPedidos();
    });
  });
}

function tarjetaMiPedido(pedido) {
  const info = ESTADO_PEDIDO_INFO[pedido.estado] || { label: pedido.estado, icon: '' };
  const expandido = misPedidosExpandido.has(pedido.id);

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

  return `
    <div class="order-card ${pedido.estado === 'nuevo' ? 'is-nuevo' : ''}">
      <div class="order-head">
        <div>
          <div class="order-cliente">${pedido.tienda_nombre || pedido.cliente_nombre}</div>
          <div class="order-meta">${pedido.cliente_direccion || ''}${pedido.cliente_ciudad ? ', ' + pedido.cliente_ciudad : ''}${pedido.cliente_estado ? ', ' + pedido.cliente_estado : ''} ${pedido.cliente_zip || ''}</div>
          <div class="order-meta">${fecha}</div>
          <span class="order-badge ${pedido.estado}">${info.icon} ${info.label}</span>
        </div>
        <div class="order-total">$${Number(pedido.total).toFixed(2)}</div>
      </div>
      <div class="order-items">${items}</div>
      <div class="order-actions"><button data-expandir="${pedido.id}">Minimizar</button></div>
    </div>
  `;
}

function suscribirseATiempoReal() {
  supabaseClient
    .channel('mis-pedidos-cambios')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
      cargarMisPedidos();
    })
    .subscribe();
}

document.addEventListener('DOMContentLoaded', iniciar);
