// Menú de perfil compartido (index.html y admin.html).
// Solo se muestra si hay una sesión de Supabase activa (admin logueado).
// Requiere que config.js ya haya corrido (supabaseClient disponible).

async function initProfileMenu({ linkPedidos = false, linkCatalogo = false, onLogout } = {}) {
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

  const btn = document.getElementById('profileBtn');
  const dropdown = document.getElementById('profileDropdown');

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
