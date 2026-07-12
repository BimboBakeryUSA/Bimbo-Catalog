// ============================================================
// VERSIÓN — súbela cada vez que hagas un cambio, así al abrir la
// página confirmas de inmediato que sí cargó la versión nueva.
// ============================================================
const VERSION = 'v3 — pedidos guardados + notificación admin';

// CONFIG y supabaseClient vienen de config.js (compartido con admin.js)

// ============================================================
// DATOS DE PRODUCTOS (de ejemplo — luego se puede conectar a Supabase)
// ============================================================
const PRODUCTOS = [
  { slug: 'pan-blanco-grande', nombre: 'Pan Blanco Grande', categoria: 'Pan de caja', precio: 42.5, descripcion: 'El clásico pan blanco Bimbo, suave y esponjoso, ideal para toda la familia.', color: '#FBEFD9' },
  { slug: 'pan-integral', nombre: 'Pan Integral', categoria: 'Pan de caja', precio: 46.0, descripcion: 'Pan 100% integral, fuente de fibra, para un estilo de vida saludable.', color: '#F0E4CB' },
  { slug: 'bimbollos', nombre: 'Bimbollos', categoria: 'Pan dulce', precio: 38.0, descripcion: 'Bollos suaves rellenos de crema, perfectos para acompañar tu café.', color: '#FCE9DE' },
  { slug: 'panque-bimbo', nombre: 'Panqué Bimbo', categoria: 'Pan dulce', precio: 34.5, descripcion: 'Panqué esponjoso, ideal para el desayuno o la merienda.', color: '#FBF0D3' },
  { slug: 'donas-bimbo', nombre: 'Donas Bimbo', categoria: 'Pan dulce', precio: 36.0, descripcion: 'Donas glaseadas, suaves y deliciosas, un clásico de siempre.', color: '#FBE4E9' },
  { slug: 'tostado-bimbo', nombre: 'Pan Tostado', categoria: 'Pan de caja', precio: 32.0, descripcion: 'Pan tostado crujiente, perfecto para tus tostadas de la mañana.', color: '#F4E6CE' },
  { slug: 'tortillas-de-harina', nombre: 'Tortillas de Harina', categoria: 'Tortillas', precio: 28.5, descripcion: 'Tortillas de harina suaves, listas para tacos, quesadillas y más.', color: '#F8EFDA' },
  { slug: 'barritas-de-fresa', nombre: 'Barritas de Fresa', categoria: 'Repostería', precio: 30.0, descripcion: 'Barritas rellenas de mermelada de fresa con un toque crujiente.', color: '#FBDFE2' },
];

// Ícono representativo por categoría (mientras no hay fotos reales).
const ICONOS_CATEGORIA = {
  'Pan de caja': '🍞',
  'Pan dulce': '🥐',
  'Tortillas': '🫓',
  'Repostería': '🍰',
};

const STORAGE_KEY = 'catalogo-bimbo-carrito';

// ============================================================
// ESTADO
// ============================================================
let carrito = cargarCarrito();
let categoriaActiva = 'Todas';
let textoBusqueda = '';

function cargarCarrito() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}
function guardarCarrito(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function agregarAlCarrito(slug, cantidad = 1) {
  const producto = PRODUCTOS.find((p) => p.slug === slug);
  if (!producto) return;
  const existente = carrito.find((i) => i.slug === slug);
  if (existente) {
    existente.cantidad += cantidad;
  } else {
    carrito.push({ slug, nombre: producto.nombre, precio: producto.precio, cantidad });
  }
  guardarCarrito(carrito);
  actualizarBadge();
}

function cambiarCantidad(slug, cantidad) {
  if (cantidad <= 0) return quitarDelCarrito(slug);
  const item = carrito.find((i) => i.slug === slug);
  if (item) item.cantidad = cantidad;
  guardarCarrito(carrito);
  actualizarBadge();
  renderCartModal();
}

function quitarDelCarrito(slug) {
  carrito = carrito.filter((i) => i.slug !== slug);
  guardarCarrito(carrito);
  actualizarBadge();
  renderCartModal();
}

function vaciarCarrito() {
  carrito = [];
  guardarCarrito(carrito);
  actualizarBadge();
}

function totalCarrito() {
  return carrito.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
}
function totalItemsCarrito() {
  return carrito.reduce((acc, i) => acc + i.cantidad, 0);
}

function actualizarBadge() {
  const badge = document.getElementById('cartBadge');
  const total = totalItemsCarrito();
  badge.textContent = total;
  badge.classList.toggle('hidden', total === 0);
}

// ============================================================
// RENDER: CHIPS DE CATEGORÍA
// ============================================================
function getCategorias() {
  return [...new Set(PRODUCTOS.map((p) => p.categoria))];
}

function renderChips() {
  const wrap = document.getElementById('chipsWrap');
  const categorias = ['Todas', ...getCategorias()];
  wrap.innerHTML = categorias
    .map(
      (cat) =>
        `<button class="chip${cat === categoriaActiva ? ' active' : ''}" data-cat="${cat}">${cat}</button>`
    )
    .join('');
  wrap.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      categoriaActiva = btn.dataset.cat;
      renderChips();
      renderCatalogo();
    });
  });
}

// ============================================================
// RENDER: CATÁLOGO
// ============================================================
function renderCatalogo() {
  const wrap = document.getElementById('categoriesWrap');
  wrap.innerHTML = '';
  const texto = textoBusqueda.trim().toLowerCase();

  const productosFiltrados = PRODUCTOS.filter((p) => {
    const coincideTexto = p.nombre.toLowerCase().includes(texto);
    const coincideCategoria = categoriaActiva === 'Todas' || p.categoria === categoriaActiva;
    return coincideTexto && coincideCategoria;
  });

  getCategorias().forEach((categoria) => {
    const productosCategoria = productosFiltrados.filter((p) => p.categoria === categoria);
    if (productosCategoria.length === 0) return;

    const section = document.createElement('section');
    const titulo = document.createElement('h2');
    titulo.className = 'category-title';
    titulo.textContent = categoria;
    section.appendChild(titulo);

    const grid = document.createElement('div');
    grid.className = 'grid';
    productosCategoria.forEach((producto) => grid.appendChild(crearTarjetaProducto(producto)));

    section.appendChild(grid);
    wrap.appendChild(section);
  });

  if (productosFiltrados.length === 0) {
    wrap.innerHTML = '<p class="empty-state">No se encontraron productos.</p>';
  }
}

function crearTarjetaProducto(producto) {
  const card = document.createElement('div');
  card.className = 'card';

  const image = document.createElement('div');
  image.className = 'card-image';
  image.style.background = `linear-gradient(135deg, ${producto.color}, #ffffff)`;
  image.innerHTML = `<span class="icon">${ICONOS_CATEGORIA[producto.categoria] || '🍞'}</span>`;
  image.onclick = () => abrirDetalleProducto(producto.slug);

  const body = document.createElement('div');
  body.className = 'card-body';
  body.innerHTML = `
    <span class="card-category">${producto.categoria}</span>
    <span class="card-name">${producto.nombre}</span>
    <span class="card-price">$${producto.precio.toFixed(2)}</span>
  `;
  body.querySelector('.card-name').onclick = () => abrirDetalleProducto(producto.slug);

  const btn = document.createElement('button');
  btn.className = 'card-add';
  btn.textContent = 'Agregar';
  btn.onclick = () => {
    agregarAlCarrito(producto.slug);
    btn.textContent = '¡Agregado!';
    setTimeout(() => (btn.textContent = 'Agregar'), 1200);
  };
  body.appendChild(btn);

  card.appendChild(image);
  card.appendChild(body);
  return card;
}

// ============================================================
// MODAL: DETALLE DE PRODUCTO
// ============================================================
function abrirDetalleProducto(slug) {
  const producto = PRODUCTOS.find((p) => p.slug === slug);
  if (!producto) return;

  const body = document.getElementById('productModalBody');
  body.innerHTML = `
    <div class="detail-image" style="background:linear-gradient(135deg, ${producto.color}, #ffffff)">
      <span class="icon">${ICONOS_CATEGORIA[producto.categoria] || '🍞'}</span>
    </div>
    <span class="detail-category">${producto.categoria}</span>
    <h2 class="detail-name">${producto.nombre}</h2>
    <p class="detail-desc">${producto.descripcion}</p>
    <p class="detail-price">$${producto.precio.toFixed(2)}</p>
    <button class="btn-primary" id="detailAddBtn">Agregar al pedido</button>
  `;
  document.getElementById('detailAddBtn').onclick = (e) => {
    agregarAlCarrito(producto.slug);
    e.target.textContent = '¡Agregado!';
    setTimeout(() => (e.target.textContent = 'Agregar al pedido'), 1200);
  };
  abrirModal('productModal');
}

// ============================================================
// MODAL: CARRITO / CHECKOUT
// ============================================================
function renderCartModal() {
  const body = document.getElementById('cartModalBody');

  if (carrito.length === 0) {
    body.innerHTML = '<p class="empty-state">Tu pedido está vacío.</p>';
    return;
  }

  const filas = carrito
    .map(
      (item) => `
      <div class="cart-row" data-slug="${item.slug}">
        <span class="cart-row-name">${item.nombre}</span>
        <div class="qty-stepper">
          <button data-dec="${item.slug}">−</button>
          <span>${item.cantidad}</span>
          <button data-inc="${item.slug}">+</button>
        </div>
        <span class="cart-row-price">$${(item.precio * item.cantidad).toFixed(2)}</span>
        <button class="cart-row-remove" data-remove="${item.slug}">✕</button>
      </div>`
    )
    .join('');

  body.innerHTML = `
    <h2>Tu pedido</h2>
    ${filas}
    <div class="cart-total"><span>Total</span><strong>$${totalCarrito().toFixed(2)}</strong></div>
    <div id="checkoutFormWrap">
      <input class="form-field" id="inputNombre" placeholder="Nombre completo" />
      <input class="form-field" id="inputTelefono" placeholder="Teléfono" />
      <input class="form-field" id="inputDireccion" placeholder="Dirección (opcional)" />
      <textarea class="form-field" id="inputNotas" placeholder="Notas (opcional)" rows="2"></textarea>
      <p id="checkoutError" class="error-text hidden">Completa al menos nombre y teléfono.</p>
      <button class="btn-primary" id="enviarPedidoBtn">Enviar pedido</button>
      <p class="hint-text">Se enviará por correo y se abrirá WhatsApp con tu pedido listo.</p>
    </div>
  `;

  body.querySelectorAll('[data-inc]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const slug = e.target.dataset.inc;
      const item = carrito.find((i) => i.slug === slug);
      cambiarCantidad(slug, item.cantidad + 1);
    });
  });
  body.querySelectorAll('[data-dec]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const slug = e.target.dataset.dec;
      const item = carrito.find((i) => i.slug === slug);
      cambiarCantidad(slug, item.cantidad - 1);
    });
  });
  body.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', (e) => quitarDelCarrito(e.target.dataset.remove));
  });
  document.getElementById('enviarPedidoBtn').addEventListener('click', enviarPedido);
}

function construirMensajePedido(cliente) {
  const lineas = [
    'Nuevo pedido - Catálogo Bimbo',
    '',
    `Cliente: ${cliente.nombre}`,
    `Teléfono: ${cliente.telefono}`,
    cliente.direccion ? `Dirección: ${cliente.direccion}` : null,
    cliente.notas ? `Notas: ${cliente.notas}` : null,
    '',
    ...carrito.map((i) => `• ${i.nombre} x${i.cantidad} - $${(i.precio * i.cantidad).toFixed(2)}`),
    '',
    `Total: $${totalCarrito().toFixed(2)}`,
  ].filter(Boolean);
  return lineas.join('\n');
}

async function enviarPedido() {
  const nombre = document.getElementById('inputNombre').value.trim();
  const telefono = document.getElementById('inputTelefono').value.trim();
  const direccion = document.getElementById('inputDireccion').value.trim();
  const notas = document.getElementById('inputNotas').value.trim();
  const errorEl = document.getElementById('checkoutError');
  const btn = document.getElementById('enviarPedidoBtn');

  if (!nombre || !telefono) {
    errorEl.classList.remove('hidden');
    return;
  }
  errorEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  const cliente = { nombre, telefono, direccion, notas };
  const mensaje = construirMensajePedido(cliente);

  // 0) Guardar el pedido en Supabase (para que el admin lo vea y reciba
  // notificación en tiempo real desde admin.html)
  if (supabaseClient) {
    try {
      await supabaseClient.from('pedidos').insert({
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        cliente_direccion: direccion || null,
        cliente_notas: notas || null,
        items: carrito,
        total: totalCarrito(),
      });
    } catch (err) {
      console.error('Error guardando pedido en Supabase:', err);
      // seguimos: igual mandamos correo/WhatsApp aunque falle el guardado
    }
  }

  if (CONFIG.EMAILJS_PUBLIC_KEY && CONFIG.EMAILJS_SERVICE_ID && CONFIG.EMAILJS_TEMPLATE_ID) {
    try {
      emailjs.init(CONFIG.EMAILJS_PUBLIC_KEY);
      await emailjs.send(CONFIG.EMAILJS_SERVICE_ID, CONFIG.EMAILJS_TEMPLATE_ID, {
        to_email: CONFIG.ORDER_EMAIL_TO,
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        cliente_direccion: direccion || '-',
        cliente_notas: notas || '-',
        pedido_detalle: mensaje,
        pedido_total: totalCarrito().toFixed(2),
      });
    } catch (err) {
      console.error('Error enviando correo (EmailJS):', err);
    }
  }

  if (CONFIG.WHATSAPP_NUMBER) {
    const url = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  }

  vaciarCarrito();
  mostrarConfirmacion();
}

function mostrarConfirmacion() {
  const body = document.getElementById('cartModalBody');
  body.innerHTML = `
    <div class="confirm-state">
      <div class="confirm-icon">✓</div>
      <h3>¡Gracias! Tu pedido fue enviado.</h3>
      <p>Nos pondremos en contacto contigo pronto.</p>
      <button class="btn-primary" data-close="cartModal">Seguir viendo el catálogo</button>
    </div>
  `;
  body.querySelector('[data-close]').addEventListener('click', () => cerrarModal('cartModal'));
}

// ============================================================
// MODALES
// ============================================================
function abrirModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function cerrarModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ============================================================
// INICIALIZACIÓN
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  alert(`Catálogo Bimbo — ${VERSION}`);
  renderChips();
  renderCatalogo();
  actualizarBadge();

  document.getElementById('searchInput').addEventListener('input', (e) => {
    textoBusqueda = e.target.value;
    renderCatalogo();
  });

  document.getElementById('cartBtn').addEventListener('click', () => {
    renderCartModal();
    abrirModal('cartModal');
  });

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => cerrarModal(btn.dataset.close));
  });

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });
});
