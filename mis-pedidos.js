// Historial de pedidos del cliente logueado — solo lectura.
// RLS ya filtra: cada quien ve solo lo suyo (o todo, si es admin).

let misPedidos = [];

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
}

function tarjetaMiPedido(pedido) {
  const fecha = new Date(pedido.created_at).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const items = (pedido.items || [])
    .map((i) => `<div><span>${i.nombre} x${i.cantidad}</span><span>$${(i.precio * i.cantidad).toFixed(2)}</span></div>`)
    .join('');

  return `
    <div class="order-card ${pedido.estado === 'nuevo' ? 'is-nuevo' : ''}">
      <div class="order-head">
        <div>
          <div class="order-cliente">${pedido.tienda_nombre || pedido.cliente_nombre}</div>
          <div class="order-meta">${pedido.cliente_direccion || ''}${pedido.cliente_ciudad ? ', ' + pedido.cliente_ciudad : ''}${pedido.cliente_estado ? ', ' + pedido.cliente_estado : ''} ${pedido.cliente_zip || ''}</div>
          <div class="order-meta">${fecha}</div>
          <span class="order-badge ${pedido.estado}">${pedido.estado}</span>
        </div>
        <div class="order-total">$${Number(pedido.total).toFixed(2)}</div>
      </div>
      <div class="order-items">${items}</div>
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
