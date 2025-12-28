(() => {
  const ORIGINAL_FETCH = window.fetch.bind(window);
  const STORE_KEY = 'ps_store_v1';
  const SESSION_KEY = 'ps_sessions_v1';
  const SEEDED_KEY = 'ps_seeded_v1';
  const SEED_URL = '/data/seed.json';

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { jerseys: [], users: [], orders: [] };
  }

  function saveStore(data) {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  }

  function loadSessions() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }

  function saveSessions(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  async function ensureSeeded() {
    const already = localStorage.getItem(SEEDED_KEY) === '1';
    const hasStore = loadStore();
    if (already && (hasStore.jerseys?.length || hasStore.users?.length)) return;
    try {
      const res = await ORIGINAL_FETCH(SEED_URL);
      if (!res.ok) throw new Error('seed fetch failed');
      const json = await res.json();
      saveStore({
        jerseys: json.jerseys || [],
        users: json.users || [],
        orders: json.orders || []
      });
      localStorage.setItem(SEEDED_KEY, '1');
    } catch (e) {
      console.warn('Gagal memuat seed data static:', e);
    }
  }

  function nextId(list) {
    if (!Array.isArray(list) || !list.length) return 1;
    return list.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  }

  function readBody(body) {
    if (!body) return null;
    if (typeof body === 'string') {
      try { return JSON.parse(body); } catch { return { raw: body }; }
    }
    if (body instanceof FormData) {
      const obj = {};
      body.forEach((value, key) => {
        obj[key] = value instanceof File ? value.name : value;
      });
      return obj;
    }
    if (body instanceof URLSearchParams) {
      const obj = {};
      body.forEach((value, key) => obj[key] = value);
      return obj;
    }
    return null;
  }

  function parseAuth(init, sessions, store) {
    const headers = new Headers(init?.headers || {});
    let token = headers.get('Authorization') || '';
    if (token.toLowerCase().startsWith('bearer ')) token = token.slice(7);
    if (!token) {
      token = localStorage.getItem('token') || localStorage.getItem('bearerToken');
      if (token && token.toLowerCase().startsWith('bearer ')) token = token.slice(7);
    }
    const userId = sessions[token];
    const user = store.users.find(u => u.id === userId);
    return { token, user };
  }

  function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  function withUser(order, store) {
    if (!order || !order.user_id) return order;
    const u = (store.users || []).find(x => x.id === order.user_id);
    if (!u) return order;
    return {
      ...order,
      user: {
        id: u.id,
        name: u.name,
        email: u.email
      }
    };
  }

  async function handleApi(urlObj, init) {
    const baseMethod = (init?.method || 'GET').toUpperCase();
    const bodyData = readBody(init?.body);
    const method = (bodyData && typeof bodyData._method === 'string') ? bodyData._method.toUpperCase() : baseMethod;
    await ensureSeeded();
    let store = loadStore();
    let sessions = loadSessions();
    const { user, token } = parseAuth(init, sessions, store);
    const path = urlObj.pathname.replace('/api', '') || '/';
    const params = urlObj.searchParams;

    // AUTH -------------------------------------------------------
    if (path === '/login' && method === 'POST') {
      const email = bodyData?.email || '';
      const password = bodyData?.password || '';
      const found = store.users.find(u => u.email === email && u.password === password);
      if (!found) {
        return jsonResponse({ message: 'Unauthorized' }, 401);
      }
      const newToken = `ps-token-${found.id}-${Date.now()}`;
      sessions[newToken] = found.id;
      saveSessions(sessions);
      return jsonResponse({
        access_token: newToken,
        token_type: 'bearer',
        user: found
      });
    }

    if (path === '/register' && method === 'POST') {
      const name = (bodyData?.name || '').trim();
      const email = (bodyData?.email || '').trim();
      const password = (bodyData?.password || '').trim();
      if (!name || !email || !password) {
        return jsonResponse({ message: 'Data tidak lengkap' }, 422);
      }
      if (store.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        return jsonResponse({ message: 'Email sudah terdaftar' }, 422);
      }
      const newUser = {
        id: nextId(store.users),
        name,
        email,
        password,
        is_admin: false
      };
      store.users.push(newUser);
      saveStore(store);
      const newToken = `ps-token-${newUser.id}-${Date.now()}`;
      sessions[newToken] = newUser.id;
      saveSessions(sessions);
      return jsonResponse({
        message: 'Register berhasil',
        access_token: newToken,
        token_type: 'bearer',
        user: newUser
      }, 201);
    }

    if (path === '/me' && method === 'GET') {
      if (!user) return jsonResponse({ message: 'Unauthorized' }, 401);
      return jsonResponse(user);
    }

    if (path === '/me' && method === 'PUT') {
      if (!user) return jsonResponse({ message: 'Unauthorized' }, 401);
      const name = (bodyData?.name || user.name || '').trim();
      const email = (bodyData?.email || user.email || '').trim();
      if (email && store.users.some(u => u.id !== user.id && u.email.toLowerCase() === email.toLowerCase())) {
        return jsonResponse({ message: 'Email sudah digunakan' }, 422);
      }
      const updated = { ...user, name, email };
      if (bodyData?.password) {
        updated.password = bodyData.password;
      }
      store.users = store.users.map(u => u.id === user.id ? updated : u);
      saveStore(store);
      return jsonResponse({ message: 'Profile updated', user: updated });
    }

    if (path === '/logout' && method === 'POST') {
      if (token && sessions[token]) {
        delete sessions[token];
        saveSessions(sessions);
      }
      return jsonResponse({ message: 'Logout berhasil' });
    }

    // JERSEYS ----------------------------------------------------
    if (path === '/jerseys' && method === 'GET') {
      let items = [...(store.jerseys || [])];
      const search = (params.get('search') || '').toLowerCase();
      const orderBy = params.get('orderBy') || 'id';
      const sortBy = (params.get('sortBy') || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
      const limit = Math.min(Math.max(parseInt(params.get('limit') || items.length, 10) || items.length, 1), 200);
      if (search) {
        items = items.filter(j => (j.nama || '').toLowerCase().includes(search) || (j.kategori || '').toLowerCase().includes(search));
      }
      items.sort((a, b) => {
        const va = a[orderBy];
        const vb = b[orderBy];
        if (va === vb) return 0;
        if (va === undefined) return 1;
        if (vb === undefined) return -1;
        return sortBy === 'desc' ? (va < vb ? 1 : -1) : (va > vb ? 1 : -1);
      });
      return jsonResponse({ status: 'success', data: items.slice(0, limit), total: items.length, page: 1 });
    }

    const jerseyDetail = path.match(/^\/jerseys\/(\d+)/);
    if (jerseyDetail && method === 'GET') {
      const id = Number(jerseyDetail[1]);
      const found = store.jerseys.find(j => Number(j.id) === id);
      if (!found) return jsonResponse({ message: 'Not found' }, 404);
      return jsonResponse(found);
    }

    if (path === '/jerseys' && method === 'POST') {
      if (!user || !user.is_admin) return jsonResponse({ message: 'Unauthorized' }, 401);
      const newJ = {
        id: nextId(store.jerseys),
        nama: bodyData?.nama || 'Jersey Baru',
        kategori: bodyData?.kategori || '-',
        harga: Number(bodyData?.harga || 0),
        stok: Number(bodyData?.stok || 0),
        ukuran: bodyData?.ukuran || '',
        deskripsi: bodyData?.deskripsi || '',
        gambar: bodyData?.gambar || bodyData?.file || ''
      };
      store.jerseys.push(newJ);
      saveStore(store);
      return jsonResponse({ message: 'Jersey berhasil ditambahkan', data: newJ }, 201);
    }

    if (jerseyDetail && method === 'PUT') {
      if (!user || !user.is_admin) return jsonResponse({ message: 'Unauthorized' }, 401);
      const id = Number(jerseyDetail[1]);
      const found = store.jerseys.find(j => Number(j.id) === id);
      if (!found) return jsonResponse({ message: 'Not found' }, 404);
      const updated = { ...found };
      ['nama','kategori','deskripsi','ukuran'].forEach(k => {
        if (bodyData?.[k]) updated[k] = bodyData[k];
      });
      if (bodyData?.harga !== undefined) updated.harga = Number(bodyData.harga);
      if (bodyData?.stok !== undefined) updated.stok = Number(bodyData.stok);
      if (bodyData?.gambar) updated.gambar = bodyData.gambar;
      store.jerseys = store.jerseys.map(j => Number(j.id) === id ? updated : j);
      saveStore(store);
      return jsonResponse({ message: 'Jersey berhasil diperbarui', data: updated });
    }

    if (jerseyDetail && method === 'DELETE') {
      if (!user || !user.is_admin) return jsonResponse({ message: 'Unauthorized' }, 401);
      const id = Number(jerseyDetail[1]);
      store.jerseys = store.jerseys.filter(j => Number(j.id) !== id);
      saveStore(store);
      return jsonResponse({ message: 'Jersey berhasil dihapus' });
    }

    // ORDERS -----------------------------------------------------
    if (path === '/orders/all' && method === 'GET') {
      if (!user || !user.is_admin) return jsonResponse({ message: 'Forbidden' }, 403);
      const data = (store.orders || []).map(o => withUser(o, store));
      return jsonResponse({ status: 'success', data });
    }

    if (path === '/orders' && method === 'GET') {
      if (!user) return jsonResponse({ message: 'Unauthorized' }, 401);
      const list = (store.orders || [])
        .filter(o => o.user_id === user.id)
        .map(o => withUser(o, store));
      return jsonResponse({ status: 'success', data: list });
    }

    const orderDetail = path.match(/^\/orders\/(\d+)/);
    if (orderDetail && method === 'GET') {
      const id = Number(orderDetail[1]);
      const found = (store.orders || []).find(o => Number(o.id) === id);
      if (!found) return jsonResponse({ message: 'Not found' }, 404);
      const isOwner = user && found.user_id === user.id;
      const isAdmin = user && user.is_admin;
      if (!isOwner && !isAdmin) return jsonResponse({ message: 'Forbidden' }, 403);
      return jsonResponse({ status: 'success', data: withUser(found, store) });
    }

    if (path === '/orders' && method === 'POST') {
      const items = Array.isArray(bodyData?.items) ? bodyData.items : [];
      if (!items.length) return jsonResponse({ message: 'Items required' }, 422);
      const total = Number(bodyData?.total || 0);
      const paymentMethod = bodyData?.paymentMethod || bodyData?.payment_method || '';
      const paymentInfo = bodyData?.paymentInfo || bodyData?.payment_info || '';
      const newOrder = {
        id: nextId(store.orders),
        user_id: user?.id || null,
        items,
        total,
        payment_method: paymentMethod,
        payment_info: paymentInfo,
        status: 'Diproses',
        created_at: new Date().toISOString()
      };
      if (newOrder.user_id) {
        const u = (store.users || []).find(x => x.id === newOrder.user_id);
        if (u) {
          newOrder.user = { id: u.id, name: u.name, email: u.email };
        }
      }
      store.orders.unshift(newOrder);
      saveStore(store);
      localStorage.setItem('lastOrder', JSON.stringify(newOrder));
      return jsonResponse({ status: 'success', data: newOrder }, 201);
    }

    return null;
  }

  window.fetch = async (input, init = {}) => {
    const urlStr = typeof input === 'string' ? input : input.url;
    try {
      const urlObj = new URL(urlStr, window.location.origin);
      if (urlObj.pathname.startsWith('/api/')) {
        const res = await handleApi(urlObj, init);
        if (res) return res;
      }
    } catch (e) {
      console.warn('Mock API error', e);
    }
    return ORIGINAL_FETCH(input, init);
  };
})();
