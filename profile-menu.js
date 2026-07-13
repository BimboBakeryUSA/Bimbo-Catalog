// Menú de perfil compartido (index.html y admin.html).
// Solo se muestra si hay una sesión de Supabase activa (admin logueado).
// Requiere que config.js ya haya corrido (supabaseClient disponible).

async function initProfileMenu({ linkPedidos = false, linkCatalogo = false, linkMisPedidos = false, onLogout } = {}) {
  const wrap = document.getElementById('profileWrap');
  if (!wrap || !supabaseClient) return;

  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) {
    wrap.classList.add('hidden');
    return;
  }

  wrap.classList.remove('hidden');

  const emailEl = document.getElementById('profileEmail');
  if (emailEl) emailEl.textContent = data.session.user.email || '';

  const linkPedidosEl = document.getElementById('profileLinkPedidos');
  if (linkPedidosEl) linkPedidosEl.classList.toggle('hidden', !linkPedidos);

  const linkCatalogoEl = document.getElementById('profileLinkCatalogo');
  if (linkCatalogoEl) linkCatalogoEl.classList.toggle('hidden', !linkCatalogo);

  const linkMisPedidosEl = document.getElementById('profileLinkMisPedidos');
  if (linkMisPedidosEl) linkMisPedidosEl.classList.toggle('hidden', !linkMisPedidos);

  const btn = document.getElementById('profileBtn');
  const dropdown = document.getElementById('profileDropdown');

  // "Mi perfil" se agrega por código (no está en el HTML de cada página)
  // para que funcione en catálogo, admin y mis-pedidos sin duplicar markup.
  let linkPerfilEl = document.getElementById('profileLinkPerfil');
  if (!linkPerfilEl) {
    linkPerfilEl = document.createElement('button');
    linkPerfilEl.id = 'profileLinkPerfil';
    linkPerfilEl.type = 'button';
    linkPerfilEl.textContent = 'Mi perfil';
    if (emailEl && emailEl.nextSibling) {
      dropdown.insertBefore(linkPerfilEl, emailEl.nextSibling);
    } else {
      dropdown.appendChild(linkPerfilEl);
    }
  }
  linkPerfilEl.onclick = () => {
    dropdown.classList.add('hidden');
    abrirModalPerfil();
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) dropdown.classList.add('hidden');
  });

  const logoutBtn = document.getElementById('profileLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      if (onLogout) onLogout();
    });
  }
}

// ============================================================
// MODAL: MI PERFIL — ver y editar mis datos (tienda, nombre, teléfono,
// dirección, ciudad, estado, zip). Se construye por código para que
// funcione igual en catálogo, admin y mis-pedidos sin tocar cada HTML.
// ============================================================
function asegurarModalPerfil() {
  if (document.getElementById('perfilModal')) return;

  const modal = document.createElement('div');
  modal.id = 'perfilModal';
  modal.className = 'modal hidden';
  modal.innerHTML = `
    <div class="modal-card">
      <button class="modal-close" type="button" id="perfilModalCerrar">✕</button>
      <h2 style="margin:0 0 16px;">Mi perfil</h2>
      <input class="form-field" id="perfilTienda" placeholder="Nombre de la tienda" />
      <input class="form-field" id="perfilNombre" placeholder="Nombre de quien solicita" />
      <input class="form-field" id="perfilTelefono" placeholder="Teléfono" />
      <input class="form-field" id="perfilDireccion" placeholder="Dirección" />
      <div class="form-row">
        <input class="form-field" id="perfilCiudad" placeholder="Ciudad" />
        <select class="form-field" id="perfilEstado">
          <option value="">Estado</option>
        </select>
        <input class="form-field" id="perfilZip" placeholder="ZIP" inputmode="numeric" maxlength="5" />
      </div>
      <p id="perfilError" class="error-text hidden"></p>
      <p id="perfilOk" class="hint-text hidden" style="color:#0F8A3D;">✓ Datos guardados.</p>
      <button class="btn-primary" id="perfilGuardarBtn">Guardar cambios</button>
    </div>
  `;
  document.body.appendChild(modal);

  const selectEstado = document.getElementById('perfilEstado');
  selectEstado.insertAdjacentHTML(
    'beforeend',
    (typeof ESTADOS_SERVICIO !== 'undefined' ? ESTADOS_SERVICIO : [])
      .map((e) => `<option value="${e.valor}">${e.valor} — ${e.nombre}</option>`)
      .join('')
  );

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
  document.getElementById('perfilModalCerrar').addEventListener('click', () => modal.classList.add('hidden'));
  document.getElementById('perfilGuardarBtn').addEventListener('click', guardarPerfilPropio);
}

async function abrirModalPerfil() {
  asegurarModalPerfil();

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { data: perfil } = await supabaseClient.from('profiles').select('*').eq('id', user.id).maybeSingle();

  document.getElementById('perfilTienda').value = perfil?.tienda_nombre || '';
  document.getElementById('perfilNombre').value = perfil?.nombre || '';
  document.getElementById('perfilTelefono').value = perfil?.telefono || '';
  document.getElementById('perfilDireccion').value = perfil?.direccion || '';
  document.getElementById('perfilCiudad').value = perfil?.ciudad || '';
  document.getElementById('perfilEstado').value = perfil?.estado || '';
  document.getElementById('perfilZip').value = perfil?.zip || '';
  document.getElementById('perfilError').classList.add('hidden');
  document.getElementById('perfilOk').classList.add('hidden');

  const btn = document.getElementById('perfilGuardarBtn');
  btn.dataset.userId = user.id;
  btn.disabled = false;
  btn.textContent = 'Guardar cambios';

  document.getElementById('perfilModal').classList.remove('hidden');
}

async function guardarPerfilPropio() {
  const btn = document.getElementById('perfilGuardarBtn');
  const userId = btn.dataset.userId;
  const errorEl = document.getElementById('perfilError');
  const okEl = document.getElementById('perfilOk');

  const cambios = {
    tienda_nombre: document.getElementById('perfilTienda').value.trim(),
    nombre: document.getElementById('perfilNombre').value.trim(),
    telefono: document.getElementById('perfilTelefono').value.trim(),
    direccion: document.getElementById('perfilDireccion').value.trim(),
    ciudad: document.getElementById('perfilCiudad').value.trim(),
    estado: document.getElementById('perfilEstado').value.trim(),
    zip: document.getElementById('perfilZip').value.trim(),
  };

  if (
    !cambios.tienda_nombre ||
    !cambios.nombre ||
    !cambios.telefono ||
    !cambios.direccion ||
    !cambios.ciudad ||
    !cambios.estado ||
    !cambios.zip
  ) {
    errorEl.textContent = 'Completa todos los campos.';
    errorEl.classList.remove('hidden');
    okEl.classList.add('hidden');
    return;
  }
  errorEl.classList.add('hidden');

  btn.disabled = true;
  btn.textContent = 'Guardando...';
  const { error } = await supabaseClient.from('profiles').update(cambios).eq('id', userId);
  btn.disabled = false;
  btn.textContent = 'Guardar cambios';

  if (error) {
    errorEl.textContent = 'No se pudo guardar: ' + error.message;
    errorEl.classList.remove('hidden');
    return;
  }
  okEl.classList.remove('hidden');
  setTimeout(() => {
    okEl.classList.add('hidden');
  }, 2500);
}
