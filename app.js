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
      const header = document.querySelector('#page-upload-check .screen-header.with-back');
      if (header) header.dataset.back = backData || 'dashboard';
    }
    if (id === 'requisites') showRequisitesChoiceStep();
    if (id === 'wallet') loadWallet();
    if (id === 'deals') loadDeals();
    updateDealsUI();
  }

  function updateDealsUI() {}

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
    updateDealsUI();
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
    const rateEl = document.getElementById('dashboard-rate');
    if (rateEl) rateEl.textContent = '1 $ = ' + fmtAmount(state.usdRate, 2) + ' ₽';
  }

  function showRequisitesChoiceStep() {
    document.getElementById('req-step-choose').classList.remove('hidden');
    document.getElementById('req-step-country').classList.add('hidden');
    document.getElementById('req-step-bank').classList.add('hidden');
    document.getElementById('req-step-detail').classList.add('hidden');
    document.getElementById('req-p2p-form').classList.add('hidden');
  }

  function requisitesBack() {
    if (!document.getElementById('page-requisites').classList.contains('active')) return false;
    if (!document.getElementById('req-step-choose').classList.contains('hidden')) {
      showPage('dashboard');
      return true;
    }
    if (!document.getElementById('req-p2p-form').classList.contains('hidden')) {
      showRequisitesChoiceStep();
      return true;
    }
    if (!document.getElementById('req-step-country').classList.contains('hidden')) {
      showRequisitesChoiceStep();
      return true;
    }
    if (!document.getElementById('req-step-bank').classList.contains('hidden')) {
      document.getElementById('req-step-bank').classList.add('hidden');
      document.getElementById('req-step-country').classList.remove('hidden');
      return true;
    }
    if (!document.getElementById('req-step-detail').classList.contains('hidden')) {
      document.getElementById('req-step-detail').classList.add('hidden');
      document.getElementById('req-step-bank').classList.remove('hidden');
      return true;
    }
    return false;
  }

  document.querySelector('[data-action="requisites"]')?.addEventListener('click', () => {
    showPage('requisites');
    showRequisitesChoiceStep();
  });
  document.querySelector('[data-action="p2p"]')?.addEventListener('click', () => {
    showPage('requisites');
    showRequisitesChoiceStep();
    document.getElementById('req-step-choose').classList.add('hidden');
    document.getElementById('req-step-country').classList.add('hidden');
    document.getElementById('req-step-bank').classList.add('hidden');
    document.getElementById('req-step-detail').classList.add('hidden');
    document.getElementById('req-p2p-form').classList.remove('hidden');
    state.p2pCountryId = null;
    state.p2pCountryName = null;
    state.p2pBankName = null;
    document.getElementById('p2p-bank-custom').value = '';
    loadP2pCountries();
    document.getElementById('p2p-banks').innerHTML = '';
  });
  function resetUploadCheckPage() {
    state.pendingCheckFile = null;
    if (checkFileInput) checkFileInput.value = '';
    document.getElementById('upload-submit')?.classList.add('hidden');
    document.getElementById('upload-clear')?.classList.add('hidden');
    const preview = document.getElementById('check-preview');
    const zoneText = document.getElementById('upload-zone-text');
    if (preview) { preview.innerHTML = ''; preview.classList.add('hidden'); }
    if (zoneText) zoneText.classList.remove('hidden');
  }

  document.querySelector('[data-action="send-check"]')?.addEventListener('click', () => {
    state.uploadContext = { type: 'standalone', requisiteId: null, dealId: null };
    showPage('upload-check', 'dashboard');
    resetUploadCheckPage();
  });

  // ——— Requisites ———
  document.getElementById('req-by-country-btn')?.addEventListener('click', () => {
    document.getElementById('req-step-choose').classList.add('hidden');
    loadCountries();
  });

  document.querySelector('.req-back-to-choose')?.addEventListener('click', showRequisitesChoiceStep);
  document.querySelector('.req-back-to-country')?.addEventListener('click', () => {
    document.getElementById('req-step-bank').classList.add('hidden');
    document.getElementById('req-step-country').classList.remove('hidden');
  });

  async function loadCountries() {
    document.getElementById('req-step-choose').classList.add('hidden');
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
      btn.className = 'card-item';
      btn.innerHTML = '<svg class="card-item-icon" width="20" height="20"><use href="#icon-globe"/></svg><span>' + escapeHtml(c.name) + '</span>';
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
        btn.className = 'card-item';
        btn.innerHTML = '<svg class="card-item-icon" width="20" height="20"><use href="#icon-bank"/></svg><span>' + escapeHtml(b.name) + '</span>';
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
    const copyVal = (r.card_number || '').replace(/\s/g, '');
    card.innerHTML = `
      <div class="row"><span class="label">Получатель</span><strong>${escapeHtml(r.recipient_name)}</strong></div>
      <div class="row"><span class="label">Карта</span><span><code>${escapeHtml(displayCard)}</code> <button type="button" class="copy-btn" data-copy="${escapeHtml(copyVal)}"><svg width="14" height="14"><use href="#icon-copy"/></svg> Копировать</button></span></div>
      <div class="row"><span class="label">Мин / Макс</span><span>${fmtAmount(r.min_amount, 0)} – ${fmtAmount(r.max_amount, 0)} ₽</span></div>
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
    resetUploadCheckPage();
  });

  document.getElementById('req-p2p-btn')?.addEventListener('click', () => {
    document.getElementById('req-step-choose').classList.add('hidden');
    document.getElementById('req-step-country').classList.add('hidden');
    document.getElementById('req-step-bank').classList.add('hidden');
    document.getElementById('req-step-detail').classList.add('hidden');
    document.getElementById('req-p2p-form').classList.remove('hidden');
    state.p2pCountryId = null;
    state.p2pCountryName = null;
    state.p2pBankName = null;
    document.getElementById('p2p-bank-custom').value = '';
    loadP2pCountries();
    document.getElementById('p2p-banks').innerHTML = '';
  });

  async function loadP2pCountries() {
    const container = document.getElementById('p2p-countries');
    container.innerHTML = '<div class="skeleton skeleton-text"></div>';
    const { data, error } = await supabase.from('countries').select('id, name').order('name');
    container.innerHTML = '';
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    (data || []).forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-item';
      btn.innerHTML = '<svg class="card-item-icon" width="20" height="20"><use href="#icon-globe"/></svg><span>' + escapeHtml(c.name) + '</span>';
      btn.dataset.countryId = c.id;
      btn.dataset.countryName = c.name;
      btn.addEventListener('click', () => selectP2pCountry(c.id, c.name));
      container.appendChild(btn);
    });
  }

  function selectP2pCountry(countryId, countryName) {
    state.p2pCountryId = countryId;
    state.p2pCountryName = countryName;
    const container = document.getElementById('p2p-banks');
    container.innerHTML = '<div class="skeleton skeleton-text"></div>';
    supabase.from('banks').select('id, name').eq('country_id', countryId).order('name').then(({ data, error }) => {
      container.innerHTML = '';
      if (error) {
        showToast(error.message, 'error');
        return;
      }
      (data || []).forEach(b => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'card-item';
        btn.innerHTML = '<svg class="card-item-icon" width="20" height="20"><use href="#icon-bank"/></svg><span>' + escapeHtml(b.name) + '</span>';
        btn.addEventListener('click', () => {
          state.p2pBankName = b.name;
          document.getElementById('p2p-bank-custom').value = '';
          container.querySelectorAll('.card-item').forEach(el => el.classList.remove('selected'));
          btn.classList.add('selected');
        });
        container.appendChild(btn);
      });
      const anyBtn = document.createElement('button');
      anyBtn.type = 'button';
      anyBtn.className = 'card-item card-item-action';
      anyBtn.innerHTML = '<svg class="card-item-icon" width="20" height="20"><use href="#icon-p2p"/></svg><span>По запросу</span>';
      anyBtn.addEventListener('click', () => {
        state.p2pBankName = 'По запросу';
        document.getElementById('p2p-bank-custom').value = '';
        container.querySelectorAll('.card-item').forEach(el => el.classList.remove('selected'));
        anyBtn.classList.add('selected');
      });
      container.appendChild(anyBtn);
    });
  }

  document.getElementById('p2p-bank-custom')?.addEventListener('input', () => {
    state.p2pBankName = null;
    document.getElementById('p2p-banks')?.querySelectorAll('.card-item').forEach(el => el.classList.remove('selected'));
  });

  document.getElementById('p2p-submit')?.addEventListener('click', () => createDeal());

  async function createDeal() {
    const amount = parseFloat(document.getElementById('p2p-amount')?.value);
    const time = parseInt(document.getElementById('p2p-time')?.value, 10);
    if (!amount || amount <= 0 || !time || time < 1) {
      showToast('Укажите сумму и время', 'error');
      return;
    }
    if (!state.p2pCountryId || !state.p2pCountryName) {
      showToast('Выберите страну', 'error');
      return;
    }
    const customBank = (document.getElementById('p2p-bank-custom')?.value || '').trim();
    const bankName = customBank || state.p2pBankName || 'По запросу';
    const { data, error } = await supabase.from('deals').insert({
      user_telegram_id: state.telegramId,
      country_id: state.p2pCountryId,
      country_name: state.p2pCountryName,
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

  // ——— Deals (только мои заявки; брать сделки — только в боте) ———
  function loadDeals() {
    loadMyDeals();
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
    const hasRequisites = deal.recipient_name || deal.card_number;
    const cardNum = (deal.card_number || '').replace(/\s/g, '');
    const displayCard = cardNum.length >= 4 ? cardNum.replace(/(.{4})/g, '$1 ').trim() : (deal.card_number || '');
    let reqBlock = '';
    if (hasRequisites) {
      reqBlock = `<button type="button" class="btn btn-outline btn-block" id="deal-show-req-btn">Реквизиты для оплаты</button>`;
    }
    let actions = '';
    if (from === 'my' && (deal.status === 'waiting_payment' || deal.status === 'requisites_sent')) {
      actions = `<button type="button" class="btn btn-primary btn-block" id="deal-upload-check">Прикрепить чек</button>`;
    }
    panel.innerHTML = `
      <div class="detail-row"><span class="label">Страна</span> ${escapeHtml(deal.country_name || '—')}</div>
      <div class="detail-row"><span class="label">Банк</span> ${escapeHtml(deal.bank_name)}</div>
      <div class="detail-row"><span class="label">Сумма</span> ${fmtAmount(deal.amount_rub, 0)} ₽</div>
      <div class="detail-row"><span class="label">Статус</span> ${statusLabels[deal.status] || deal.status}</div>
      ${reqBlock}
      <div class="detail-actions">
        ${actions}
        <button type="button" class="btn btn-outline btn-block back-deal-detail">Назад</button>
      </div>
    `;
    panel.classList.remove('hidden');
    panel.querySelector('.back-deal-detail')?.addEventListener('click', () => {
      panel.classList.add('hidden');
    });
    panel.querySelector('#deal-show-req-btn')?.addEventListener('click', () => {
      openRequisitesModal(deal);
    });
    panel.querySelector('#deal-upload-check')?.addEventListener('click', () => {
      state.uploadContext = { type: 'deal', requisiteId: null, dealId: deal.id };
      showPage('upload-check', 'deals');
      resetUploadCheckPage();
    });
  }

  function openRequisitesModal(deal) {
    const modal = document.getElementById('deal-req-modal');
    const body = document.getElementById('deal-req-modal-body');
    if (!modal || !body) return;
    const cardNum = (deal.card_number || '').replace(/\s/g, '');
    const displayCard = cardNum.length >= 4 ? cardNum.replace(/(.{4})/g, '$1 ').trim() : (deal.card_number || '');
    body.innerHTML = `
      ${deal.recipient_name ? `<div class="detail-row"><span class="label">Получатель</span> <strong>${escapeHtml(deal.recipient_name)}</strong></div>` : ''}
      ${deal.card_number ? `<div class="detail-row"><span class="label">Карта</span> <code>${escapeHtml(displayCard)}</code> <button type="button" class="copy-btn deal-req-modal-copy" data-copy="${escapeHtml(cardNum)}">Копировать</button></div>` : ''}
    `;
    body.querySelectorAll('.deal-req-modal-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.copy;
        if (val && navigator.clipboard) navigator.clipboard.writeText(val).then(() => showToast('Скопировано'));
      });
    });
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeRequisitesModal() {
    const modal = document.getElementById('deal-req-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  document.querySelectorAll('[data-close="deal-req-modal"]').forEach(el => {
    el.addEventListener('click', closeRequisitesModal);
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
    const zoneText = document.getElementById('upload-zone-text');
    const preview = document.getElementById('check-preview');
    const clearBtn = document.getElementById('upload-clear');
    if (preview) {
      preview.innerHTML = '';
      preview.classList.remove('hidden');
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = 'Превью чека';
      img.className = 'check-preview-img';
      preview.appendChild(img);
      if (zoneText) zoneText.classList.add('hidden');
    }
    uploadSubmit?.classList.remove('hidden');
    if (clearBtn) clearBtn.classList.remove('hidden');
  }

  document.getElementById('upload-clear')?.addEventListener('click', () => {
    state.pendingCheckFile = null;
    checkFileInput.value = '';
    document.getElementById('upload-submit').classList.add('hidden');
    document.getElementById('upload-clear').classList.add('hidden');
    const preview = document.getElementById('check-preview');
    const zoneText = document.getElementById('upload-zone-text');
    if (preview) {
      preview.innerHTML = '';
      preview.classList.add('hidden');
    }
    if (zoneText) zoneText.classList.remove('hidden');
  });

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
      // Одиночная загрузка (Главная → Отправить чек): без сделки и реквизита — чек уйдёт в канал и админам
      row.deal_id = null;
      row.requisite_id = null;
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
    document.getElementById('upload-clear')?.classList.add('hidden');
    const preview = document.getElementById('check-preview');
    const zoneText = document.getElementById('upload-zone-text');
    if (preview) { preview.innerHTML = ''; preview.classList.add('hidden'); }
    if (zoneText) zoneText.classList.remove('hidden');
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
    const rateEl = document.getElementById('wallet-rate');
    if (rateEl) rateEl.textContent = '1 $ = ' + fmtAmount(state.usdRate, 2) + ' ₽';
    const listEl = document.getElementById('withdrawals-history');
    if (listEl) {
      const { data: rows } = await supabase.from('withdrawals').select('id, amount_usd, status, created_at').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(10);
      if (!rows?.length) {
        listEl.innerHTML = '<p class="empty-hint">Заявок на вывод пока нет</p>';
      } else {
        listEl.innerHTML = rows.map(w => {
          const date = w.created_at ? new Date(w.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
          const statusClass = w.status === 'confirmed' ? 'confirmed' : 'pending';
          const statusText = w.status === 'confirmed' ? 'Выполнен' : 'На рассмотрении';
          return `<div class="withdrawal-row"><span>${fmtAmount(w.amount_usd, 2)} $ · ${date}</span><span class="withdrawal-status ${statusClass}">${statusText}</span></div>`;
        }).join('');
      }
    }
  }

  document.getElementById('wallet-withdraw')?.addEventListener('click', () => {
    const bal = parseFloat(state.user?.balance) || 0;
    document.getElementById('withdraw-available').textContent = 'Доступно: ' + fmtAmount(bal, 2) + ' $';
    document.getElementById('withdraw-form').classList.remove('hidden');
    document.getElementById('withdraw-amount').value = '';
  });
  document.getElementById('withdraw-cancel')?.addEventListener('click', () => {
    document.getElementById('withdraw-form').classList.add('hidden');
  });
  document.getElementById('withdraw-submit')?.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('withdraw-amount')?.value);
    if (!amount || amount <= 0) {
      showToast('Укажите сумму', 'error');
      return;
    }
    const bal = parseFloat(state.user?.balance) || 0;
    if (amount > bal) {
      showToast('Недостаточно средств. Доступно: ' + fmtAmount(bal, 2) + ' $', 'error');
      return;
    }
    if (!state.user?.id) {
      showToast('Ошибка: пользователь не найден', 'error');
      return;
    }
    const { error } = await supabase.from('withdrawals').insert({
      user_id: state.user.id,
      telegram_id: state.telegramId,
      amount_usd: amount,
      status: 'pending'
    });
    if (error) {
      showToast(error.message || 'Ошибка создания заявки', 'error');
      return;
    }
    const { data: u } = await supabase.from('users').select('*').eq('telegram_id', state.telegramId).single();
    if (u) state.user = u;
    showSuccess('Заявка на вывод создана');
    document.getElementById('withdraw-form').classList.add('hidden');
    document.getElementById('withdraw-amount').value = '';
    loadWallet();
  });

  // ——— Profile ———
  async function loadProfile() {
    if (!state.user) return;
    const { data: u } = await supabase.from('users').select('*').eq('telegram_id', state.telegramId).single();
    if (u) state.user = u;
    const user = state.user;
    const total = parseFloat(user.total_profit) || 0;
    const day = parseFloat(user.day_profit) || 0;
    const week = parseFloat(user.week_profit) || 0;
    const month = parseFloat(user.month_profit) || 0;
    const record = (user.record_profit != null && user.record_profit !== '') ? parseFloat(user.record_profit) : total;
    document.getElementById('profile-total-profit').textContent = fmtAmount(total) + ' $';
    document.getElementById('profile-day-profit').textContent = fmtAmount(day) + ' $';
    document.getElementById('profile-week-profit').textContent = fmtAmount(week) + ' $';
    document.getElementById('profile-month-profit').textContent = fmtAmount(month) + ' $';
    document.getElementById('profile-record-profit').textContent = fmtAmount(record) + ' $';
    const { data: rankRows } = await supabase.from('users').select('telegram_id').eq('status', 'approved').order('total_profit', { ascending: false });
    let place = '—';
    if (rankRows?.length) {
      const idx = rankRows.findIndex(r => String(r.telegram_id) === String(state.telegramId));
      place = idx >= 0 ? `${idx + 1} из ${rankRows.length}` : `${rankRows.length} из ${rankRows.length}`;
    }
    const rankEl = document.getElementById('profile-rank');
    if (rankEl) rankEl.textContent = place;
    const { data: settingsRows } = await supabase.from('settings').select('key, value').in('key', ['about_text', 'chat_link', 'profits_channel_link', 'support_contact']);
    const settings = {};
    (settingsRows || []).forEach(r => { settings[r.key] = r.value || ''; });
    const aboutEl = document.getElementById('profile-about');
    if (aboutEl) aboutEl.textContent = settings.about_text || 'Дроп-сервис. Общая касса и условия работы.';
    const linksEl = document.getElementById('profile-links');
    if (linksEl) {
      const parts = [];
      if (settings.chat_link && settings.chat_link.trim()) {
        parts.push('<a href="' + escapeHtml(settings.chat_link.trim()) + '" target="_blank" rel="noopener"><svg width="18" height="18"><use href="#icon-link"/></svg>Чат</a>');
      }
      if (settings.profits_channel_link && settings.profits_channel_link.trim()) {
        parts.push('<a href="' + escapeHtml(settings.profits_channel_link.trim()) + '" target="_blank" rel="noopener"><svg width="18" height="18"><use href="#icon-link"/></svg>Канал профитов</a>');
      }
      if (settings.support_contact && settings.support_contact.trim()) {
        const support = settings.support_contact.trim();
        const href = support.startsWith('http') ? support : (support.startsWith('@') ? 'https://t.me/' + support.slice(1) : 'https://t.me/' + support);
        parts.push('<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener"><svg width="18" height="18"><use href="#icon-link"/></svg>Поддержка</a>');
      }
      linksEl.innerHTML = parts.length ? parts.join('') : '<p class="hint">Ссылки задаются в боте (админ).</p>';
    }
    const btn = document.getElementById('profile-become-merchant');
    if (btn) {
      if (user.status !== 'approved') {
        btn.classList.add('hidden');
      } else {
        btn.classList.remove('hidden');
        if (state.isMerchant) {
          btn.innerHTML = '<svg class="btn-icon" width="20" height="20"><use href="#icon-merchant"/></svg>Вы уже мерчант';
          btn.disabled = true;
        } else {
          btn.innerHTML = '<svg class="btn-icon" width="20" height="20"><use href="#icon-merchant"/></svg>Стать мерчантом';
          btn.disabled = false;
        }
      }
    }
  }

  document.getElementById('profile-become-merchant')?.addEventListener('click', async () => {
    if (state.user?.status !== 'approved') {
      showToast('Доступно только одобренным пользователям', 'error');
      return;
    }
    if (state.isMerchant) {
      showToast('Вы уже мерчант', 'info');
      return;
    }
    const { data: pending } = await supabase.from('merchant_applications').select('id').eq('telegram_id', state.telegramId).eq('status', 'pending').limit(1).maybeSingle();
    if (pending) {
      showToast('У вас уже есть заявка на рассмотрении', 'info');
      return;
    }
    showPage('merchant-apply');
  });

  document.getElementById('merchant-apply-submit')?.addEventListener('click', async () => {
    const volume = (document.getElementById('merchant-volume')?.value || '').trim();
    const banks = (document.getElementById('merchant-banks')?.value || '').trim();
    const country = (document.getElementById('merchant-country')?.value || '').trim();
    const experience = (document.getElementById('merchant-experience')?.value || '').trim().slice(0, 500);
    const guarantees = (document.getElementById('merchant-guarantees')?.value || '').trim().slice(0, 500);
    const timeText = (document.getElementById('merchant-time')?.value || '').trim().slice(0, 300);
    if (!volume || !banks || !country) {
      showToast('Заполните объём, банки и страну', 'error');
      return;
    }
    const tgUser = TgWebApp?.initDataUnsafe?.user;
    const username = tgUser?.username ? String(tgUser.username) : '';
    const fullName = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ') || '';
    const { error } = await supabase.from('merchant_applications').insert({
      telegram_id: state.telegramId,
      username,
      full_name: fullName,
      volume_text: volume,
      banks_text: banks,
      country_text: country,
      experience_text: experience,
      guarantees_text: guarantees,
      time_text: timeText,
      status: 'pending'
    });
    if (error) {
      showToast(error.message || 'Ошибка отправки', 'error');
      return;
    }
    showSuccess('Заявка отправлена');
    showToast('Ожидайте решения в боте');
    showPage('profile');
    loadProfile();
  });

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

  document.querySelectorAll('.screen-header.with-back .btn-back').forEach(btn => {
    btn.addEventListener('click', () => {
      if (typeof requisitesBack === 'function' && requisitesBack()) return;
      const header = btn.closest('.screen-header.with-back');
      const back = header?.dataset.back || 'dashboard';
      showPage(back);
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
