// ============================================================
// VERSIÓN — súbela cada vez que hagas un cambio, así al abrir la
// página confirmas de inmediato que sí cargó la versión nueva.
// ============================================================
const VERSION = 'v24 — Dashboard visible para MSL/ZSL en el catálogo';

// CONFIG, supabaseClient, productsSupabaseClient y ESTADOS_SERVICIO
// vienen de config.js (compartido con admin.js)

// ============================================================
// AUTENTICACIÓN — el catálogo requiere cuenta (cliente o admin)
// ============================================================
let perfilActual = null;
let usuarioActual = null;

// Deep link a un producto compartido (?p=slug) — se captura apenas carga
// el script (antes de saber si hay sesión o no) y se guarda para abrirlo
// en cuanto el catálogo esté listo, ya sea que el usuario ya tenía sesión
// o que tenga que iniciarla/registrarse primero.
(function capturarProductoCompartido() {
  try {
    const slug = new URLSearchParams(location.search).get('p');
    if (slug) sessionStorage.setItem('productoCompartido', slug);
  } catch {
    // sessionStorage no disponible (modo privado estricto, etc.) — no es crítico
  }
})();

async function mostrarSegunSesion() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    await cargarPerfilYEntrar();
  } else {
    document.getElementById('authView').classList.remove('hidden');
    document.getElementById('appShell').classList.add('hidden');
  }
}

async function cargarPerfilYEntrar() {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  usuarioActual = user;
  const { data: perfil } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  perfilActual = perfil;
  actualizarUltimoLogin();
  await mostrarApp();
}

// ============================================================
// ACTIVIDAD — solo la ve el admin (tab "Actividad" en el panel). Tres
// cosas: cuándo entró/navegó cada quien (ultimo_login), qué buscan
// (eventos_actividad tipo 'busqueda') y qué productos ven más
// (tipo 'vista_producto'). Todo "fire and forget": si falla, no
// interrumpe al cliente ni le muestra ningún error.
// ============================================================
function actualizarUltimoLogin() {
  if (!usuarioActual) return;
  supabaseClient
    .from('profiles')
    .update({ ultimo_login: new Date().toISOString() })
    .eq('id', usuarioActual.id)
    .then(() => {});
}

function registrarEventoActividad(tipo, valor) {
  if (!usuarioActual || !valor) return;
  supabaseClient
    .from('eventos_actividad')
    .insert({ user_id: usuarioActual.id, tipo, valor })
    .then(() => {});
}

// Duración de sesión: se guarda UNA fila por visita, con los minutos
// activos, en cuanto la pestaña pasa a segundo plano (o se cierra) — es
// más confiable que esperar el cierre exacto de la página. Cada fila
// también sirve para medir frecuencia (cuántas visitas hizo cada quien).
let inicioSesion = null;
let duracionSesionRegistrada = false;
function registrarDuracionSesion() {
  if (duracionSesionRegistrada || !inicioSesion) return;
  const minutos = Math.round((Date.now() - inicioSesion) / 60000);
  if (minutos < 1) return;
  duracionSesionRegistrada = true;
  registrarEventoActividad('sesion_duracion', String(minutos));
}

// Dispositivo (móvil/escritorio) e idioma de navegación — un solo evento
// por sesión, le sirve al admin para priorizar dónde invertir esfuerzo
// (ej. si vale la pena terminar de traducir el panel).
function registrarDispositivoEIdioma() {
  const esMovil = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  registrarEventoActividad('dispositivo', esMovil ? 'Móvil' : 'Escritorio');
  registrarEventoActividad('idioma_uso', obtenerIdioma() === 'en' ? 'Inglés' : 'Español');
}

// Se registra una búsqueda solo cuando el cliente DEJA de escribir
// (después de una pausa) — así no se guarda una fila por cada tecla.
// De paso, si esa búsqueda no encontró NADA, se registra aparte como
// 'busqueda_sin_resultado' — así el admin ve en la pestaña Actividad qué
// término le falta al catálogo (ej. "pan de molde" si nadie le puso ese
// alias a ningún producto todavía).
let timeoutBusquedaLog = null;
function registrarBusquedaConDebounce(texto) {
  clearTimeout(timeoutBusquedaLog);
  const limpio = texto.trim();
  if (!limpio) return;
  timeoutBusquedaLog = setTimeout(() => {
    registrarEventoActividad('busqueda', limpio);
    const textoNorm = limpio.toLowerCase();
    const hayResultados = PRODUCTOS.some((p) => coincideBusqueda(p, textoNorm));
    if (!hayResultados) {
      registrarEventoActividad('busqueda_sin_resultado', limpio);
    }
  }, 1200);
}

async function mostrarApp() {
  document.getElementById('authView').classList.add('hidden');

  const esAdmin = perfilActual?.role === 'admin';
  // Admin, MSL y ZSL entran al catálogo normal igual que un cliente, pero
  // además deben poder encontrar el panel — se les muestra el link
  // "Dashboard" en su menú de perfil (apunta a admin.html). IBP y cliente
  // no lo ven porque no tienen panel.
  const tienePanelAdmin = ['admin', 'msl', 'zsl'].includes(perfilActual?.role);
  if (!esAdmin && perfilActual?.estado_cuenta !== 'aprobado') {
    mostrarPendiente();
    return;
  }

  // El aviso de versión (para confirmar que sí cargó el código nuevo)
  // solo le sirve al admin — a un cliente normal no le dice nada y solo
  // estorba, así que no se le muestra.
  if (esAdmin) {
    alert(`Catálogo Bimbo — ${VERSION}`);
  }

  document.getElementById('appShell').classList.remove('hidden');
  await Promise.all([cargarProductos(), cargarCategoriasCatalogo(), cargarMuebles(), cargarFavoritos()]);
  renderChips();
  renderCatalogo();
  actualizarBadge();

  if (!inicioSesion) {
    inicioSesion = Date.now();
    registrarDispositivoEIdioma();
  }
  initProfileMenu({
    linkPedidos: tienePanelAdmin,
    linkMisPedidos: !tienePanelAdmin,
    onLogout: async () => {
      await supabaseClient.auth.signOut();
      location.reload();
    },
  });
  abrirProductoCompartidoSiExiste();
}

// Si el catálogo se abrió desde un link compartido (?p=slug), abre el
// detalle de ese producto en cuanto todo esté cargado. Funciona tanto si
// ya había sesión como si el usuario tuvo que iniciarla/registrarse
// primero (el slug queda guardado en sessionStorage desde que cargó el
// script, ver capturarProductoCompartido() arriba).
function abrirProductoCompartidoSiExiste() {
  let slug = null;
  try {
    slug = sessionStorage.getItem('productoCompartido');
    if (slug) sessionStorage.removeItem('productoCompartido');
  } catch {
    return;
  }
  if (!slug) return;
  if (PRODUCTOS.some((p) => p.slug === slug)) {
    abrirDetalleProducto(slug);
  }
}

let canalMiPerfil = null;

function mostrarPendiente() {
  document.getElementById('pendienteView').classList.remove('hidden');
  actualizarMensajePendiente();
  suscribirseAMiPerfil();
}

function actualizarMensajePendiente() {
  const msg = document.getElementById('pendienteMensaje');
  if (perfilActual?.estado_cuenta === 'rechazado') {
    msg.textContent = t('pendienteMensajeRechazado');
  } else {
    msg.textContent = t('pendienteMensajePendiente');
  }
}

// Mientras espera, si el admin aprueba desde su panel, esto lo detecta
// solo y lo pasa al catálogo sin que tenga que cerrar sesión y reentrar.
function suscribirseAMiPerfil() {
  if (canalMiPerfil || !usuarioActual) return;
  canalMiPerfil = supabaseClient
    .channel('mi-perfil-cambios')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${usuarioActual.id}` },
      (payload) => {
        perfilActual = payload.new;
        if (perfilActual.estado_cuenta === 'aprobado' || perfilActual.role === 'admin') {
          document.getElementById('pendienteView').classList.add('hidden');
          mostrarApp();
        } else {
          actualizarMensajePendiente();
        }
      }
    )
    .subscribe();
}

async function iniciarSesion() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  if (!email || !password) {
    errorEl.textContent = t('loginErrorEmpty');
    errorEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = t('loginBtnLoading');
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  btn.textContent = t('loginBtn');

  if (error) {
    errorEl.textContent = traducirErrorAuth(error);
    errorEl.classList.remove('hidden');
    return;
  }
  errorEl.classList.add('hidden');
  await cargarPerfilYEntrar();
}

function traducirErrorAuth(error) {
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('already registered') || msg.includes('already exists')) {
    return t('authErrorAlreadyRegistered');
  }
  if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
    return t('authErrorNotConfirmed');
  }
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return t('authErrorInvalidCreds');
  }
  if (msg.includes('rate limit') || msg.includes('security purposes') || msg.includes('seconds')) {
    return t('authErrorRateLimit');
  }
  if (msg.includes('password')) {
    return t('authErrorPasswordLength');
  }
  return error?.message || t('authErrorGeneric');
}

async function registrarse() {
  const tienda = document.getElementById('regTienda').value.trim();
  const nombre = document.getElementById('regNombre').value.trim();
  const telefono = document.getElementById('regTelefono').value.trim();
  const direccion = document.getElementById('regDireccion').value.trim();
  const ciudad = document.getElementById('regCiudad').value.trim();
  const estado = document.getElementById('regEstado').value.trim();
  const zip = document.getElementById('regZip').value.trim();
  const cadena = document.getElementById('regCadena').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errorEl = document.getElementById('registroError');
  const btn = document.getElementById('registroBtn');

  if (!tienda || !nombre || !telefono || !direccion || !ciudad || !estado || !zip || !cadena || !email || !password) {
    errorEl.textContent = t('registroErrorEmpty');
    errorEl.classList.remove('hidden');
    return;
  }
  errorEl.classList.add('hidden');

  btn.disabled = true;
  btn.textContent = t('registroBtnLoading');
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { tienda_nombre: tienda, nombre, telefono, direccion, ciudad, estado, zip, cadena },
    },
  });
  btn.disabled = false;
  btn.textContent = t('registroBtn');

  if (error) {
    errorEl.textContent = traducirErrorAuth(error);
    errorEl.classList.remove('hidden');
    return;
  }
  errorEl.classList.add('hidden');

  if (data.session) {
    await cargarPerfilYEntrar();
  } else {
    mostrarRegistroExitoso(t('registroExitosoMsg'));
  }
}

function mostrarRegistroExitoso(mensaje) {
  document.querySelector('.auth-tabs').classList.add('hidden');
  document.getElementById('loginForm').classList.add('hidden');
  document.getElementById('registroForm').classList.add('hidden');
  document.getElementById('registroExitosoMsg').textContent = mensaje;
  document.getElementById('registroExitosoView').classList.remove('hidden');
}

function cambiarTabAuth(tab) {
  document.querySelectorAll('.auth-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registroForm').classList.toggle('hidden', tab !== 'registro');
}

// ============================================================
// DATOS DE PRODUCTOS — vienen de Supabase (proyecto "bimbo-inventory-pro",
// tabla `products`), la MISMA base que usa la app de escaneo. Ya no hay
// arreglo hardcodeado.
// ============================================================
let PRODUCTOS = [];
const PRODUCTOS_CACHE_KEY = 'catalogo-bimbo-productos-cache';

// Lista de categorías (tabla `categorias`, bimbo-inventory-pro) — solo
// se usa para el ORDEN de los chips; el texto/valor real de cada
// producto ya viene en producto.categoria.
let CATEGORIAS_DB = [];

async function cargarCategoriasCatalogo() {
  if (!productsSupabaseClient) return;
  try {
    const { data, error } = await productsSupabaseClient.from('categorias').select('*').eq('activa', true).order('orden');
    if (error) throw error;
    CATEGORIAS_DB = data || [];
  } catch (err) {
    console.error('Error cargando categorías:', err);
    CATEGORIAS_DB = [];
  }
}

// Muebles ("Estantes" de cara al cliente) — sección informativa, no
// vendible. Vive en catalogo-bimbo (mismo proyecto que auth), no en
// bimbo-inventory-pro.
let MUEBLES = [];

async function cargarMuebles() {
  try {
    const { data, error } = await supabaseClient.from('muebles').select('*').eq('activo', true).order('orden');
    if (error) throw error;
    MUEBLES = data || [];
  } catch (err) {
    console.error('Error cargando muebles:', err);
    MUEBLES = [];
  }
}

// ============================================================
// FAVORITOS — corazón en la tarjeta/detalle + chip "Mis favoritos". Vive
// en catalogo-bimbo (junto con auth), guardado por UPC (no hace falta
// cruzar con bimbo-inventory-pro). También le sirve al admin como señal
// de qué productos le gustan más a la gente (pestaña Actividad).
// ============================================================
let FAVORITOS = new Set();

async function cargarFavoritos() {
  if (!usuarioActual) {
    FAVORITOS = new Set();
    return;
  }
  try {
    const { data, error } = await supabaseClient.from('favoritos').select('product_upc').eq('user_id', usuarioActual.id);
    if (error) throw error;
    FAVORITOS = new Set((data || []).map((f) => f.product_upc));
  } catch (err) {
    console.error('Error cargando favoritos:', err);
    FAVORITOS = new Set();
  }
}

// Optimista: cambia el estado local y refresca la UI de inmediato, y
// solo si falla el guardado en Supabase se revierte. Vuelve a pintar
// chips (por si "Mis favoritos" aparece/desaparece) y el catálogo.
async function toggleFavorito(slug, nombre) {
  if (!usuarioActual) return;
  const yaEsFavorito = FAVORITOS.has(slug);

  if (yaEsFavorito) {
    FAVORITOS.delete(slug);
  } else {
    FAVORITOS.add(slug);
  }
  renderChips();
  renderCatalogo();
  actualizarCorazonesDetalle();

  const { error } = yaEsFavorito
    ? await supabaseClient.from('favoritos').delete().eq('user_id', usuarioActual.id).eq('product_upc', slug)
    : await supabaseClient.from('favoritos').insert({ user_id: usuarioActual.id, product_upc: slug, product_nombre: nombre });

  if (error) {
    console.error('Error guardando favorito:', error);
    // revertir el cambio optimista
    if (yaEsFavorito) FAVORITOS.add(slug);
    else FAVORITOS.delete(slug);
    renderChips();
    renderCatalogo();
    actualizarCorazonesDetalle();
  }
}

// Si el modal de detalle está abierto para este mismo producto, actualiza
// su corazón también (renderCatalogo no toca el modal).
function actualizarCorazonesDetalle() {
  const btn = document.getElementById('detailHeartBtn');
  if (!btn || !btn.dataset.slug) return;
  btn.textContent = FAVORITOS.has(btn.dataset.slug) ? '❤️' : '🤍';
}

// Paleta de colores solo para el fondo de la tarjeta cuando no hay foto
// real todavía. Es puramente cosmético — no se guarda en la base.
const PALETA_COLORES = ['#FBEFD9', '#F0E4CB', '#FCE9DE', '#FBF0D3', '#FBE4E9', '#F4E6CE', '#F8EFDA', '#FBDFE2'];
function colorParaProducto(upc) {
  let hash = 0;
  const str = String(upc || '');
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return PALETA_COLORES[hash % PALETA_COLORES.length];
}

// Categoría — ahora viene directo de products.categoria (editable desde
// el panel, tabla `categorias`). Ya no es un mapeo fijo por marca en el
// código; ver migración "categorias_y_products_categoria". Los pocos
// productos sin categoria asignada caen en el genérico de abajo.
// Clave interna estable (no se traduce) — el texto que se muestra sale
// de t('categoriaOtros') al momento de renderizar.
const CATEGORIA_DEFAULT = 'Otros productos Bimbo';

// Ícono representativo por categoría (mientras no hay fotos reales).
// Cualquier categoría nueva que no esté aquí usa el fallback 🍞 donde
// se consulta este objeto — no hace falta tocar esto al crear una
// categoría desde el panel.
const ICONOS_CATEGORIA = {
  Barcel: '🌶️',
  Bimbo: '🍞',
  Marinela: '🧁',
  "Entenmann's": '🍩',
  Shipper: '📦',
  [CATEGORIA_DEFAULT]: '🍞',
};

// Texto mostrado para una categoría (traduce solo el genérico "Otros
// productos Bimbo"; las marcas —Barcel, Bimbo, Marinela, Entenmann's—
// se muestran igual en ambos idiomas).
function displayCategoria(categoria) {
  return categoria === CATEGORIA_DEFAULT ? t('categoriaOtros') : categoria;
}

// ============================================================
// BÚSQUEDA CON SINÓNIMOS — el nombre oficial del producto en la base
// (ej. "Pan Grande Blanco") no siempre coincide con cómo lo pide el
// cliente (ej. "pan de molde", "white bread"). Este diccionario cubre
// términos genéricos comunes; para casos específicos de un producto en
// particular, cada producto también tiene su propio campo
// `palabras_clave` editable desde el panel (Productos), que se suma al
// texto contra el que se compara.
//
// La clave debe ser la frase completa tal como la escribiría el
// cliente (en minúsculas) — no hace falta que sea exhaustivo, se puede
// seguir ampliando aquí según lo que la gente busque y no encuentre (ver
// "Búsquedas sin resultados" en la pestaña Actividad del panel).
// ============================================================
const SINONIMOS_BUSQUEDA = {
  'pan de molde': ['pan blanco', 'sandwich', 'wonder'],
  'pan blanco': ['pan de molde', 'sandwich', 'wonder'],
  'white bread': ['pan blanco', 'pan de molde', 'sandwich'],
  'sandwich bread': ['pan blanco', 'pan de molde', 'sandwich'],
  pan: ['bread'],
  bread: ['pan'],
  tortillas: ['tortilla', 'wraps'],
  tortilla: ['tortillas', 'wrap'],
  donas: ['donuts', 'dona'],
  donuts: ['donas', 'dona'],
  donut: ['dona', 'donas'],
  pastelitos: ['cakes', 'ponque', 'gansito'],
  cakes: ['pastelitos', 'ponque'],
  chips: ['papas', 'frituras', 'botana'],
  papas: ['chips', 'frituras', 'botana'],
  frituras: ['chips', 'papas', 'botana'],
  botana: ['chips', 'papas', 'frituras', 'snacks'],
  snacks: ['botana', 'chips'],
  bolillo: ['pan blanco', 'bread roll'],
  muffins: ['panque', 'panquecito'],
  panque: ['muffins', 'panquecito'],
};

// Texto contra el que se compara la búsqueda de un producto: su nombre +
// sus palabras clave (alias del panel de admin), todo en minúsculas.
function textoBusquedaProducto(producto) {
  return `${producto.nombre} ${(producto.palabrasClave || []).join(' ')}`.toLowerCase();
}

// texto ya debe venir en minúsculas y sin espacios sobrantes (ver
// llamadas de esta función en renderCatalogo/registrarBusquedaConDebounce).
function coincideBusqueda(producto, texto) {
  if (!texto) return true;
  const haystack = textoBusquedaProducto(producto);
  if (haystack.includes(texto)) return true;
  const sinonimos = SINONIMOS_BUSQUEDA[texto] || [];
  return sinonimos.some((s) => haystack.includes(s));
}

// ============================================================
// UPC COMPLETO (12 dígitos) — el precio list solo trae el código
// "core" de 10 dígitos (sin el primer dígito de marca ni el dígito
// verificador). Reconstruimos el UPC-A real para que el cliente pueda
// buscarlo/escanearlo en su tienda:
//   [prefijo de marca (1)] + [core de 10] + [dígito verificador (1)]
// El prefijo por marca viene de la tabla `marca_prefijos`. El dígito
// verificador se calcula con el algoritmo estándar UPC-A/GS1.
// ============================================================
let PREFIJOS_MARCA = {};

async function cargarPrefijosMarca() {
  try {
    const { data, error } = await productsSupabaseClient.from('marca_prefijos').select('marca, prefijo');
    if (error) throw error;
    PREFIJOS_MARCA = {};
    (data || []).forEach((r) => {
      PREFIJOS_MARCA[r.marca] = r.prefijo;
    });
  } catch (err) {
    console.error('Error cargando marca_prefijos:', err);
  }
}

function calcularDigitoVerificadorUPC(codigo11) {
  let sumaImpares = 0;
  let sumaPares = 0;
  for (let i = 0; i < 11; i++) {
    const d = Number(codigo11[i]);
    if (i % 2 === 0) sumaImpares += d;
    else sumaPares += d;
  }
  const total = sumaImpares * 3 + sumaPares;
  return (10 - (total % 10)) % 10;
}

// Devuelve el UPC-A de 12 dígitos, o null si no conocemos el prefijo
// de esa marca todavía.
function calcularUpcCompleto(upcCore, marca) {
  const prefijo = PREFIJOS_MARCA[marca];
  if (!prefijo || !upcCore) return null;
  const core10 = String(upcCore).padStart(10, '0').slice(-10);
  const codigo11 = prefijo + core10;
  const digitoVerificador = calcularDigitoVerificadorUPC(codigo11);
  return codigo11 + String(digitoVerificador);
}

// Formato legible tipo barra de barcode: "0 74323 09524 1"
function formatearUPC(upc12) {
  if (!upc12 || upc12.length !== 12) return upc12 || '';
  return `${upc12[0]} ${upc12.slice(1, 6)} ${upc12.slice(6, 11)} ${upc12[11]}`;
}

function mapProductoDB(row) {
  const unidadesCaja = row.unidades_caja || null;
  // El precio en la base es POR PIEZA (así viene del price list). Lo que
  // realmente se vende es la CAJA completa, así que si ya sabemos cuántas
  // piezas trae la caja, el precio de venta es precio_pieza × piezas.
  // Mientras no tengamos ese dato para un producto (Doug lo sigue
  // completando), se sigue vendiendo por pieza como antes — para no
  // inventar una cantidad de caja que no hemos verificado.
  const precioUnidad = row.precio != null ? Number(row.precio) : null;
  const ventaPorCaja = !!unidadesCaja;
  const precio = precioUnidad != null ? (ventaPorCaja ? precioUnidad * unidadesCaja : precioUnidad) : null;

  return {
    slug: row.upc,
    nombre: row.producto,
    categoria: row.categoria || CATEGORIA_DEFAULT,
    precioUnidad,
    precio,
    ventaPorCaja,
    foto: row.foto || '',
    color: colorParaProducto(row.upc),
    upcCompleto: calcularUpcCompleto(row.upc, row.marca),
    unidadesCaja,
    unidadesPallet: row.unidades_pallet || null,
    // Solo se usa para ordenar y para decidir "Hot" — nunca se muestra.
    ventasTotales: row.ventas_totales != null ? Number(row.ventas_totales) : 0,
    esHot: false,
    // Cadenas donde está autorizado (por defecto solo Independientes).
    cadenasPermitidas: Array.isArray(row.cadenas_permitidas) ? row.cadenas_permitidas : [],
    esNuevo: !!row.es_nuevo,
    // Alias de búsqueda editables desde el panel (ver SINONIMOS_BUSQUEDA).
    palabrasClave: Array.isArray(row.palabras_clave) ? row.palabras_clave : [],
  };
}

// Un producto está DISPONIBLE PARA PEDIR solo si la cadena del cliente
// está en su lista de cadenas autorizadas (por defecto, todos los
// productos traen "Independientes" — Doug agrega manualmente
// Wawa/7-Eleven/Circle K/Dash-In donde corresponda). Si eres 7-Eleven,
// solo puedes pedir lo autorizado para 7-Eleven; si eres Independiente,
// puedes pedir todo lo que tenga Independientes (que es prácticamente
// todo, salvo que Doug lo quite a propósito). Clientes sin cadena
// asignada todavía (perfilActual.cadena vacío/null) pueden pedir el
// catálogo completo sin restricción.
//
// IMPORTANTE: esto YA NO filtra qué productos se cargan — todos los
// productos se muestran siempre, para que el cliente sepa que existen
// (aunque no pueda pedirlos). Los no disponibles para su cadena se
// pintan "pálidos" y sin botón de Agregar (ver crearTarjetaProducto /
// abrirDetalleProducto).
function productoDisponibleParaCliente(producto) {
  const cadenaCliente = perfilActual?.cadena;
  if (!cadenaCliente) return true;
  return (producto.cadenasPermitidas || []).includes(cadenaCliente);
}

// Marca los 10 productos más vendidos DE CADA CATEGORÍA (marca) como
// "Hot". Se calcula una sola vez al cargar, sobre el listado completo
// (no sobre resultados de búsqueda), para que el badge no cambie según
// lo que el cliente esté buscando.
function marcarProductosHot(productos) {
  const porCategoria = {};
  productos.forEach((p) => {
    if (!porCategoria[p.categoria]) porCategoria[p.categoria] = [];
    porCategoria[p.categoria].push(p);
  });
  Object.values(porCategoria).forEach((grupo) => {
    grupo
      .slice()
      .sort((a, b) => (b.ventasTotales || 0) - (a.ventasTotales || 0))
      .slice(0, 10)
      .forEach((p) => {
        p.esHot = true;
      });
  });
}

// Trae los productos desde Supabase. Solo muestra productos con precio
// asignado, para no exponerle "$0.00" a un cliente por algo que todavía
// no tiene precio cargado. Se ordenan por ventas totales (de mayor a
// menor) para que lo más vendido aparezca primero en cada categoría.
async function cargarProductos() {
  if (!productsSupabaseClient) {
    console.error('productsSupabaseClient no está configurado (revisa config.js)');
    return;
  }
  try {
    await cargarPrefijosMarca();
    const { data, error } = await productsSupabaseClient
      .from('products')
      .select('upc, sku, producto, precio, unidades_caja, unidades_pallet, foto, activo, marca, ventas_totales, cadenas_permitidas, es_nuevo, categoria, palabras_clave')
      .eq('activo', true)
      .not('precio', 'is', null)
      .gt('precio', 0)
      .order('ventas_totales', { ascending: false, nullsFirst: false });
    if (error) throw error;
    PRODUCTOS = (data || []).map(mapProductoDB);
    PRODUCTOS.forEach((p) => {
      p.disponibleParaMiCadena = productoDisponibleParaCliente(p);
    });
    marcarProductosHot(PRODUCTOS);
    localStorage.setItem(PRODUCTOS_CACHE_KEY, JSON.stringify(PRODUCTOS));
  } catch (err) {
    console.error('Error cargando productos de Supabase, usando cache local:', err);
    try {
      PRODUCTOS = JSON.parse(localStorage.getItem(PRODUCTOS_CACHE_KEY)) || [];
    } catch {
      PRODUCTOS = [];
    }
  }
}

const STORAGE_KEY = 'catalogo-bimbo-carrito';

// ============================================================
// ESTADO
// ============================================================
let carrito = cargarCarrito();
let categoriaActiva = 'Todas';
let textoBusqueda = '';

// Precios "tocados" en esta visita — cada producto empieza con el precio
// oculto en la tarjeta del catálogo (chip "Toca para ver precio"); al
// tocarlo se revela y queda registrado como evento 'ver_precio' (junto con
// 'vista_producto', le da al admin una señal de qué le interesa más a la
// gente). Se reinicia en cada carga de página — no se guarda.
let PRECIOS_REVELADOS = new Set();

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
  // Blindaje: aunque la UI ya no muestra botón de Agregar para productos
  // fuera de la cadena del cliente, esto evita que se cuelen por otra vía.
  if (producto.disponibleParaMiCadena === false) return;
  const existente = carrito.find((i) => i.slug === slug);
  if (existente) {
    existente.cantidad += cantidad;
  } else {
    carrito.push({
      slug,
      nombre: producto.nombre,
      precio: producto.precio,
      unidad: producto.ventaPorCaja ? 'caja' : 'pieza',
      cantidad,
    });
  }
  guardarCarrito(carrito);
  actualizarBadge();
  registrarEventoActividad('agregado_carrito', producto.nombre);
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
  reiniciarTimerRecordatorioCarrito();
}

// ============================================================
// RECORDATORIO DE CARRITO — si el cliente deja productos en el carrito y
// pasa un rato sin hacer nada (sin tocar la pantalla), aparece un aviso
// discreto abajo mencionando el producto. No es un modal que interrumpa:
// se puede cerrar, y solo vuelve a aparecer si hay otro rato de
// inactividad después de eso.
// ============================================================
let timerRecordatorioCarrito = null;
const RECORDATORIO_CARRITO_IDLE_MS = 45000;

function reiniciarTimerRecordatorioCarrito() {
  clearTimeout(timerRecordatorioCarrito);
  if (carrito.length === 0) return;
  timerRecordatorioCarrito = setTimeout(mostrarRecordatorioCarrito, RECORDATORIO_CARRITO_IDLE_MS);
}

function mostrarRecordatorioCarrito() {
  if (carrito.length === 0) return;
  const cartModalEl = document.getElementById('cartModal');
  if (cartModalEl && !cartModalEl.classList.contains('hidden')) return; // ya está viendo su carrito

  const primerItem = carrito[0];
  const variante = 1 + Math.floor(Math.random() * 3);
  const texto = t(`carritoRecordatorio${variante}`, primerItem.nombre);

  document.getElementById('cartReminderText').textContent = texto;
  document.getElementById('cartReminderBtn').textContent = t('carritoRecordatorioCta');
  document.getElementById('cartReminderToast').classList.remove('hidden');
}

function ocultarRecordatorioCarrito() {
  document.getElementById('cartReminderToast').classList.add('hidden');
}

// ============================================================
// RENDER: CHIPS DE CATEGORÍA
// ============================================================
// Devuelve las categorías que tienen al menos un producto, en el orden
// definido en la tabla `categorias` (CATEGORIAS_DB). "Otros productos
// Bimbo" no vive en esa tabla (es el fallback fijo) — si hay productos
// ahí, se agrega siempre al final.
function getCategorias() {
  const nombresConProductos = new Set(PRODUCTOS.map((p) => p.categoria));
  const ordenadas = CATEGORIAS_DB.map((c) => c.nombre).filter((nombre) => nombresConProductos.has(nombre));
  if (nombresConProductos.has(CATEGORIA_DEFAULT) && !ordenadas.includes(CATEGORIA_DEFAULT)) {
    ordenadas.push(CATEGORIA_DEFAULT);
  }
  return ordenadas;
}

// Dentro de cada sección, los productos que SÍ puede pedir el cliente van
// primero — los que están fuera de su cadena (pálidos) quedan al final,
// pero siguen apareciendo.
function ordenarDisponiblesPrimero(productos) {
  return productos
    .slice()
    .sort((a, b) => (a.disponibleParaMiCadena === false ? 1 : 0) - (b.disponibleParaMiCadena === false ? 1 : 0));
}

// "Novedades" y "Populares" son categorías especiales (no vienen de
// products.marca): solo se agregan como chip si hay al menos un producto
// que califique, para no mostrar una pestaña vacía.
function labelChip(cat) {
  if (cat === 'Todas') return t('chipTodas');
  if (cat === 'Novedades') return t('seccionNuevosTitulo');
  if (cat === 'Populares') return t('seccionPopularesTitulo');
  if (cat === 'Favoritos') return t('chipFavoritos');
  if (cat === 'Estantes') return t('chipEstantes');
  return displayCategoria(cat);
}

function renderChips() {
  const wrap = document.getElementById('chipsWrap');
  const tieneNuevos = PRODUCTOS.some((p) => p.esNuevo);
  const tienePopulares = PRODUCTOS.some((p) => p.esHot);
  const tieneFavoritos = FAVORITOS.size > 0;
  const tieneEstantes = MUEBLES.length > 0;
  const categorias = [
    'Todas',
    ...(tieneNuevos ? ['Novedades'] : []),
    ...(tienePopulares ? ['Populares'] : []),
    ...(tieneFavoritos ? ['Favoritos'] : []),
    ...getCategorias(),
    // "Estantes" (muebles) siempre al final, como pidió Doug.
    ...(tieneEstantes ? ['Estantes'] : []),
  ];
  wrap.innerHTML = categorias
    .map((cat) => `<button class="chip${cat === categoriaActiva ? ' active' : ''}" data-cat="${cat}">${labelChip(cat)}</button>`)
    .join('');
  wrap.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      categoriaActiva = btn.dataset.cat;
      renderChips();
      renderCatalogo();
      registrarEventoActividad('categoria_vista', categoriaActiva);
    });
  });
}

// ============================================================
// RENDER: NOVEDADES Y POPULARES
// - Novedades: además de tener su propio chip en el menú de categorías,
//   se muestra siempre como carrusel al principio de la vista general
//   ("Todas", sin buscar) — es la única que tiene esta doble aparición.
// - Populares: SOLO aparece cuando su chip está activo (como cualquier
//   categoría normal, con tarjeta completa).
// Ambas respetan activo/precio/cadena igual que el resto (ya vienen
// filtradas en PRODUCTOS desde cargarProductos()).
// ============================================================
// Tile compacto (solo foto cuadrada + nombre chico) para el carrusel de
// Novedades — a diferencia de la tarjeta normal, no lleva precio ni botón
// de Agregar; el clic en la foto lleva directo al detalle del producto.
function crearTileNovedad(producto) {
  const tile = document.createElement('div');
  tile.className = 'novedad-tile' + (producto.disponibleParaMiCadena === false ? ' no-disponible' : '');
  tile.onclick = () => abrirDetalleProducto(producto.slug);

  const photo = document.createElement('div');
  photo.className = 'novedad-photo';
  photo.innerHTML = producto.foto
    ? `<img src="${producto.foto}" alt="${producto.nombre}">`
    : `<span class="icon">${ICONOS_CATEGORIA[producto.categoria] || '🍞'}</span>`;
  tile.appendChild(photo);

  const nombre = document.createElement('span');
  nombre.className = 'novedad-nombre';
  nombre.textContent = producto.nombre;
  tile.appendChild(nombre);

  return tile;
}

// Sección "Novedades" — carrusel horizontal compacto (fotos cuadradas,
// deslizable), para no ocupar tanto espacio vertical como una tarjeta
// completa.
function crearSeccionNovedades(productos) {
  const section = document.createElement('section');
  const titulo = document.createElement('h2');
  titulo.className = 'category-title';
  titulo.textContent = t('seccionNuevosTitulo');
  section.appendChild(titulo);

  const carrusel = document.createElement('div');
  carrusel.className = 'novedades-scroll';
  ordenarDisponiblesPrimero(productos).forEach((producto) => carrusel.appendChild(crearTileNovedad(producto)));
  section.appendChild(carrusel);

  return section;
}

// Sección genérica con título + grid de tarjetas completas — la usan
// tanto las categorías normales (marca) como las pestañas "Novedades" y
// "Populares" cuando están activas.
function crearSeccionGrid(tituloTexto, productos) {
  const section = document.createElement('section');
  const titulo = document.createElement('h2');
  titulo.className = 'category-title';
  titulo.textContent = tituloTexto;
  section.appendChild(titulo);

  const grid = document.createElement('div');
  grid.className = 'grid';
  ordenarDisponiblesPrimero(productos).forEach((producto) => grid.appendChild(crearTarjetaProducto(producto)));
  section.appendChild(grid);

  return section;
}

// ============================================================
// RENDER: ESTANTES (muebles) — sección informativa, sin precio ni
// botón de Agregar. La tarjeta abre el detalle con el carrusel de
// fotos y el botón "Solicitar información".
// ============================================================
function crearTarjetaMueble(mueble) {
  const card = document.createElement('div');
  card.className = 'card';
  card.onclick = () => abrirDetalleMueble(mueble.id);

  const image = document.createElement('div');
  image.className = 'card-image';
  const foto = (mueble.fotos || [])[0] || '';
  if (foto) {
    image.style.background = '#fff';
    image.innerHTML = `<img src="${foto}" alt="${mueble.nombre}" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;">`;
  } else {
    image.style.background = '#F7F7F8';
    image.innerHTML = `<span class="icon">🪑</span>`;
  }

  const body = document.createElement('div');
  body.className = 'card-body';
  body.innerHTML = `
    <span class="card-category">${t('chipEstantes')}</span>
    <span class="card-name">${mueble.nombre}</span>
  `;

  card.appendChild(image);
  card.appendChild(body);
  return card;
}

function crearSeccionMuebles(muebles) {
  const section = document.createElement('section');
  const titulo = document.createElement('h2');
  titulo.className = 'category-title';
  titulo.textContent = t('chipEstantes');
  section.appendChild(titulo);

  const grid = document.createElement('div');
  grid.className = 'grid';
  muebles.forEach((m) => grid.appendChild(crearTarjetaMueble(m)));
  section.appendChild(grid);

  return section;
}

function crearMuebleCarouselHtml(fotos) {
  if (!fotos || fotos.length === 0) {
    return `<div class="detail-image" style="background:#F7F7F8;"><span class="icon">🪑</span></div>`;
  }
  return `
    <div class="mueble-carousel">
      ${fotos
        .map(
          (url) =>
            `<img src="${url}" alt="" class="mueble-carousel-img" onclick="abrirImagenGrande('${url.replace(/'/g, "\\'")}', '')">`
        )
        .join('')}
    </div>
  `;
}

function abrirDetalleMueble(id) {
  const mueble = MUEBLES.find((m) => m.id === id);
  if (!mueble) return;

  const body = document.getElementById('muebleModalBody');
  body.innerHTML = `
    ${crearMuebleCarouselHtml(mueble.fotos)}
    <div class="detail-header-row">
      <div>
        <span class="detail-category">${t('chipEstantes')}</span>
        <h2 class="detail-name">${mueble.nombre}</h2>
      </div>
    </div>
    ${mueble.descripcion ? `<p class="detail-desc">${mueble.descripcion}</p>` : ''}
    <button class="btn-primary" id="muebleSolicitarBtn">${t('muebleSolicitarBtn')}</button>
    <p id="muebleSolicitarMsg" class="hint-text hidden" style="color:#0F8A3D;"></p>
  `;

  const btn = document.getElementById('muebleSolicitarBtn');
  btn.onclick = () => solicitarInfoMueble(mueble.id, mueble.nombre, btn);

  abrirModal('muebleModal');
}

async function solicitarInfoMueble(muebleId, muebleNombre, btn) {
  const msgEl = document.getElementById('muebleSolicitarMsg');
  btn.disabled = true;
  btn.textContent = t('muebleSolicitarBtnLoading');

  const { error } = await supabaseClient.from('solicitudes_mueble').insert({
    mueble_id: muebleId,
    mueble_nombre: muebleNombre,
    user_id: usuarioActual?.id || null,
    cliente_nombre: perfilActual?.nombre || null,
    cliente_telefono: perfilActual?.telefono || null,
    cliente_email: usuarioActual?.email || null,
    tienda_nombre: perfilActual?.tienda_nombre || null,
  });

  if (error) {
    btn.disabled = false;
    btn.textContent = t('muebleSolicitarBtn');
    if (msgEl) {
      msgEl.textContent = t('muebleSolicitarError');
      msgEl.classList.remove('hidden');
      msgEl.style.color = '#c0392b';
    }
    return;
  }

  btn.textContent = t('muebleSolicitarOk');
  if (msgEl) {
    msgEl.textContent = t('muebleSolicitarConfirmacion');
    msgEl.classList.remove('hidden');
    msgEl.style.color = '#0F8A3D';
  }
}

// ============================================================
// RENDER: CATÁLOGO
// ============================================================
function renderCatalogo() {
  const wrap = document.getElementById('categoriesWrap');
  wrap.innerHTML = '';
  const texto = textoBusqueda.trim().toLowerCase();
  let algoRenderizado = false;

  // "Estantes" (muebles) es una sección aparte, no productos — se
  // resuelve sola y no sigue el flujo de abajo.
  if (categoriaActiva === 'Estantes') {
    const muebles = MUEBLES.filter((m) => !texto || (m.nombre || '').toLowerCase().includes(texto));
    if (muebles.length > 0) {
      wrap.appendChild(crearSeccionMuebles(muebles));
    } else {
      wrap.innerHTML = `<p class="empty-state">${t('emptyState')}</p>`;
    }
    return;
  }

  // Carrusel ambiental de Novedades — solo en la vista general ("Todas",
  // sin buscar). Se muestra ADEMÁS de su propio chip, no en vez de él.
  if (!texto && categoriaActiva === 'Todas') {
    const nuevos = PRODUCTOS.filter((p) => p.esNuevo);
    if (nuevos.length > 0) {
      wrap.appendChild(crearSeccionNovedades(nuevos));
      algoRenderizado = true;
    }
  }

  if (categoriaActiva === 'Novedades' || categoriaActiva === 'Populares' || categoriaActiva === 'Favoritos') {
    // "Novedades", "Populares" y "Favoritos" se comportan como una
    // categoría más (tarjeta completa con precio y botón Agregar), y
    // también respetan el buscador.
    const base =
      categoriaActiva === 'Novedades'
        ? PRODUCTOS.filter((p) => p.esNuevo)
        : categoriaActiva === 'Populares'
          ? PRODUCTOS.filter((p) => p.esHot)
          : PRODUCTOS.filter((p) => FAVORITOS.has(p.slug));
    const filtrados = base.filter((p) => coincideBusqueda(p, texto));
    if (filtrados.length > 0) {
      wrap.appendChild(crearSeccionGrid(labelChip(categoriaActiva), filtrados));
      algoRenderizado = true;
    }
  } else {
    const productosFiltrados = PRODUCTOS.filter((p) => {
      const coincideTexto = coincideBusqueda(p, texto);
      const coincideCategoria = categoriaActiva === 'Todas' || p.categoria === categoriaActiva;
      return coincideTexto && coincideCategoria;
    });

    getCategorias().forEach((categoria) => {
      const productosCategoria = productosFiltrados.filter((p) => p.categoria === categoria);
      if (productosCategoria.length === 0) return;
      algoRenderizado = true;
      wrap.appendChild(crearSeccionGrid(displayCategoria(categoria), productosCategoria));
    });
  }

  if (!algoRenderizado) {
    wrap.innerHTML = `<p class="empty-state">${t('emptyState')}</p>`;
  }
}

function crearTarjetaProducto(producto) {
  const noDisponible = producto.disponibleParaMiCadena === false;

  const card = document.createElement('div');
  card.className = 'card' + (noDisponible ? ' no-disponible' : '');

  const image = document.createElement('div');
  image.className = 'card-image';
  if (producto.foto) {
    image.style.background = '#fff';
    image.innerHTML = `<img src="${producto.foto}" alt="${producto.nombre}" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;">`;
  } else {
    image.style.background = `linear-gradient(135deg, ${producto.color}, #ffffff)`;
    image.innerHTML = `<span class="icon">${ICONOS_CATEGORIA[producto.categoria] || '🍞'}</span>`;
  }
  if (producto.esHot) {
    image.innerHTML += `<span class="card-hot-badge">${t('cardHotBadge')}</span>`;
  }
  if (producto.esNuevo) {
    image.innerHTML += `<span class="card-nuevo-badge">${t('cardNuevoBadge')}</span>`;
  }
  image.onclick = () => abrirDetalleProducto(producto.slug);

  const unidadLabel = producto.ventaPorCaja ? t('unidadCaja', producto.unidadesCaja) : t('unidadPieza');
  const esFavorito = FAVORITOS.has(producto.slug);
  const precioRevelado = PRECIOS_REVELADOS.has(producto.slug);
  const precioRowHtml = precioRevelado
    ? `<div style="text-align:right;">
        <span class="card-price">$${producto.precio.toFixed(2)}</span>
        <span class="card-price-unit">${unidadLabel}</span>
      </div>`
    : `<button type="button" class="card-price-oculto" data-revelar-precio="${producto.slug}">
        <span class="card-price-oculto-icon">👁</span>${t('tocaVerPrecio')}
      </button>`;
  const body = document.createElement('div');
  body.className = 'card-body';
  body.innerHTML = `
    <div class="card-category-row">
      <span class="card-category">${displayCategoria(producto.categoria)}</span>
      ${usuarioActual ? `<button type="button" class="card-heart-btn" data-favorito="${producto.slug}" aria-label="Favorito">${esFavorito ? '❤️' : '🤍'}</button>` : ''}
    </div>
    <span class="card-name">${producto.nombre}</span>
    <div class="card-price-row">
      ${precioRowHtml}
    </div>
  `;
  body.querySelector('.card-name').onclick = () => abrirDetalleProducto(producto.slug);

  const heartBtn = body.querySelector('[data-favorito]');
  if (heartBtn) {
    heartBtn.onclick = (e) => {
      e.stopPropagation();
      toggleFavorito(producto.slug, producto.nombre);
    };
  }

  const precioOcultoBtn = body.querySelector('[data-revelar-precio]');
  if (precioOcultoBtn) {
    precioOcultoBtn.onclick = (e) => {
      e.stopPropagation();
      revelarPrecioTarjeta(producto.slug, precioOcultoBtn.closest('.card-price-row'), unidadLabel);
    };
  }

  if (noDisponible) {
    // Sin botón de Agregar — solo un aviso. El producto sigue siendo
    // visible (y clicable para ver el detalle), pero no se puede pedir
    // porque no está autorizado para la cadena de este cliente.
    const aviso = document.createElement('span');
    aviso.className = 'card-no-disponible-label';
    aviso.textContent = t('cardNoDisponibleLabel');
    body.appendChild(aviso);
  } else {
    const btn = document.createElement('button');
    btn.className = 'card-add';
    btn.textContent = t('cardAdd');
    btn.onclick = () => {
      agregarAlCarrito(producto.slug);
      btn.textContent = t('cardAdded');
      setTimeout(() => (btn.textContent = t('cardAdd')), 1200);
    };
    body.appendChild(btn);
  }

  card.appendChild(image);
  card.appendChild(body);
  return card;
}

// Revela el precio de una tarjeta del catálogo al tocarlo — sustituye el
// chip "Toca para ver precio" por el precio real, sin volver a pintar
// todo el catálogo. Queda revelado solo durante esta visita (se reinicia
// al recargar la página) y registra el evento 'ver_precio' — junto con
// 'vista_producto' (abrir el detalle), le da al admin una señal de qué
// producto le interesa más a la gente sin estorbarle la compra.
function revelarPrecioTarjeta(slug, wrapEl, unidadLabel) {
  if (!wrapEl || PRECIOS_REVELADOS.has(slug)) return;
  const producto = PRODUCTOS.find((p) => p.slug === slug);
  if (!producto) return;
  PRECIOS_REVELADOS.add(slug);
  registrarEventoActividad('ver_precio', producto.nombre);
  wrapEl.innerHTML = `
    <div style="text-align:right;">
      <span class="card-price">$${producto.precio.toFixed(2)}</span>
      <span class="card-price-unit">${unidadLabel}</span>
    </div>
  `;
}

// ============================================================
// MODAL: DETALLE DE PRODUCTO
// ============================================================
function abrirDetalleProducto(slug) {
  const producto = PRODUCTOS.find((p) => p.slug === slug);
  if (!producto) return;
  registrarEventoActividad('vista_producto', producto.nombre);
  // Entrar al detalle también cuenta como "vio el precio" (aquí siempre
  // se muestra completo) — junto con tocar el precio en la tarjeta, es la
  // otra vía que cuenta para la señal 'ver_precio'.
  if (!PRECIOS_REVELADOS.has(slug)) {
    PRECIOS_REVELADOS.add(slug);
    registrarEventoActividad('ver_precio', producto.nombre);
  }

  const imagenHtml = producto.foto
    ? `<div class="detail-image" style="background:#fff;cursor:zoom-in;" onclick="abrirImagenGrande('${producto.foto.replace(/'/g, "\\'")}', '${producto.nombre.replace(/'/g, "\\'")}')"><img src="${producto.foto}" alt="${producto.nombre}" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;"></div>`
    : `<div class="detail-image" style="background:linear-gradient(135deg, ${producto.color}, #ffffff)"><span class="icon">${ICONOS_CATEGORIA[producto.categoria] || '🍞'}</span></div>`;

  // Código de barras escaneable (UPC-A de 12 dígitos), para que el cliente
  // pueda escanearlo directo en su tienda. Se dibuja con JsBarcode después
  // de insertar el HTML (necesita que el <svg> ya exista en el DOM).
  const barcodeHtml = producto.upcCompleto
    ? `<div class="detail-barcode-wrap"><svg id="detailBarcode"></svg></div>`
    : '';

  // "Datasheet" de unidades: piezas por caja, cajas por tarima y el total
  // de piezas por tarima (calculado). Si no hay datos, no se muestra nada.
  const uCaja = producto.unidadesCaja;
  const cPallet = producto.unidadesPallet;
  const datasheetHtml =
    uCaja || cPallet
      ? `
    <div class="detail-datasheet">
      <div class="datasheet-cell">
        <span class="datasheet-icon">📦</span>
        <span class="datasheet-value">${uCaja ?? '—'}</span>
        <span class="datasheet-label">${t('datasheetPiezasCaja')}</span>
      </div>
      <div class="datasheet-cell">
        <span class="datasheet-icon">🧱</span>
        <span class="datasheet-value">${cPallet ?? '—'}</span>
        <span class="datasheet-label">${t('datasheetCajasTarima')}</span>
      </div>
      <div class="datasheet-cell">
        <span class="datasheet-icon">🏗️</span>
        <span class="datasheet-value">${uCaja && cPallet ? uCaja * cPallet : '—'}</span>
        <span class="datasheet-label">${t('datasheetPiezasTarima')}</span>
      </div>
    </div>
  `
      : '';

  const unidadLabelDetalle = producto.ventaPorCaja
    ? t('detailPrecioCaja', producto.unidadesCaja)
    : t('detailPrecioPieza');

  const noDisponible = producto.disponibleParaMiCadena === false;

  // Lista de cadenas donde está autorizado — así el cliente ve que existen
  // más opciones en el catálogo, aunque su cadena no incluya este producto.
  const cadenasHtml =
    producto.cadenasPermitidas && producto.cadenasPermitidas.length
      ? `
    <div class="detail-cadenas">
      <span class="detail-cadenas-label">${t('detailCadenasTitulo')}</span>
      <div class="detail-cadenas-list">
        ${producto.cadenasPermitidas.map((c) => `<span class="cadena-chip">${labelCadena(c)}</span>`).join('')}
      </div>
    </div>
  `
      : '';

  const accionHtml = noDisponible
    ? `<p class="detail-no-disponible-msg">${t('detailNoDisponibleMsg')}</p>`
    : `<button class="btn-primary" id="detailAddBtn">${t('detailAddBtn')}</button>`;

  const esFavorito = FAVORITOS.has(producto.slug);
  const heartHtml = usuarioActual
    ? `<button type="button" class="detail-heart-btn" id="detailHeartBtn" data-slug="${producto.slug}" aria-label="Favorito">${esFavorito ? '❤️' : '🤍'}</button>`
    : '';

  const body = document.getElementById('productModalBody');
  body.innerHTML = `
    ${imagenHtml}
    <div class="detail-header-row">
      <div>
        <span class="detail-category">${displayCategoria(producto.categoria)}</span>
        ${producto.esHot ? `<span class="detail-hot-tag">${t('detailHotTag')}</span>` : ''}
        ${noDisponible ? `<span class="detail-lock-tag">${t('detailNoDisponibleTag')}</span>` : ''}
        ${heartHtml}
        <h2 class="detail-name">${producto.nombre}</h2>
      </div>
      <div>
        <p class="detail-price">$${producto.precio.toFixed(2)}</p>
        <p class="detail-price-unit">${unidadLabelDetalle}</p>
      </div>
    </div>
    ${barcodeHtml}
    ${datasheetHtml}
    ${cadenasHtml}
    ${accionHtml}
    <button class="btn-secondary" id="detailShareBtn" style="margin-top:8px;">${t('btnCompartir')}</button>
  `;

  const heartBtn = document.getElementById('detailHeartBtn');
  if (heartBtn) {
    heartBtn.onclick = () => toggleFavorito(producto.slug, producto.nombre);
  }
  document.getElementById('detailShareBtn').onclick = () => compartirProducto(producto);

  if (producto.upcCompleto && window.JsBarcode) {
    try {
      JsBarcode('#detailBarcode', producto.upcCompleto, {
        format: 'upc',
        displayValue: true,
        fontSize: 14,
        height: 55,
        margin: 8,
        width: 2,
      });
    } catch (err) {
      console.error('Error generando código de barras:', err);
    }
  }

  const detailAddBtn = document.getElementById('detailAddBtn');
  if (detailAddBtn) {
    detailAddBtn.onclick = (e) => {
      agregarAlCarrito(producto.slug);
      e.target.textContent = t('detailAdded');
      setTimeout(() => (e.target.textContent = t('detailAddBtn')), 1200);
    };
  }
  abrirModal('productModal');
}

// ============================================================
// COMPARTIR PRODUCTO — usa el selector nativo del teléfono (WhatsApp,
// SMS, lo que tenga instalado el cliente) vía la Web Share API. En
// desktop, donde no siempre existe, cae a copiar el enlace al
// portapapeles. El enlace lleva un ?p=<upc> que abre el detalle de este
// producto directo al cargar (ver capturarProductoCompartido() arriba),
// incluso si quien lo recibe todavía no tiene sesión iniciada.
// ============================================================
function urlProducto(slug) {
  return `${location.origin}${location.pathname}?p=${encodeURIComponent(slug)}`;
}

async function compartirProducto(producto) {
  const url = urlProducto(producto.slug);
  const titulo = `${producto.nombre} — Catálogo Bimbo`;

  if (navigator.share) {
    try {
      await navigator.share({ title: titulo, url });
    } catch {
      // el usuario cerró el selector sin elegir nada — no es un error
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    alert(t('enlaceCopiado'));
  } catch {
    window.open(`https://wa.me/?text=${encodeURIComponent(titulo + ' ' + url)}`, '_blank');
  }
}

// ============================================================
// MODAL: CARRITO / CHECKOUT
// ============================================================
function renderCartModal() {
  const body = document.getElementById('cartModalBody');

  if (carrito.length === 0) {
    body.innerHTML = `<p class="empty-state">${t('cartEmpty')}</p>`;
    return;
  }

  const filas = carrito
    .map(
      (item) => `
      <div class="cart-row" data-slug="${item.slug}">
        <span class="cart-row-name">${item.nombre}<br><small class="cart-row-unidad">${item.unidad === 'caja' ? t('cartRowCaja') : t('cartRowPieza')}</small></span>
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
    <h2>${t('cartTitle')}</h2>
    ${filas}
    <div class="cart-total"><span>${t('cartTotal')}</span><strong>$${totalCarrito().toFixed(2)}</strong></div>
    <div id="checkoutFormWrap">
      <input class="form-field" id="inputTienda" placeholder="${t('regTiendaPh')}" value="${perfilActual?.tienda_nombre || ''}" />
      <input class="form-field" id="inputNombre" placeholder="${t('regNombrePh')}" value="${perfilActual?.nombre || ''}" />
      <input class="form-field" id="inputTelefono" placeholder="${t('regTelefonoPh')}" value="${perfilActual?.telefono || ''}" />
      <input class="form-field" id="inputDireccion" placeholder="${t('regDireccionPh')}" value="${perfilActual?.direccion || ''}" />
      <div class="form-row">
        <input class="form-field" id="inputCiudad" placeholder="${t('regCiudadPh')}" value="${perfilActual?.ciudad || ''}" />
        <select class="form-field" id="inputEstado">
          <option value="">${t('regEstadoPh')}</option>
          ${ESTADOS_SERVICIO.map((e) => `<option value="${e.valor}" ${perfilActual?.estado === e.valor ? 'selected' : ''}>${e.valor} — ${e.nombre}</option>`).join('')}
        </select>
        <input class="form-field" id="inputZip" placeholder="${t('regZipPh')}" inputmode="numeric" maxlength="5" value="${perfilActual?.zip || ''}" />
      </div>
      <textarea class="form-field" id="inputNotas" placeholder="${t('regNotasPh')}" rows="2"></textarea>
      <p id="checkoutError" class="error-text hidden">${t('checkoutErrorMsg')}</p>
      <button class="btn-primary" id="enviarPedidoBtn">${t('enviarPedidoBtn')}</button>
      <p class="hint-text">${t('checkoutHint')}</p>
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
    `Tienda: ${cliente.tienda}`,
    `Solicita: ${cliente.nombre}`,
    `Teléfono: ${cliente.telefono}`,
    `Dirección: ${cliente.direccion}, ${cliente.ciudad}, ${cliente.estado} ${cliente.zip}`,
    cliente.notas ? `Notas: ${cliente.notas}` : null,
    '',
    ...carrito.map((i) => `• ${i.nombre} x${i.cantidad} ${i.unidad === 'caja' ? 'caja(s)' : 'pieza(s)'} - $${(i.precio * i.cantidad).toFixed(2)}`),
    '',
    `Total: $${totalCarrito().toFixed(2)}`,
  ].filter(Boolean);
  return lineas.join('\n');
}

async function enviarPedido() {
  const tienda = document.getElementById('inputTienda').value.trim();
  const nombre = document.getElementById('inputNombre').value.trim();
  const telefono = document.getElementById('inputTelefono').value.trim();
  const direccion = document.getElementById('inputDireccion').value.trim();
  const ciudad = document.getElementById('inputCiudad').value.trim();
  const estado = document.getElementById('inputEstado').value.trim();
  const zip = document.getElementById('inputZip').value.trim();
  const notas = document.getElementById('inputNotas').value.trim();
  const errorEl = document.getElementById('checkoutError');
  const btn = document.getElementById('enviarPedidoBtn');

  if (!tienda || !nombre || !telefono || !direccion || !ciudad || !estado || !zip) {
    errorEl.classList.remove('hidden');
    return;
  }
  errorEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = t('enviarPedidoBtnLoading');

  const cliente = { tienda, nombre, telefono, direccion, ciudad, estado, zip, notas };
  const mensaje = construirMensajePedido(cliente);

  // 1) Guardar el pedido en Supabase — esto es lo que hace que el
  // pedido quede "completo" (el admin lo ve y recibe notificación).
  if (supabaseClient) {
    try {
      await supabaseClient.from('pedidos').insert({
        user_id: usuarioActual?.id,
        cliente_email: usuarioActual?.email || null,
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        cliente_direccion: direccion,
        cliente_ciudad: ciudad,
        cliente_estado: estado,
        cliente_zip: zip,
        tienda_nombre: tienda,
        cliente_notas: notas || null,
        items: carrito,
        total: totalCarrito(),
        idioma: obtenerIdioma(),
      });
    } catch (err) {
      console.error('Error guardando pedido en Supabase:', err);
    }
  }

  // 2) Correo al admin (si está configurado EmailJS). Tampoco es
  // requisito para completar el pedido.
  if (CONFIG.EMAILJS_PUBLIC_KEY && CONFIG.EMAILJS_SERVICE_ID && CONFIG.EMAILJS_TEMPLATE_ID) {
    try {
      emailjs.init(CONFIG.EMAILJS_PUBLIC_KEY);
      await emailjs.send(CONFIG.EMAILJS_SERVICE_ID, CONFIG.EMAILJS_TEMPLATE_ID, {
        to_email: CONFIG.ORDER_EMAIL_TO,
        cliente_nombre: nombre,
        cliente_telefono: telefono,
        cliente_direccion: `${direccion}, ${ciudad}, ${estado} ${zip}`,
        tienda_nombre: tienda,
        cliente_notas: notas || '-',
        pedido_detalle: mensaje,
        pedido_total: totalCarrito().toFixed(2),
      });
    } catch (err) {
      console.error('Error enviando correo (EmailJS):', err);
    }
  }

  // WhatsApp NO se abre solo — el pedido ya quedó completo arriba.
  // Queda como botón opcional en la confirmación por si el cliente
  // quiere compartirlo con alguien más.
  vaciarCarrito();
  mostrarConfirmacion(mensaje);
}

function mostrarConfirmacion(mensaje) {
  const body = document.getElementById('cartModalBody');
  const botonWhatsapp = CONFIG.WHATSAPP_NUMBER
    ? `<button class="btn-secondary" id="compartirWhatsappBtn">${t('compartirWhatsapp')}</button>`
    : '';

  body.innerHTML = `
    <div class="confirm-state">
      <div class="confirm-icon">✓</div>
      <h3>${t('confirmTitulo')}</h3>
      <p>${t('confirmSub')}</p>
      ${botonWhatsapp}
      <button class="btn-primary" data-close="cartModal">${t('seguirViendoCatalogo')}</button>
    </div>
  `;

  if (CONFIG.WHATSAPP_NUMBER) {
    document.getElementById('compartirWhatsappBtn').addEventListener('click', () => {
      const url = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`;
      window.open(url, '_blank');
    });
  }
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

// Ver la foto del producto en grande (sin recortar), al hacer clic sobre ella
// en el detalle del producto.
function abrirImagenGrande(url, nombre) {
  const img = document.getElementById('imageZoomImg');
  img.src = url;
  img.alt = nombre || '';
  abrirModal('imageZoomModal');
}

// ============================================================
// TEXTOS FIJOS — se aplican una sola vez al cargar la página, en el
// idioma que el usuario tenga elegido (guardado en localStorage). Para
// cambiar de idioma, el toggle en el menú de perfil recarga la página
// (ver i18n.js / profile-menu.js), así que no hace falta re-aplicar
// esto en caliente.
// ============================================================
function aplicarTraduccionesEstaticas() {
  document.documentElement.lang = obtenerIdioma();

  document.getElementById('authTabLogin').textContent = t('authTabLogin');
  document.getElementById('authTabRegistro').textContent = t('authTabRegistro');
  document.getElementById('loginEmail').placeholder = t('loginEmailPh');
  document.getElementById('loginPassword').placeholder = t('loginPasswordPh');
  document.getElementById('loginBtn').textContent = t('loginBtn');

  document.getElementById('regTienda').placeholder = t('regTiendaPh');
  document.getElementById('regNombre').placeholder = t('regNombrePh');
  document.getElementById('regTelefono').placeholder = t('regTelefonoPh');
  document.getElementById('regDireccion').placeholder = t('regDireccionPh');
  document.getElementById('regCiudad').placeholder = t('regCiudadPh');
  document.getElementById('regEstadoDefault').textContent = t('regEstadoPh');
  document.getElementById('regZip').placeholder = t('regZipPh');
  document.getElementById('regCadenaDefault').textContent = t('regCadenaDefault');
  document.getElementById('regEmail').placeholder = t('regEmailPh');
  document.getElementById('regPassword').placeholder = t('regPasswordPh');
  document.getElementById('registroBtn').textContent = t('registroBtn');
  document.getElementById('registroExitosoTitulo').textContent = t('registroExitosoTitulo');
  document.getElementById('volverALoginBtn').textContent = t('volverALoginBtn');

  document.getElementById('pendienteTitulo').textContent = t('pendienteTitulo');
  document.getElementById('pendienteRefrescarBtn').textContent = t('pendienteRefrescarBtn');
  document.getElementById('pendienteLogoutBtn').textContent = t('pendienteLogoutBtn');

  document.getElementById('cartBtnLabel').textContent = t('cartBtnLabel');
  document.getElementById('profileLinkPedidos').textContent = t('profileLinkPedidos');
  document.getElementById('profileLinkMisPedidos').textContent = t('profileLinkMisPedidos');
  document.getElementById('profileLinkCatalogo').textContent = t('profileLinkCatalogo');
  document.getElementById('profileLogoutBtn').textContent = t('profileLogoutBtn');

  document.getElementById('heroEyebrow').textContent = t('heroEyebrow');
  document.getElementById('heroTitle').innerHTML = t('heroTitle');
  document.getElementById('searchInput').placeholder = t('searchPh');
}

// ============================================================
// INICIALIZACIÓN
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  aplicarTraduccionesEstaticas();

  // Opciones de Estado y Cadena en el formulario de registro
  document.getElementById('regEstado').innerHTML +=
    ESTADOS_SERVICIO.map((e) => `<option value="${e.valor}">${e.valor} — ${e.nombre}</option>`).join('');
  document.getElementById('regCadena').innerHTML += CADENAS.map((c) => `<option value="${c}">${labelCadena(c)}</option>`).join('');

  document.querySelectorAll('.auth-tab').forEach((btn) => {
    btn.addEventListener('click', () => cambiarTabAuth(btn.dataset.tab));
  });
  document.getElementById('loginBtn').addEventListener('click', iniciarSesion);
  document.getElementById('loginPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') iniciarSesion();
  });
  document.getElementById('registroBtn').addEventListener('click', registrarse);
  document.getElementById('volverALoginBtn').addEventListener('click', () => {
    document.getElementById('registroExitosoView').classList.add('hidden');
    document.querySelector('.auth-tabs').classList.remove('hidden');
    cambiarTabAuth('login');
  });
  document.getElementById('pendienteLogoutBtn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    location.reload();
  });
  document.getElementById('pendienteRefrescarBtn').addEventListener('click', async () => {
    document.getElementById('pendienteView').classList.add('hidden');
    await cargarPerfilYEntrar();
  });

  mostrarSegunSesion();

  document.getElementById('searchInput').addEventListener('input', (e) => {
    textoBusqueda = e.target.value;
    renderCatalogo();
    registrarBusquedaConDebounce(textoBusqueda);
  });

  document.getElementById('cartBtn').addEventListener('click', () => {
    renderCartModal();
    abrirModal('cartModal');
    ocultarRecordatorioCarrito();
    clearTimeout(timerRecordatorioCarrito);
  });

  document.getElementById('cartReminderBtn').addEventListener('click', () => {
    ocultarRecordatorioCarrito();
    renderCartModal();
    abrirModal('cartModal');
  });
  document.getElementById('cartReminderCloseBtn').addEventListener('click', () => {
    ocultarRecordatorioCarrito();
    reiniciarTimerRecordatorioCarrito();
  });

  // Cualquier interacción reinicia el reloj de inactividad — el aviso
  // solo debe aparecer tras un rato REAL sin uso, no apenas se cierra.
  ['click', 'keydown', 'scroll', 'touchstart'].forEach((evento) => {
    document.addEventListener(evento, () => reiniciarTimerRecordatorioCarrito(), { passive: true });
  });

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => cerrarModal(btn.dataset.close));
  });

  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') registrarDuracionSesion();
  });
});
