// ============================================================
// CONFIGURACIÓN COMPARTIDA — usada por app.js (catálogo) y
// admin.js (panel de pedidos). Edita estos valores con los tuyos.
// ============================================================
const CONFIG = {
  // Número de WhatsApp donde llegarán los pedidos (formato internacional,
  // solo dígitos, sin espacios ni signos). Ej: 5215512345678
  WHATSAPP_NUMBER: '5210000000000',

  // EmailJS (https://www.emailjs.com) — plan gratis, sin backend propio.
  // Crea una cuenta, un "Email Service" y una plantilla, y pon aquí tus IDs.
  EMAILJS_PUBLIC_KEY: '',
  EMAILJS_SERVICE_ID: '',
  EMAILJS_TEMPLATE_ID: '',
  ORDER_EMAIL_TO: 'tu-correo@ejemplo.com',

  // Supabase (proyecto "catalogo-bimbo") — guarda cada pedido para que
  // puedas verlo (y recibir notificación) desde admin.html. La anon key
  // es pública/segura de exponer en el navegador: los permisos reales
  // los controlan las políticas RLS en la base de datos.
  SUPABASE_URL: 'https://zzoyblybwkxbitbvusfc.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6b3libHlid2t4Yml0YnZ1c2ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4MDc4MjgsImV4cCI6MjA5OTM4MzgyOH0.5aYA67sT5gHbS6bgvaT5Q1zMuvtAvmb3nwLxLf3U_KU',
};

const supabaseClient = window.supabase
  ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
  : null;

// Estados que se atienden (usado en registro, checkout y filtros de admin).
const ESTADOS_SERVICIO = [
  { valor: 'MD', nombre: 'Maryland' },
  { valor: 'DC', nombre: 'Washington D.C.' },
  { valor: 'VA', nombre: 'Virginia' },
  { valor: 'DE', nombre: 'Delaware' },
];
