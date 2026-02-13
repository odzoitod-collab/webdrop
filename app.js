/**
 * Telegram Mini App — Drop Service
 * Supabase + Vanilla JS, без бота (данные только в БД).
 */
(function () {
  'use strict';

  const CONFIG = window.APP_CONFIG || {};
  const supabaseKey = CONFIG.SUPABASE_SERVICE_ROLE_KEY || CONFIG.SUPABASE_ANON_KEY;
  const supabase = window.supabase?.createClient(CONFIG.SUPABASE_URL, supabaseKey);
  const TgWebApp = window.Telegram?.WebApp;

  let state = {
    user: null,
    telegramId: null,
    isMerchant: false,
    usdRate: 85,
    currentRequisite: null,
    currentDealId: null,
    uploadContext: { type: null, requisiteId: null, dealId: null }
  };

  // ——— Helpers ———
  function fmtAmount(val, decimals = 2) {
    if (val == null || isNaN(val)) return '—';
    return Number(val).toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  function showSuccess(message = 'Готово') {
    const overlay = document.getElementById('success-overlay');
    const msgEl = document.getElementById('success-message');
    if (!overlay || !msgEl) return;
    msgEl.textContent = message;
    overlay.classList.remove('hidden');
    setTimeout(() => {
      overlay.classList.add('hidden');
    }, 2000);
  }

  function showPage(id, backData = '') {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById('page-' + id);
    if (page) page.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.page === id);
    });
    if (id === 'upload-check') {
      const header = document.querySelector('#page-upload-check .page-header.with-back');
      if (header) header.dataset.back = backData || 'dashboard';
    }
  }

  function setBackHandler(selector, getBackPage) {
    document.querySelectorAll(selector).forEach(el => {
      el.addEventListener('click', () => showPage(getBackPage()));
    });
  }

  // ——— Auth ———
  async function initAuth() {
    const initData = TgWebApp?.initDataUnsafe;
    const telegramId = initData?.user?.id;
    if (!telegramId) {
      document.getElementById('auth-message').textContent = 'Откройте приложение из Telegram.';
      return;
    }
    state.telegramId = telegramId;

    const { data: userRow, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', String(telegramId))
      .maybeSingle();

    if (error) {
      document.getElementById('auth-message').textContent = 'Ошибка загрузки. Попробуйте позже.';
      showToast('Ошибка: ' + error.message, 'error');
      return;
    }

    if (!userRow) {
      document.getElementById('auth-message').textContent = 'Вы не зарегистрированы. Пройдите регистрацию в боте.';
      return;
    }

    if (userRow.status === 'pending') {
      document.getElementById('auth-message').classList.add('hidden');
      document.getElementById('auth-pending').classList.remove('hidden');
      return;
    }

    if (userRow.status === 'rejected') {
      document.getElementById('auth-message').classList.add('hidden');
      document.getElementById('auth-rejected').classList.remove('hidden');
      return;
    }

    state.user = userRow;
    document.getElementById('page-auth').classList.remove('active');
    document.getElementById('page-dashboard').classList.add('active');
    document.getElementById('bottom-nav').classList.remove('hidden');

    const { data: rateRow } = await supabase.from('settings').select('value').eq('key', 'usd_rate').maybeSingle();
    if (rateRow?.value) state.usdRate = parseFloat(rateRow.value) || 85;

    const { data: merchantRow } = await supabase.from('merchants').select('id').eq('telegram_id', telegramId).maybeSingle();
    state.isMerchant = !!merchantRow;

    loadDashboard();
    loadDeals();
    loadProfile();
  }

  // ——— Dashboard ———
  async function loadDashboard() {
    if (!state.user) return;
    const { data: u } = await supabase.from('users').select('*').eq('telegram_id', state.telegramId).single();
    if (u) state.user = u;
    const user = state.user;
    const usd = parseFloat(user.balance) || 0;
    const rub = usd * state.usdRate;
    document.getElementById('balance-usd').textContent = fmtAmount(usd) + ' $';
    document.getElementById('balance-rub').textContent = fmtAmount(rub) + ' ₽';
  }

  document.querySelector('[data-action="requisites"]')?.addEventListener('click', () => {
    showPage('requisites');
    loadCountries();
  });
  document.querySelector('[data-action="send-check"]')?.addEventListener('click', () => {
    state.uploadContext = { type: 'standalone', requisiteId: null, dealId: null };
    showPage('upload-check', 'dashboard');
    document.getElementById('upload-submit').classList.add('hidden');
    document.getElementById('check-file').value = '';
  });

  // ——— Requisites ———
  async function loadCountries() {
    document.getElementById('req-step-country').classList.remove('hidden');
    document.getElementById('req-step-bank').classList.add('hidden');
    document.getElementById('req-step-detail').classList.add('hidden');
    document.getElementById('req-p2p-form').classList.add('hidden');
    document.getElementById('req-countries').innerHTML = '<div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text"></div>';
    const { data, error } = await supabase.from('countries').select('id, name').order('name');
    const container = document.getElementById('req-countries');
    container.innerHTML = '';
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    (data || []).forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-item btn-outline';
      btn.textContent = c.name;
      btn.dataset.countryId = c.id;
      btn.dataset.countryName = c.name;
      btn.addEventListener('click', () => selectCountry(c.id, c.name));
      container.appendChild(btn);
    });
  }

  function selectCountry(countryId, countryName) {
    state.selectedCountryId = countryId;
    state.selectedCountryName = countryName;
    document.getElementById('req-step-country').classList.add('hidden');
    document.getElementById('req-step-bank').classList.remove('hidden');
    document.getElementById('req-banks').innerHTML = '<div class="skeleton skeleton-text"></div>';
    supabase.from('banks').select('id, name').eq('country_id', countryId).order('name').then(({ data, error }) => {
      const container = document.getElementById('req-banks');
      container.innerHTML = '';
      if (error) {
        showToast(error.message, 'error');
        return;
      }
      (data || []).forEach(b => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'card-item btn-outline';
        btn.textContent = b.name;
        btn.addEventListener('click', () => selectBank(b.id));
        container.appendChild(btn);
      });
    });
  }

  async function selectBank(bankId) {
    const { data: reqs, error } = await supabase.from('requisites').select('*').eq('bank_id', bankId);
    if (error || !reqs?.length) {
      showToast('Нет реквизитов у этого банка', 'error');
      return;
    }
    const r = reqs[0];
    state.currentRequisite = r;
    document.getElementById('req-step-bank').classList.add('hidden');
    document.getElementById('req-step-detail').classList.remove('hidden');
    const card = document.getElementById('req-detail-card');
    const cardNum = (r.card_number || '').replace(/\s/g, '');
    const displayCard = cardNum.length >= 4 ? cardNum.replace(/(.{4})/g, '$1 ').trim() : (r.card_number || '—');
    card.innerHTML = `
      <div class="row"><span>Получатель</span><strong>${escapeHtml(r.recipient_name)}</strong></div>
      <div class="row"><span>Карта</span><span><code>${escapeHtml(displayCard)}</code> <button type="button" class="copy-btn" data-copy="${escapeHtml((r.card_number || '').replace(/\s/g, ''))}">Копировать</button></span></div>
      <div class="row"><span>Мин / Макс</span><span>${fmtAmount(r.min_amount, 0)} – ${fmtAmount(r.max_amount, 0)} ₽</span></div>
    `;
    card.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.copy;
        if (val && navigator.clipboard) navigator.clipboard.writeText(val).then(() => showToast('Скопировано'));
      });
    });
  }

  document.getElementById('req-btn-paid')?.addEventListener('click', () => {
    if (!state.currentRequisite) return;
    state.uploadContext = { type: 'requisite', requisiteId: state.currentRequisite.id, dealId: null };
    showPage('upload-check', 'requisites');
    document.getElementById('upload-submit').classList.add('hidden');
    document.getElementById('check-file').value = '';
  });

  document.getElementById('req-p2p-btn')?.addEventListener('click', () => {
    document.getElementById('req-step-country').classList.add('hidden');
    document.getElementById('req-step-bank').classList.add('hidden');
    document.getElementById('req-step-detail').classList.add('hidden');
    document.getElementById('req-p2p-form').classList.remove('hidden');
  });

  document.getElementById('p2p-submit')?.addEventListener('click', () => createDeal());

  async function createDeal() {
    const amount = parseFloat(document.getElementById('p2p-amount')?.value);
    const time = parseInt(document.getElementById('p2p-time')?.value, 10);
    if (!amount || amount <= 0 || !time || time < 1) {
      showToast('Укажите сумму и время', 'error');
      return;
    }
    const countryId = state.selectedCountryId || null;
    const countryName = state.selectedCountryName || 'По запросу';
    const bankName = 'По запросу';
    const { data, error } = await supabase.from('deals').insert({
      user_telegram_id: state.telegramId,
      country_id: countryId,
      country_name: countryName,
      bank_name: bankName,
      amount_rub: amount,
      time_minutes: time,
      status: 'pending_merchants'
    }).select('id').single();
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    showSuccess('Заявка создана');
    showToast('Мерчант получит уведомление в боте');
    document.getElementById('req-p2p-form').classList.add('hidden');
    showPage('dashboard');
    loadDeals();
  }

  // ——— Deals ———
  function loadDeals() {
    loadMyDeals();
    if (state.isMerchant) loadExchange();
  }

  async function loadMyDeals() {
    const list = document.getElementById('my-deals-list');
    const empty = document.getElementById('my-deals-empty');
    list.innerHTML = '<div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text"></div>';
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .eq('user_telegram_id', state.telegramId)
      .order('created_at', { ascending: false })
      .limit(20);
    list.innerHTML = '';
    if (error) {
      showToast(error.message, 'error');
      empty.classList.remove('hidden');
      return;
    }
    if (!data?.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    const statusLabels = {
      pending_merchants: 'Ожидание мерчанта',
      taken: 'В работе',
      requisites_sent: 'Реквизиты получены',
      waiting_payment: 'Ожидание оплаты',
      check_sent: 'Чек отправлен',
      completed: 'Завершена',
      cancelled: 'Отменена'
    };
    data.forEach(d => {
      const card = document.createElement('div');
      card.className = 'deal-card';
      card.innerHTML = `
        <div class="deal-bank">${escapeHtml(d.bank_name)}</div>
        <div class="deal-meta">${fmtAmount(d.amount_rub, 0)} ₽ · ${statusLabels[d.status] || d.status}</div>
        <span class="deal-status ${d.status}">${statusLabels[d.status] || d.status}</span>
      `;
      card.addEventListener('click', () => showDealDetail(d, 'my'));
      list.appendChild(card);
    });
  }

  async function loadExchange() {
    const list = document.getElementById('exchange-list');
    const empty = document.getElementById('exchange-empty');
    list.innerHTML = '';
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .eq('status', 'pending_merchants')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error || !data?.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    data.forEach(d => {
      const card = document.createElement('div');
      card.className = 'deal-card';
      card.innerHTML = `
        <div class="deal-bank">${escapeHtml(d.bank_name)} — ${fmtAmount(d.amount_rub, 0)} ₽</div>
        <div class="deal-meta">${d.time_minutes} мин</div>
        <button type="button" class="btn btn-primary" style="margin-top:8px" data-deal-id="${d.id}">Взять в работу</button>
      `;
      card.querySelector('[data-deal-id]').addEventListener('click', (e) => {
        e.stopPropagation();
        takeDeal(d.id, d.time_minutes);
      });
      list.appendChild(card);
    });
  }

  async function takeDeal(dealId, timeMinutes) {
    const timeMin = timeMinutes != null ? parseInt(timeMinutes, 10) : 20;
    const validMinutes = timeMin >= 1 && timeMin <= 1440 ? timeMin : 20;
    const expiresAt = new Date(Date.now() + validMinutes * 60 * 1000).toISOString();
    const { error } = await supabase.from('deals').update({
      merchant_telegram_id: state.telegramId,
      status: 'taken',
      timer_until: expiresAt,
      updated_at: new Date().toISOString()
    }).eq('id', dealId).eq('status', 'pending_merchants');
    if (error) {
      showToast(error.message || 'Ошибка при взятии сделки', 'error');
      return;
    }
    showSuccess('Заявка взята');
    showToast('Отправьте реквизиты мерчанту в боте.');
    loadExchange();
    loadMyDeals();
  }

  function showDealDetail(deal, from) {
    state.currentDealId = deal.id;
    const panel = document.getElementById('deal-detail');
    const statusLabels = {
      pending_merchants: 'Ожидание мерчанта',
      taken: 'В работе',
      requisites_sent: 'Реквизиты получены',
      waiting_payment: 'Ожидание оплаты',
      check_sent: 'Чек отправлен',
      completed: 'Завершена',
      cancelled: 'Отменена'
    };
    let actions = '';
    if (from === 'my' && (deal.status === 'waiting_payment' || deal.status === 'requisites_sent')) {
      actions = `<button type="button" class="btn btn-primary btn-block" id="deal-upload-check">Загрузить чек</button>`;
    }
    panel.innerHTML = `
      <div class="detail-row"><span class="label">Банк</span> ${escapeHtml(deal.bank_name)}</div>
      <div class="detail-row"><span class="label">Сумма</span> ${fmtAmount(deal.amount_rub, 0)} ₽</div>
      <div class="detail-row"><span class="label">Статус</span> ${statusLabels[deal.status] || deal.status}</div>
      ${deal.recipient_name ? `<div class="detail-row"><span class="label">Получатель</span> ${escapeHtml(deal.recipient_name)}</div>` : ''}
      ${deal.card_number ? `<div class="detail-row"><span class="label">Карта</span> <code>${escapeHtml(deal.card_number)}</code></div>` : ''}
      <div class="detail-actions">
        ${actions}
        <button type="button" class="btn btn-outline btn-block back-deal-detail">Назад</button>
      </div>
    `;
    panel.classList.remove('hidden');
    panel.querySelector('.back-deal-detail')?.addEventListener('click', () => {
      panel.classList.add('hidden');
    });
    panel.querySelector('#deal-upload-check')?.addEventListener('click', () => {
      state.uploadContext = { type: 'deal', requisiteId: null, dealId: deal.id };
      showPage('upload-check', 'deals');
      document.getElementById('upload-submit').classList.add('hidden');
      document.getElementById('check-file').value = '';
    });
  }

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.dataset.tab;
      document.getElementById('tab-' + id)?.classList.add('active');
      if (id === 'exchange') loadExchange();
    });
  });

  // ——— Upload check ———
  const uploadZone = document.getElementById('upload-zone');
  const checkFileInput = document.getElementById('check-file');
  const uploadSubmit = document.getElementById('upload-submit');

  if (uploadZone && checkFileInput) {
    uploadZone.addEventListener('click', () => checkFileInput.click());
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) setCheckFile(file);
    });
  }
  checkFileInput?.addEventListener('change', (e) => {
    const file = e.target?.files?.[0];
    if (file) setCheckFile(file);
  });

  function setCheckFile(file) {
    state.pendingCheckFile = file;
    uploadSubmit?.classList.remove('hidden');
  }

  uploadSubmit?.addEventListener('click', () => {
    if (!state.pendingCheckFile) return;
    uploadCheck(state.pendingCheckFile);
  });

  async function uploadCheck(file) {
    const ctx = state.uploadContext;
    if (!ctx.type) return;
    const bucket = CONFIG.STORAGE_BUCKET_CHECKS || 'checks';
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${state.telegramId}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (uploadErr) {
      showToast('Ошибка загрузки: ' + uploadErr.message, 'error');
      return;
    }
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    const fileId = urlData?.publicUrl || path;

    const row = {
      user_id: state.user.id,
      telegram_id: state.telegramId,
      file_id: fileId,
      status: 'pending'
    };
    if (ctx.dealId) {
      row.deal_id = ctx.dealId;
      row.requisite_id = null;
    } else if (ctx.requisiteId) {
      row.requisite_id = ctx.requisiteId;
      row.deal_id = null;
    } else {
      showToast('Ошибка: не указан контекст чека', 'error');
      return;
    }
    const { error: insertErr } = await supabase.from('checks').insert(row);
    if (insertErr) {
      showToast(insertErr.message, 'error');
      return;
    }
    if (ctx.dealId) {
      await supabase.from('deals').update({ status: 'check_sent', updated_at: new Date().toISOString() }).eq('id', ctx.dealId);
    }
    state.pendingCheckFile = null;
    uploadSubmit?.classList.add('hidden');
    checkFileInput.value = '';
    showSuccess('Чек отправлен');
    showToast('Чек на проверке');
    showPage('dashboard');
    loadDashboard();
    loadDeals();
  }

  // ——— Wallet ———
  async function loadWallet() {
    if (!state.user) return;
    const { data: u } = await supabase.from('users').select('*').eq('telegram_id', state.telegramId).single();
    if (u) state.user = u;
    const user = state.user;
    const usd = parseFloat(user.balance) || 0;
    const rub = usd * state.usdRate;
    document.getElementById('wallet-balance-usd').textContent = fmtAmount(usd) + ' $';
    document.getElementById('wallet-balance-rub').textContent = fmtAmount(rub) + ' ₽';
  }

  document.getElementById('wallet-withdraw')?.addEventListener('click', () => {
    document.getElementById('withdraw-form').classList.remove('hidden');
  });
  document.getElementById('withdraw-submit')?.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('withdraw-amount')?.value);
    if (!amount || amount <= 0) {
      showToast('Укажите сумму', 'error');
      return;
    }
    const { error } = await supabase.from('withdrawals').insert({
      user_id: state.user.id,
      telegram_id: state.telegramId,
      amount_usd: amount,
      status: 'pending'
    });
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    showSuccess('Заявка на вывод создана');
    document.getElementById('withdraw-form').classList.add('hidden');
    document.getElementById('withdraw-amount').value = '';
  });

  // ——— Profile ———
  async function loadProfile() {
    if (!state.user) return;
    const { data: u } = await supabase.from('users').select('*').eq('telegram_id', state.telegramId).single();
    if (u) state.user = u;
    const user = state.user;
    document.getElementById('profile-total-profit').textContent = fmtAmount(user.total_profit) + ' ₽';
    document.getElementById('profile-day-profit').textContent = fmtAmount(user.day_profit) + ' ₽';
    document.getElementById('profile-month-profit').textContent = fmtAmount(user.month_profit) + ' ₽';
  }

  // ——— Navigation ———
  document.getElementById('bottom-nav')?.addEventListener('click', (e) => {
    const item = e.target.closest('.nav-item');
    if (!item?.dataset.page) return;
    showPage(item.dataset.page);
    if (item.dataset.page === 'dashboard') loadDashboard();
    if (item.dataset.page === 'deals') loadDeals();
    if (item.dataset.page === 'wallet') loadWallet();
    if (item.dataset.page === 'profile') loadProfile();
  });

  document.querySelectorAll('.page-header.with-back .back').forEach(btn => {
    btn.addEventListener('click', () => {
      const header = btn.closest('.page-header.with-back');
      const back = header?.dataset.back || 'dashboard';
      showPage(back);
      if (back === 'requisites') loadCountries();
    });
  });

  function escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ——— Realtime: подписка на сделки (воркер видит смену статуса мерчантом) и на профиль (баланс) ———
  function subscribeDeals() {
    if (!state.telegramId) return;
    supabase
      .channel('deals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals', filter: `user_telegram_id=eq.${state.telegramId}` }, (payload) => {
        var newRow = payload.new || payload.newRecord;
        if (newRow && newRow.status === 'taken') {
          showToast('Мерчант взял сделку. Ожидайте реквизиты.', 'success');
        }
        if (newRow && (newRow.status === 'requisites_sent' || newRow.status === 'waiting_payment')) {
          showToast('Реквизиты получены. Можно оплачивать и загрузить чек.', 'success');
        }
        loadMyDeals();
        loadDashboard();
      })
      .subscribe();
  }

  function subscribeUserUpdates() {
    if (!state.telegramId) return;
    supabase
      .channel('user-updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `telegram_id=eq.${state.telegramId}`
      }, (payload) => {
        if (payload.new) {
          state.user = payload.new;
          loadDashboard();
          loadWallet();
          loadProfile();
          showToast('Баланс обновлён', 'success');
        }
      })
      .subscribe();
  }

  // ——— Init ———
  if (TgWebApp) {
    TgWebApp.ready();
    TgWebApp.expand();
    TgWebApp.enableClosingConfirmation();
  }
  initAuth().then(() => {
    subscribeDeals();
    subscribeUserUpdates();
  });
})();
