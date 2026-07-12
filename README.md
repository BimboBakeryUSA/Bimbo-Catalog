# Catálogo Bimbo

Catálogo web público de productos Bimbo. App estática de un solo archivo
(sin build, sin npm) — mismo patrón que Bimbo Inventory Pro: `index.html` +
`app.js` + `styles.css`, fácil de editar y hostear en cualquier lado.

El cliente navega productos por categoría, busca, arma un pedido (carrito
simple) y lo envía por **WhatsApp** y **correo** (vía EmailJS, sin backend
propio). Los productos son datos de ejemplo en `app.js` (arreglo `PRODUCTOS`)
— reemplázalos cuando conectes Supabase.

## 1. Configurar (edita el bloque `CONFIG` en `app.js`)

```js
const CONFIG = {
  WHATSAPP_NUMBER: '5215512345678',   // tu número, solo dígitos
  EMAILJS_PUBLIC_KEY: '...',
  EMAILJS_SERVICE_ID: '...',
  EMAILJS_TEMPLATE_ID: '...',
  ORDER_EMAIL_TO: 'tu-correo@ejemplo.com',
};
```

### EmailJS (para que el pedido te llegue por correo)

1. Crea una cuenta gratis en [emailjs.com](https://www.emailjs.com) (200
   correos/mes gratis).
2. Agrega un **Email Service** (ej. conecta tu Gmail).
3. Crea una **Email Template** con variables: `to_email`, `cliente_nombre`,
   `cliente_telefono`, `cliente_direccion`, `cliente_notas`,
   `pedido_detalle`, `pedido_total`.
4. Copia el Public Key (Account → API Keys), el Service ID y el Template ID
   a `CONFIG` en `app.js`.

Si dejas estos campos vacíos, el correo simplemente no se envía, pero el
pedido igual se abre en WhatsApp — nada se rompe.

## 2. Probar en local

Solo abre `index.html` en el navegador, o sirve la carpeta con cualquier
servidor estático:

```bash
npx serve .
```

## 3. Hostear / publicar

Cualquier hosting estático sirve: GitHub Pages, Vercel (como proyecto
estático), Netlify, etc. No requiere build ni servidor.

## 4. Estructura

```
index.html   ← estructura de la página y modales
styles.css   ← estilos con los colores de marca Bimbo
app.js       ← productos, carrito, checkout, envío (WhatsApp + EmailJS)
```

## 5. Siguientes pasos

- **Conectar Supabase**: reemplazar el arreglo `PRODUCTOS` en `app.js` por
  una consulta a las tablas `categories`/`products` (mismo proyecto que el
  admin-dashboard / Bimbo Inventory Pro), usando el cliente `supabase-js`
  vía CDN igual que se hizo ahí.
- **Fotos reales**: cambiar los bloques de color por `<img>` apuntando a
  Supabase Storage cuando tengas las imágenes.
- Paginación / más categorías si el catálogo crece.
