(() => {
  const authMenu = document.getElementById('authMenu');
  const navSearchBtn = document.getElementById('navSearchBtn');
  const navSearchBar = document.getElementById('navSearchBar');
  const navSearchInput = document.getElementById('navSearchInput');
  const navSearchCancel = document.getElementById('navSearchCancel');
  const cartBadge = document.getElementById('cartBadge');
  const profileIcon = document.getElementById('profileIcon');
  const authButtons = document.getElementById('authButtons');
  const footerYear = document.getElementById('footer-year');

  function getToken() {
    return localStorage.getItem('token') || localStorage.getItem('bearerToken')?.replace(/^Bearer\s+/,'');
  }

  function isAdmin() {
    return localStorage.getItem('isAdmin') === '1' || localStorage.getItem('isAdmin') === 'true';
  }

  function renderAuthNav() {
    const hasAuth = !!getToken() || localStorage.getItem('isLogin') === 'true';
    if (!authButtons || !authMenu) return;
    if (hasAuth) {
      authMenu.innerHTML = '';
      authButtons.innerHTML = `
        ${isAdmin() ? '<a href="/dashboard/index.html" class="px-5 py-2 rounded-full text-sm font-semibold transition shadow-lg shadow-cyan-500/20 cta-primary">Dashboard</a>' : ''}
        <button onclick="logout()" class="px-4 py-2 rounded-full border text-sm transition cta-ghost">Logout</button>
      `;
      profileIcon?.classList.remove('hidden');
    } else {
      authMenu.innerHTML = '';
      authButtons.innerHTML = `
        <a href="/login/index.html" class="px-5 py-2 rounded-full text-sm font-semibold transition shadow-lg shadow-cyan-500/20 cta-primary">Login</a>
        <a href="/register/index.html" class="px-5 py-2 rounded-full border text-sm transition cta-ghost">Register</a>
      `;
      profileIcon?.classList.add('hidden');
    }
  }

  function updateCartBadge() {
    if (!cartBadge) return;
    try {
      const cart = JSON.parse(localStorage.getItem('cart') || '[]');
      const count = cart.reduce((sum, item) => sum + (item.qty || 0), 0);
      if (count > 0) {
        cartBadge.textContent = count;
        cartBadge.classList.remove('hidden');
      } else {
        cartBadge.classList.add('hidden');
      }
    } catch {
      cartBadge.classList.add('hidden');
    }
  }
  window.updateCartBadge = updateCartBadge;

  window.logout = function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('bearerToken');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('isLogin');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    window.location.href = '/login/index.html';
  };

  function bindSearch() {
    navSearchBtn?.addEventListener('click', () => {
      navSearchBar?.classList.remove('hidden');
      navSearchInput?.focus();
    });
    navSearchCancel?.addEventListener('click', () => {
      if (!navSearchBar || !navSearchInput) return;
      navSearchInput.value = '';
      navSearchBar.classList.add('hidden');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        navSearchBar?.classList.add('hidden');
      }
    });
    navSearchInput?.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        const q = navSearchInput.value.trim();
        navSearchBar?.classList.add('hidden');
        if (q) window.location.href = '/produk/index.html?q=' + encodeURIComponent(q);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderAuthNav();
    updateCartBadge();
    bindSearch();
    if (footerYear) footerYear.textContent = new Date().getFullYear();
  });

  window.addEventListener('storage', () => {
    renderAuthNav();
    updateCartBadge();
  });
})();
