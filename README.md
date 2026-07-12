# Catálogo Bimbo

Catálogo web público de productos Bimbo. App estática (sin build, sin npm):
`index.html` (catálogo) + `admin.html` (panel de pedidos) + `config.js` +
`app.js` + `admin.js` + `styles.css`.

El cliente navega productos, arma un pedido y llena: nombre de la tienda,
nombre de quien solicita, teléfono, dirección, ciudad, estado (MD/DC/VA/DE)
y ZIP — todos obligatorios. El pedido queda completo en cuanto se guarda en
**Supabase** (y se manda copia por correo si configuraste EmailJS) —
compartirlo por WhatsApp es un botón opcional en la pantalla de
confirmación, no bloquea nada. Tú, como admin, lo ves en `admin.html` con
notificación en tiempo real (sonido + aviso en pantalla + título de la
pestaña) apenas entra.

`admin.html` ya no tiene link visible desde el catálogo público — entra
directo a esa URL cuando la necesites. Una vez que inicias sesión ahí,
aparece un ícono de perfil arriba a la derecha (también en el catálogo, si
navegas de vuelta con la sesión activa) con un menú para alternar entre
**Catálogo** y **Ver pedidos**, y cerrar sesión. Si no hay sesión iniciada
(un cliente normal), ese ícono no aparece en ningún lado.

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
index.html      ← catálogo público
admin.html      ← panel de pedidos (requiere login)
config.js       ← configuración compartida (WhatsApp, EmailJS, Supabase)
profile-menu.js ← menú de perfil arriba a la derecha (compartido)
app.js          ← lógica del catálogo/carrito/checkout
admin.js        ← login, lista de pedidos, notificación en tiempo real
styles.css      ← estilos (colores de marca Bimbo)
```

## 6. Siguientes pasos

- **Fotos reales**: cambiar los íconos/gradientes por `<img>` apuntando a
  Supabase Storage cuando tengas las imágenes.
- **Productos desde Supabase**: reemplazar el arreglo `PRODUCTOS` en
  `app.js` por una tabla `productos` en el mismo proyecto, para editarlos
  sin tocar código.
- Exportar pedidos a CSV/WhatsApp consolidado desde el panel admin.
