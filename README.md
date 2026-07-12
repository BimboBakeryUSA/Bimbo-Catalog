# Catálogo Bimbo

Catálogo web público de productos Bimbo. App estática (sin build, sin npm):
`index.html` (catálogo) + `admin.html` (panel de pedidos) + `config.js` +
`app.js` + `admin.js` + `styles.css`.

El catálogo ahora requiere cuenta. Un cliente nuevo se registra una vez
con: nombre de la tienda, nombre de quien solicita, teléfono, dirección,
ciudad, estado (MD/DC/VA/DE) y ZIP, más correo/contraseña. Esos datos
quedan guardados en su perfil y el formulario de pedido llega **prellenado**
cada vez (sigue siendo editable por si un pedido puntual cambia algo). El
pedido queda completo en cuanto se guarda en **Supabase** (y se manda copia
por correo si configuraste EmailJS) — compartirlo por WhatsApp es un botón
opcional en la confirmación, no bloquea nada.

Cuando alguien se registra, su cuenta queda **pendiente de aprobación** —
ve una pantalla de "un momento..." y no puede usar el catálogo hasta que tú
la apruebes. En `admin.html` hay una pestaña **Usuarios** (con contador de
pendientes) donde puedes Aprobar, Rechazar, o **Hacer admin** a cualquier
cliente aprobado. Esa lista también se actualiza sola si abres/cierras
cuentas desde otro lado.

Cada cliente puede ver su propio historial en **Mis pedidos**
(`mis-pedidos.html`), con el estado actualizándose en vivo cuando el admin
lo marca como visto/completado. Tú, como admin, ves todos los pedidos en
`admin.html` con notificación en tiempo real (sonido + aviso en pantalla +
título de la pestaña).

El ícono de perfil (arriba a la derecha) aparece para cualquier cuenta con
sesión iniciada — admin ve "Ver pedidos", clientes ven "Mis pedidos", y
ambos pueden volver al "Catálogo" o cerrar sesión desde ahí. Si alguien sin
permisos de admin intenta entrar a `admin.html`, se le rechaza con un
mensaje y se cierra su sesión ahí.

### Nota sobre confirmación de correo

Por default, Supabase pide confirmar el correo antes de poder iniciar
sesión (le manda un correo automático al cliente con un link). Si prefieres
que el registro sea instantáneo (sin ese paso), entra al dashboard de
Supabase → proyecto **catalogo-bimbo** → **Authentication → Providers →
Email** y desactiva "Confirm email". Esto no lo puedo cambiar yo desde aquí
(es un ajuste del dashboard, no de la base de datos).

## 1. Proyecto de Supabase

Ya está creado y conectado en `config.js` — proyecto **catalogo-bimbo**
(separado del de Bimbo Inventory Pro), con la tabla `pedidos` y RLS:
cualquiera puede crear un pedido (insert), pero solo un admin con sesión
iniciada puede ver o actualizar pedidos (select/update).

### Crear tu usuario admin

1. Entra a [supabase.com/dashboard](https://supabase.com/dashboard) → proyecto
   **catalogo-bimbo** → **Authentication → Users → Add user**.
2. Pon tu correo y una contraseña, y marca **Auto Confirm User** (para no
   depender de un correo de verificación).
3. Con ese correo/contraseña entras en `admin.html`.

## 2. Configurar WhatsApp / EmailJS (opcional)

Edita el bloque `CONFIG` en `config.js`:

```js
const CONFIG = {
  WHATSAPP_NUMBER: '5215512345678',   // tu número, solo dígitos
  EMAILJS_PUBLIC_KEY: '...',
  EMAILJS_SERVICE_ID: '...',
  EMAILJS_TEMPLATE_ID: '...',
  ORDER_EMAIL_TO: 'tu-correo@ejemplo.com',
  // SUPABASE_URL / SUPABASE_ANON_KEY ya están configurados
};
```

Si dejas EmailJS vacío, el pedido igual queda guardado en Supabase y se
abre WhatsApp — nada se rompe.

## 3. Probar en local

Abre `index.html` para el catálogo, o sirve la carpeta:

```bash
npx serve .
```

Panel de pedidos: abre `admin.html` (o el link "Acceso admin" al pie del
catálogo) e inicia sesión con tu usuario admin.

## 4. Hostear / publicar

Cualquier hosting estático sirve: GitHub Pages, Vercel (proyecto estático),
Netlify, etc. No requiere build ni servidor.

## 5. Estructura

```
index.html      ← catálogo (requiere cuenta: login/registro incluidos)
admin.html      ← panel de pedidos del admin (requiere login)
mis-pedidos.html← historial de pedidos del cliente logueado
config.js       ← configuración compartida (WhatsApp, EmailJS, Supabase)
profile-menu.js ← menú de perfil arriba a la derecha (compartido)
app.js          ← catálogo, auth de cliente, carrito/checkout prellenado
admin.js        ← login admin, lista de pedidos, notificación en tiempo real
mis-pedidos.js  ← historial de pedidos propio (solo lectura)
styles.css      ← estilos (colores de marca Bimbo)
```

## 6. Siguientes pasos

- **Fotos reales**: cambiar los íconos/gradientes por `<img>` apuntando a
  Supabase Storage cuando tengas las imágenes.
- **Productos desde Supabase**: reemplazar el arreglo `PRODUCTOS` en
  `app.js` por una tabla `productos` en el mismo proyecto, para editarlos
  sin tocar código.
- Exportar pedidos a CSV/WhatsApp consolidado desde el panel admin.
