const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const chrome = chromeCandidates.find(candidate => fs.existsSync(candidate));
if (!chrome) throw new Error('Google Chrome não encontrado para o teste visual local.');

const publicConfig = {
  brandName: 'Primeira Fornada',
  heroTitle: 'Primeira Fornada 🍰',
  heroSubtitle: 'Bolos artesanais por encomenda.',
  description: 'Escolha o sabor e o tamanho para reservar seu bolo.',
  flavors: ['Chocolate', 'Ninho com morango'],
  sizes: [
    { id: 'p', name: 'Pequeno', description: 'Serve aproximadamente 8 pessoas', price: 89 },
    { id: 'm', name: 'Médio', description: 'Serve aproximadamente 15 pessoas', price: 129 }
  ],
  payments: [{ id: 'pix', name: 'PIX', type: 'pix', description: 'Pagamento via PIX', paymentLink: '', active: true }],
  progressivePricing: { firstSlicePrice: 19.97, additionalSlicePrice: 15 },
  fulfillment: {
    pickupEnabled: true, deliveryEnabled: true, deliveryFeeCents: 800,
    pickupAddress: 'Endereço comercial fictício, 100 — Centro', pickupInstructions: 'Retirada das 9h às 12h.',
    deliveryInstructions: 'Entregas fictícias a partir das 14h.'
  },
  availability: {
    enabled: true,
    days: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true },
    deliveryDay: 'sunday', paymentDeadlineDay: 'thursday', paymentDeadlineTime: '23:59:59'
  }
};

const visualConfirmedPayment = {
  orderId: 'PF-I-RETORNO-VISUAL-COM-IDENTIFICADOR-LONGO-001', paymentState: 'confirmed', reviewRequired: false,
  order: {
    id: 'PF-I-RETORNO-VISUAL-COM-IDENTIFICADOR-LONGO-001', status: 'Confirmado', totalQuantity: 6, total: 92.91, subtotal: 84.91, deliveryFee: 8, deliveryDate: '2026-10-25',
    items: [
      { flavor: 'Chocolate com brigadeiro belga', quantity: 3, subtotal: 49.97, pricingModel: 'progressive-v1' },
      { flavor: 'Ninho com morango e decoração especial', quantity: 3, subtotal: 34.94, pricingModel: 'progressive-v1' }
    ],
    fulfillment: { mode: 'delivery' }
  }
};

const DEFAULT_STATUSES = ['Aguardando pagamento', 'Confirmado', 'Em produção', 'Concluído', 'Cancelado'];
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bologis-visual-'));
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let adminPreviewHtml = '';

function runChrome(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errorText = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errorText += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`Chrome terminou com ${code}: ${errorText}`)));
  });
}

function classListFor(dom, id) {
  const match = dom.match(new RegExp(`<[^>]+id="${id}"[^>]*class="([^"]*)"`, 'i'));
  return match ? match[1].split(/\s+/).filter(Boolean) : [];
}

// Chrome DevTools Protocol: viewport exata (o --window-size do headless não reduz abaixo de ~500px).
async function launchDevTools() {
  const profile = fs.mkdtempSync(path.join(tempDir, 'profile-'));
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--remote-debugging-port=0',
    // Headless não informa dispositivo apontador; simula mouse fino (o toque é emulado por página).
    '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error('Chrome DevTools não respondeu.')), 20_000);
    child.stderr.on('data', chunk => {
      buffer += chunk;
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.on('error', reject);
  });
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve); socket.addEventListener('error', reject); });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
      else resolve(message.result);
    } else listeners.forEach(listener => listener(message));
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  return {
    async openPage(url, viewport) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const pageSend = (method, params) => send(method, params, sessionId);
      await pageSend('Page.enable');
      await pageSend('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
      const loaded = new Promise(resolve => {
        const listener = message => {
          if (message.sessionId === sessionId && message.method === 'Page.loadEventFired') { listeners.delete(listener); resolve(); }
        };
        listeners.add(listener);
      });
      await pageSend('Page.navigate', { url });
      await loaded;
      return {
        async evaluate(expression) {
          const result = await pageSend('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
          if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
          return result.result.value;
        },
        async screenshot(file) {
          const { data } = await pageSend('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(file, Buffer.from(data, 'base64'));
        },
        send: pageSend,
        close: () => send('Target.closeTarget', { targetId })
      };
    },
    async close() {
      const exited = child.exitCode !== null ? Promise.resolve() : new Promise(resolve => child.once('exit', resolve));
      try { await send('Browser.close'); } catch (_) { /* navegador já encerrado */ }
      socket.close();
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5_000))]);
      if (child.exitCode === null) child.kill();
    }
  };
}

// Formulário público com um sabor e entrega selecionada; depois confirma que a retirada esconde o endereço.
// Retorno do checkout: aguarda o estado final devolvido pela API simulada e mede a tela.
const PAYMENT_RETURN_PROBE = `(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const shown = id => getComputedStyle(document.getElementById(id)).display !== 'none' && document.getElementById(id).getClientRects().length > 0;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (shown('paymentConfirmedState') || (shown('paymentVerifyingState') && !document.getElementById('recheckPaymentBtn').disabled)) break;
    await wait(100);
  }
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const card = document.getElementById('paymentReturnView').getBoundingClientRect();
  const state = shown('paymentConfirmedState') ? 'confirmed' : 'verifying';
  const surface = document.getElementById(state === 'confirmed' ? 'paymentConfirmedState' : 'paymentVerifyingState');
  const visible = [...surface.querySelectorAll('a, button, .summary-row')].filter(element => element.getClientRects().length);
  return {
    state,
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    within: visible.every(element => { const rect = element.getBoundingClientRect(); return rect.left >= card.left - 1 && rect.right <= card.right + 1; }),
    tapTargets: [...surface.querySelectorAll('a, button')].filter(element => element.getClientRects().length).every(element => element.getBoundingClientRect().height >= 44),
    title: surface.querySelector('h1').textContent,
    message: document.getElementById('returnPaymentMessage').textContent,
    orderNumber: document.getElementById(state === 'confirmed' ? 'confirmedOrderNumber' : 'returnOrderNumber').textContent,
    total: document.getElementById('confirmedTotal').textContent,
    urlClean: location.search === '?public=1'
  };
})()`;

const PUBLIC_FORM_PROBE = `(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  for (let attempt = 0; attempt < 60; attempt++) {
    if (!document.getElementById('customerView').classList.contains('hidden') && !document.getElementById('deliveryChoice').classList.contains('hidden')) break;
    await wait(100);
  }
  const ready = !document.getElementById('deliveryChoice').classList.contains('hidden');
  document.getElementById('flavorSelect').value = document.getElementById('flavorSelect').options[1]?.value || '';
  const minus = document.getElementById('itemQuantityDecrease');
  const plus = document.getElementById('itemQuantityIncrease');
  const visor = document.getElementById('itemQuantity');
  const stepperBox = document.querySelector('.quantity-stepper').getBoundingClientRect();
  const builderCard = document.querySelector('.order-card').getBoundingClientRect();
  const stepper = {
    noTypedInput: !document.querySelector('input#itemQuantity'),
    startsAtOne: visor.textContent === '1' && minus.disabled && !plus.disabled,
    within: stepperBox.left >= builderCard.left - 1 && stepperBox.right <= builderCard.right + 1,
    targets: [minus, plus].every(button => { const rect = button.getBoundingClientRect(); return rect.width >= 44 && rect.height >= 44; }),
    order: minus.getBoundingClientRect().right <= visor.getBoundingClientRect().left + 1 && visor.getBoundingClientRect().right <= plus.getBoundingClientRect().left + 1
  };
  plus.click(); plus.click();
  stepper.afterPlus = visor.textContent + '|' + document.getElementById('pricingEstimate').textContent;
  for (let i = 0; i < 25; i++) plus.click();
  stepper.capped = visor.textContent === '20' && plus.disabled;
  for (let i = 0; i < 25; i++) minus.click();
  stepper.floored = visor.textContent === '1' && minus.disabled;
  document.getElementById('addOrderItemBtn').click();
  stepper.resetAfterAdd = visor.textContent === '1';
  document.getElementById('fulfillmentDelivery').click();
  await document.fonts.ready;
  await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  const measure = () => {
    const card = document.querySelector('.order-card').getBoundingClientRect();
    const targets = [...document.querySelectorAll('#fulfillmentChoices .choice:not(.hidden), #deliveryFields .control')];
    return {
      ready,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      fieldsVisible: targets.length >= 10 && targets.every(element => element.getClientRects().length > 0),
      fieldsWithin: targets.every(element => { const rect = element.getBoundingClientRect(); return rect.left >= card.left - 1 && rect.right <= card.right + 1; }),
      feeShown: !document.getElementById('summaryDeliveryFeeRow').classList.contains('hidden'),
      total: document.getElementById('summaryTotal').textContent
    };
  };
  let previous = '';
  let result;
  for (let attempt = 0; attempt < 20; attempt++) {
    await frame();
    result = measure();
    const current = JSON.stringify(result);
    if (current === previous) break;
    previous = current;
  }
  document.getElementById('deliveryFields').scrollIntoView({ block: 'center' });
  const snapshot = { ...result, stepper };
  document.getElementById('fulfillmentPickup').click();
  await frame();
  snapshot.pickupHidesAddress = document.getElementById('deliveryFields').getClientRects().length === 0
    && document.getElementById('pickupInfo').getClientRects().length > 0;
  document.getElementById('fulfillmentDelivery').click();
  await frame();
  return snapshot;
})()`;

// Mede apenas depois de fontes, animações e layout estabilizarem (duas leituras iguais seguidas).
const STABLE_PROBE = `(async () => {
  await document.fonts.ready;
  await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  let previous = '';
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const current = JSON.stringify(window.__visualProbe());
    if (current === previous) return JSON.parse(current);
    previous = current;
  }
  throw new Error('Layout não estabilizou.');
})()`;

// Kanban: mede o quadro (inclusive com detalhes abertos) e executa drag-and-drop com eventos nativos do Chrome.
const KANBAN_PROBE = `(async () => {
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  document.getElementById('ordersKanbanViewBtn').click();
  await document.fonts.ready;
  await frame();
  const page = document.documentElement;
  const panelRect = document.querySelector('.admin-content').getBoundingClientRect();
  const board = document.querySelector('.kanban-board');
  const inPanel = element => { const rect = element.getBoundingClientRect(); return rect.left >= panelRect.left - 1 && rect.right <= panelRect.right + 1; };
  const columns = [...board.querySelectorAll('.kanban-column')];
  const cards = [...board.querySelectorAll('.kanban-card')];
  const withinCards = () => cards.every(card => {
    const box = card.getBoundingClientRect();
    return [...card.querySelectorAll('*')].filter(element => element.getClientRects().length).every(element => {
      const rect = element.getBoundingClientRect();
      return rect.left >= box.left - 1 && rect.right <= box.right + 1;
    });
  });
  const surfaceText = card => { const copy = card.cloneNode(true); copy.querySelector('details')?.remove(); return copy.textContent; };
  const layout = {
    pressed: document.getElementById('ordersKanbanViewBtn').getAttribute('aria-pressed'),
    pageOverflow: page.scrollWidth > page.clientWidth + 1,
    boardWithin: inPanel(board),
    overflowX: getComputedStyle(board).overflowX,
    columns: columns.map(column => [column.querySelector('h3').textContent, column.querySelectorAll('.kanban-card').length]),
    minColumnWidth: Math.round(Math.min(...columns.map(column => column.getBoundingClientRect().width))),
    noMoveSelect: !board.querySelector('select'),
    cardsWithin: withinCards(),
    technicalHidden: cards.every(card => !/invoice-fictitious|Valor esperado|Observação fictícia/.test(surfaceText(card))),
    shows1899: /1899|GMT-/.test(board.innerText),
    total: document.querySelector('#ordersContainer .orders-total-summary')?.innerText.trim() || ''
  };
  const details = [...board.querySelectorAll('details')];
  details.forEach(item => { item.open = true; });
  await frame();
  layout.detailsOverflow = page.scrollWidth > page.clientWidth + 1 || !inPanel(board);
  layout.detailsWithin = withinCards();
  details.forEach(item => { item.open = false; });
  await frame();

  // Restaura a preferência para a próxima resolução abrir na Lista.
  document.getElementById('ordersListViewBtn').click();
  layout.restoredList = Boolean(document.querySelector('#ordersContainer .orders-table-wrap'));
  return { layout };
})()`;

// Modal do pedido: abertura por clique, foco, fechamento, guarda de arraste, contenção e troca de status.
// Termina com o modal aberto no pedido de dados extensos para a captura de tela.
const MODAL_PROBE = `(async () => {
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const calls = [];
  const originalFetch = window.fetch.bind(window);
  window.fetch = (url, options) => { calls.push(JSON.parse(options.body)); return originalFetch(url, options); };
  document.getElementById('ordersKanbanViewBtn').click();
  await frame();
  const dialog = document.getElementById('orderModal');
  const longId = 'PF-I-IDENTIFICADOR-MUITO-LONGO-PARA-VALIDAR-QUEBRA-RESPONSIVA-001';
  const paidId = 'PF-20260831-113122-AB3E86';
  const card = id => document.querySelector('[data-kanban-card="' + id + '"]');
  const openButton = id => card(id).querySelector('.kanban-card-open');
  const result = {};

  card(longId).querySelector('.kanban-card-items').click();
  await frame();
  const page = document.documentElement;
  const rect = dialog.getBoundingClientRect();
  const scroll = document.getElementById('orderModalBody');
  const close = document.getElementById('orderModalClose').getBoundingClientRect();
  const backdropHit = document.elementFromPoint(4, Math.round(innerHeight / 2));
  const grid = getComputedStyle(scroll.querySelector('.order-modal-grid')).gridTemplateColumns.split(' ').length;
  result.open = {
    modal: dialog.open && dialog.matches(':modal'),
    title: document.getElementById('orderModalTitle').textContent,
    focus: document.activeElement?.id,
    bodyLocked: document.body.classList.contains('modal-open'),
    within: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 0.5 && rect.bottom <= innerHeight + 0.5,
    closeVisible: close.top >= 0 && close.bottom <= innerHeight && close.right <= innerWidth && close.height >= 44,
    pageOverflow: page.scrollWidth > page.clientWidth + 1,
    innerOverflowX: scroll.scrollWidth > scroll.clientWidth + 1,
    scrollsInside: getComputedStyle(scroll).overflowY === 'auto',
    backgroundInert: backdropHit === dialog || dialog.contains(backdropHit),
    columns: grid,
    sections: [...scroll.querySelectorAll('.order-modal-section h3')].map(item => item.textContent),
    statusInView: (() => { const box = document.getElementById('orderModalStatus').getBoundingClientRect(); return box.top >= rect.top && box.bottom <= Math.min(rect.bottom, innerHeight); })(),
    statusControls: dialog.querySelectorAll('select').length,
    focusOrder: [...dialog.querySelectorAll('button, a[href], select')].filter(element => element.getClientRects().length).map(element => element.id || element.textContent.trim()),
    finance: scroll.querySelector('.finance-state')?.textContent,
    tapTargets: [...dialog.querySelectorAll('button, a, select')].filter(element => element.getClientRects().length).every(element => element.getBoundingClientRect().height >= 44),
    shows1899: /1899|GMT-/.test(dialog.innerText)
  };
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await frame();
  result.escape = { closed: !dialog.open, focusRestored: document.activeElement === openButton(longId), unlocked: !document.body.classList.contains('modal-open') };

  openButton(paidId).focus();
  openButton(paidId).click();
  await frame();
  result.keyboardOpen = dialog.open && document.getElementById('orderModalTitle').textContent === 'Cliente Histórico Fictício';
  document.getElementById('orderModalClose').click();
  await frame();
  result.closeButton = { closed: !dialog.open, focusRestored: document.activeElement === openButton(paidId) };

  card(paidId).querySelector('.kanban-card-items').click();
  await frame();
  const select = document.getElementById('orderModalStatus');
  select.value = 'Concluído';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  result.saving = Boolean(document.getElementById('orderModalStatus')?.disabled) && /data-status="Concluído"/.test(document.getElementById('orderModalHeading').innerHTML)
    && card(paidId).closest('.kanban-column').dataset.kanbanColumn === 'Concluído';
  for (let attempt = 0; attempt < 50 && document.getElementById('orderModalStatus')?.disabled; attempt++) await wait(50);
  result.statusChange = {
    badge: document.querySelector('#orderModalHeading .status-badge').textContent,
    stillOpen: dialog.open,
    column: card(paidId).closest('.kanban-column').dataset.kanbanColumn,
    message: document.getElementById('orderModalMessage').textContent,
    calls: calls.filter(call => call.action === 'updateOrderStatus').map(call => [call.orderId, call.status, call.expectedStatus])
  };
  document.getElementById('orderModalClose').click();
  await frame();
  window.fetch = originalFetch;
  card(longId).querySelector('.kanban-card-items').click();
  await frame();
  return result;
})()`;

// Arraste com entrada real (Input.dispatchMouseEvent / dispatchTouchEvent): mede card flutuante,
// espaço reservado, destaque, soltura otimista e guardas (mesma coluna, fora do quadro, Escape).
const DRAG_HELPERS = `(() => {
  window.__calls = [];
  const originalFetch = window.fetch.bind(window);
  window.fetch = (url, options) => { window.__calls.push(JSON.parse(options.body)); return originalFetch(url, options); };
  document.getElementById('ordersKanbanViewBtn').click();
  const card = id => document.querySelector('[data-kanban-card="' + id + '"]');
  const column = status => document.querySelector('.kanban-column[data-kanban-column="' + status + '"]');
  const clip = (rect, box) => ({ left: Math.max(rect.left, box.left), right: Math.min(rect.right, box.right), top: Math.max(rect.top, 0), bottom: Math.min(rect.bottom, innerHeight) });
  window.__drag = {
    prepare(id, status) {
      const board = document.querySelector('.kanban-board');
      // O html usa scroll-behavior: smooth; a preparação precisa de rolagem instantânea.
      card(id).scrollIntoView({ block: 'center', behavior: 'instant' });
      board.scrollLeft = Math.max(0, column(status).offsetLeft - board.clientWidth / 2);
      const box = board.getBoundingClientRect();
      const source = clip(card(id).querySelector('.kanban-card-items').getBoundingClientRect(), box);
      const zone = clip(column(status).querySelector('.kanban-dropzone').getBoundingClientRect(), box);
      const cardBox = card(id).getBoundingClientRect();
      const start = { x: Math.round(source.left + 12), y: Math.round((source.top + source.bottom) / 2) };
      return { start, end: { x: Math.round((zone.left + zone.right) / 2), y: Math.round(zone.top + 30) }, offset: { x: cardBox.left + cardBox.width / 2 - start.x, y: cardBox.top + cardBox.height / 2 - start.y } };
    },
    point(id) {
      card(id).scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const rect = card(id).querySelector('.kanban-card-items').getBoundingClientRect();
      const box = document.querySelector('.kanban-board').getBoundingClientRect();
      const visible = clip(rect, box);
      return { x: Math.round(visible.left + 12), y: Math.round((visible.top + visible.bottom) / 2) };
    },
    state(id) {
      const ghost = document.querySelector('.kanban-drag-ghost')?.getBoundingClientRect();
      const placeholder = document.querySelector('.kanban-drop-placeholder');
      return {
        ghost: ghost ? { cx: ghost.left + ghost.width / 2, cy: ghost.top + ghost.height / 2 } : null,
        placeholder: placeholder?.closest('.kanban-column')?.dataset.kanbanColumn || '',
        highlighted: [...document.querySelectorAll('.kanban-column.is-drop-target')].map(item => item.dataset.kanbanColumn),
        source: Boolean(card(id)?.classList.contains('is-drag-source')),
        column: card(id)?.closest('.kanban-column')?.dataset.kanbanColumn || '',
        saving: Boolean(card(id)?.classList.contains('is-saving')),
        counts: Object.fromEntries([...document.querySelectorAll('.kanban-column')].map(item => [item.dataset.kanbanColumn || 'Outros status', Number(item.querySelector('.kanban-count').textContent)])),
        modalOpen: document.getElementById('orderModal').open,
        dragging: document.body.classList.contains('kanban-dragging'),
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        calls: window.__calls.filter(call => call.action === 'updateOrderStatus').map(call => [call.orderId, call.status, call.expectedStatus])
      };
    },
    async settle(id) { for (let attempt = 0; attempt < 60 && card(id)?.classList.contains('is-saving'); attempt++) await new Promise(resolve => setTimeout(resolve, 50)); },
    frames: () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  };
})()`;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Arquivamento: prepara um pedido Concluído pelo modal e mede o botão, filtros e desarquivamento.
const ARCHIVE_HELPERS = `(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.__calls = [];
  const originalFetch = window.fetch.bind(window);
  window.fetch = (url, options) => { window.__calls.push(JSON.parse(options.body)); return originalFetch(url, options); };
  document.getElementById('ordersKanbanViewBtn').click();
  await frames();
  const card = id => document.querySelector('[data-kanban-card="' + id + '"]');
  const paidId = 'PF-20260831-113122-AB3E86';
  card(paidId).querySelector('.kanban-card-items').click();
  await frames();
  const select = document.getElementById('orderModalStatus');
  select.value = 'Concluído';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  for (let attempt = 0; attempt < 60 && card(paidId)?.classList.contains('is-saving'); attempt++) await wait(50);
  document.getElementById('orderModalClose').click();
  await frames();
  // Fechar o modal devolve o foco ao card (o que já revela o botão); a medição parte sem foco.
  document.activeElement?.blur?.();
  window.__archive = {
    show(id) {
      card(id).scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const box = card(id).getBoundingClientRect();
      const button = card(id).querySelector('[data-archive-order], [data-unarchive-order]')?.getBoundingClientRect();
      return { card: { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height - 14) }, button: button ? { x: Math.round(button.left + button.width / 2), y: Math.round(button.top + button.height / 2), width: Math.round(button.width), height: Math.round(button.height) } : null };
    },
    button(id) {
      const element = card(id)?.querySelector('.kanban-archive-btn');
      if (!element) return null;
      const style = getComputedStyle(element);
      const top = card(id).querySelector('.kanban-card-top').getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      return { opacity: Number(style.opacity), background: style.backgroundColor, label: element.getAttribute('aria-label'), overlapsChip: rect.left < card(id).querySelector('.kanban-chip').getBoundingClientRect().right && rect.top < top.bottom };
    },
    focusCard(id) { card(id).querySelector('.kanban-card-open').focus(); return document.activeElement === card(id).querySelector('.kanban-card-open'); },
    filter(value) { const element = document.getElementById('orderArchiveFilter'); element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })); },
    state(id) {
      return {
        column: card(id)?.closest('.kanban-column')?.dataset.kanbanColumn || '',
        saving: Boolean(card(id)?.querySelector('.kanban-saving')),
        archivedMeta: card(id)?.querySelector('.kanban-archived-meta')?.textContent || '',
        unarchive: Boolean(card(id)?.querySelector('[data-unarchive-order]')),
        concluded: Number(document.querySelector('.kanban-column[data-kanban-column="Concluído"] .kanban-count')?.textContent || 0),
        total: document.querySelector('#ordersContainer .orders-total-summary strong')?.textContent || '',
        modalOpen: document.getElementById('orderModal').open,
        ghost: Boolean(document.querySelector('.kanban-drag-ghost')),
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        calls: window.__calls.filter(call => ['archiveOrder', 'unarchiveOrder'].includes(call.action)).map(call => [call.action, call.orderId, call.expectedStatus])
      };
    },
    async settle() { const count = () => window.__calls.filter(call => ['archiveOrder', 'unarchiveOrder'].includes(call.action)).length; const before = count(); await wait(700); return count() >= before; },
    frames
  };
  return true;
})()`;

async function mouseClick(page, point) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'none', buttons: 0 });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
}

async function mouseDrag(page, from, to, { steps = 8, beforeRelease } = {}) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, button: 'none', buttons: 0 });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let step = 1; step <= steps; step++) {
    const x = Math.round(from.x + (to.x - from.x) * step / steps);
    const y = Math.round(from.y + (to.y - from.y) * step / steps);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
  }
  await page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const during = beforeRelease ? await beforeRelease() : null;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
  return during;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/api') {
    let raw = '';
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch (_) {}
      response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      if (body.action === 'updateOrderStatus') {
        return setTimeout(() => response.end(JSON.stringify({ ok: true, order: { id: body.orderId, status: body.status, previousStatus: body.expectedStatus } })), 350);
      }
      if (body.action === 'archiveOrder' || body.action === 'unarchiveOrder') {
        const archivedAt = body.action === 'archiveOrder' ? '2026-10-23T18:30:00.000Z' : '';
        return setTimeout(() => response.end(JSON.stringify({ ok: true, order: { id: body.orderId, status: body.expectedStatus, archivedAt, unchanged: false } })), 350);
      }
      if (body.action === 'registerCheckoutReturn') return response.end(JSON.stringify({ ok: true, checkout: { state: 'returned_unverified' } }));
      if (body.action === 'verifyCheckoutPayment') {
        // Somente a resposta do servidor libera a tela de obrigado; a URL de teste também tenta forçá-la.
        const payment = body.checkoutToken === 'visual-confirmed'
          ? visualConfirmedPayment
          : { orderId: body.order_nsu, paymentState: 'verifying', reviewRequired: true };
        return response.end(JSON.stringify({ ok: true, payment }));
      }
      response.end(JSON.stringify({ ok: true, config: publicConfig }));
    });
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(url.pathname === '/admin-preview' ? adminPreviewHtml : html);
});

(async () => {
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;
    html = html
      .replace(/const APPS_SCRIPT_URL = '[^']*';/, `const APPS_SCRIPT_URL = '${origin}/api';`)
      .replace('connect-src https://script.google.com https://script.googleusercontent.com', `connect-src ${origin}`);

    const fakeOrders = [
      {
        id: 'PF-20260831-113122-AB3E86', createdAt: '2026-08-31T14:31:22Z', customerName: 'Cliente Histórico Fictício',
        whatsapp: '(34) 97777-3333', date: '2026-09-06', time: 'Sat Dec 30 1899 00:00:00 GMT-0306 (Horário Padrão de Brasília)',
        total: 49.97, price: 49.97, payment: 'PIX', notes: '', status: 'Confirmado',
        items: [{ flavor: 'Bolo de Choconinho (Massa branca, recheio de brigadeiro e creme de ninho)', sizeId: '3f', size: '3 Fatias', quantity: 1, unitPrice: 49.97, subtotal: 49.97, pricingModel: 'legacy-size' }],
        checkout: { state: 'not_created', available: false }
      },
      {
        id: 'PF-I-IDENTIFICADOR-MUITO-LONGO-PARA-VALIDAR-QUEBRA-RESPONSIVA-001',
        createdAt: '2026-10-20T12:00:00Z', customerName: 'Cliente com nome excepcionalmente extenso para validação visual',
        whatsapp: '(34) 99999-1111', date: '2026-10-25', time: '10:00', total: 124.91, totalQuantity: 7,
        payment: 'InfinitePay — PIX ou cartão', status: 'Aguardando pagamento',
        notes: 'Observação fictícia longa: separar cuidadosamente os sabores, manter longe de castanhas e confirmar a retirada pelo WhatsApp antes do horário combinado.',
        items: [
          { flavor: 'Chocolate com brigadeiro belga', quantity: 3, subtotal: 49.97, savings: 9.94, pricingModel: 'progressive-v1' },
          { flavor: 'Ninho com morango e decoração especial', quantity: 2, subtotal: 34.97, savings: 4.97, pricingModel: 'progressive-v1' },
          { flavor: 'Cenoura com chocolate', quantity: 2, subtotal: 39.97, savings: 0, pricingModel: 'progressive-v1' }
        ],
        checkout: { state: 'returned_unverified', available: true, url: 'https://checkout.infinitepay.com.br/fictitious', chargeId: 'invoice-fictitious-long-reference-001', expectedAmountCents: 12491, expiresAt: '2026-10-22T23:59:59-03:00' },
        subtotal: 116.91, deliveryFee: 8,
        fulfillment: {
          mode: 'delivery', instructions: 'Entregas fictícias a partir das 14h.',
          address: { cep: '38400000', street: 'Avenida Fictícia com Nome Bastante Extenso para Validação', number: '1234', complement: 'Bloco B, apartamento 302', neighborhood: 'Bairro Exemplo Muito Longo', city: 'Cidade Exemplo', state: 'MG', reference: 'Em frente à praça fictícia' }
        }
      },
      {
        id: 'PF-HML-102', createdAt: '2026-10-19T12:00:00Z', customerName: 'Pessoa de Teste',
        whatsapp: '(34) 98888-2222', date: '2026-10-26', time: '14:00', total: 34.97, totalQuantity: 2,
        payment: 'InfinitePay — PIX ou cartão', notes: '', status: 'Pagamento não confirmado',
        items: [{ flavor: 'Ninho com morango', quantity: 2, subtotal: 34.97, savings: 4.97, pricingModel: 'progressive-v1' }],
        checkout: { state: 'not_created', available: false },
        subtotal: 34.97, deliveryFee: 0,
        fulfillment: { mode: 'pickup', address: null, instructions: 'Endereço comercial fictício, 100 — Centro — Retirada das 9h às 12h.' }
      }
    ];
    adminPreviewHtml = html.replace(
      'initializeApp();',
      `config = normalizeConfig(${JSON.stringify({ ...publicConfig, revision: '7', flavorItems: publicConfig.flavors.map((name, index) => ({ id: `f-${index}`, name, active: index === 0, order: index + 1 })), orderStatuses: DEFAULT_STATUSES })});
       appState.config = config;
       appState.orders = ${JSON.stringify(fakeOrders)};
       adminWasUnlocked = true;
       document.getElementById('initialLoading').classList.add('hidden');
       document.getElementById('appTopbar').classList.remove('hidden');
       document.getElementById('adminAuthView').classList.add('hidden');
       renderAdmin();
       window.__visualProbe = () => {
         const page = document.documentElement;
         const panel = document.querySelector('.admin-content');
         const tableWrap = document.querySelector('.orders-table-wrap');
         const cards = document.querySelector('.orders-mobile-list');
         const panelRect = panel.getBoundingClientRect();
         const tableVisible = getComputedStyle(tableWrap).display !== 'none';
         const surface = tableVisible ? tableWrap : cards;
         const inPanel = element => {
           const rect = element.getBoundingClientRect();
           return rect.left >= panelRect.left - 1 && rect.right <= panelRect.right + 1;
         };
         const controls = [...document.querySelectorAll('.orders-toolbar .control')].concat([...surface.querySelectorAll('.order-status')]);
         const canvas = document.createElement('canvas').getContext('2d');
         const statusSelects = [...surface.querySelectorAll('.order-status')].map(select => {
           const style = getComputedStyle(select);
           canvas.font = style.font;
           const text = select.selectedOptions[0]?.text || '';
           const available = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 22;
           return { text, title: select.title, fits: canvas.measureText(text).width <= available, width: Math.round(select.getBoundingClientRect().width) };
         });
         const mainRowHeights = [...surface.querySelectorAll('tr.order-row')].map(row => Math.round(row.getBoundingClientRect().height));
         const closedDetails = [...surface.querySelectorAll('details:not([open])')];
         const hiddenRows = [...surface.querySelectorAll('tr.order-details-row[hidden]')];
         closedDetails.forEach(details => { details.open = true; });
         hiddenRows.forEach(row => { row.hidden = false; });
         const detailsOverflow = page.scrollWidth > page.clientWidth + 1 || !inPanel(surface);
         closedDetails.forEach(details => { details.open = false; });
         hiddenRows.forEach(row => { row.hidden = true; });
         const totalCells = [...tableWrap.querySelectorAll('tfoot td')];
         const totalHeader = tableWrap.querySelectorAll('thead th')[3];
         const summary = cards.querySelector('.orders-total-summary');
         const lastCard = [...cards.querySelectorAll('.order-mobile-card')].at(-1);
         const visible = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).display !== 'none');
         const totals = tableVisible
           ? {
               text: totalCells[1]?.innerText.trim() || '',
               label: totalCells[0]?.innerText.trim() || '',
               statusEmpty: totalCells[2]?.innerText.trim() === '',
               aligned: Boolean(totalHeader && totalCells[1]) && Math.abs(totalCells[1].getBoundingClientRect().left - totalHeader.getBoundingClientRect().left) <= 1,
               bold: Number(getComputedStyle(totalCells[1]).fontWeight) >= 700,
               otherHidden: !visible(summary)
             }
           : {
               text: summary?.innerText.trim() || '',
               within: Boolean(summary) && inPanel(summary),
               belowList: Boolean(summary && lastCard) && summary.getBoundingClientRect().top >= lastCard.getBoundingClientRect().bottom,
               otherHidden: !visible(tableWrap)
             };
         return {
           totals,
           viewport: { width: innerWidth, height: innerHeight },
           pageOverflow: page.scrollWidth > page.clientWidth + 1,
           surfaceWithin: inPanel(surface),
           controlsWithin: controls.filter(control => control.getClientRects().length).every(inPanel),
           ordersMode: !tableVisible && getComputedStyle(cards).display !== 'none' ? 'cards' : 'table',
           detailsOverflow,
           mainRowHeights,
           shows1899: /1899|GMT-/.test(surface.innerText),
           statusSelects
         };
       };`
    );

    const common = ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--virtual-time-budget=2500'];
    const viewports = [
      { width: 390, height: 844, mode: 'cards' },
      { width: 768, height: 1024, mode: 'cards' },
      { width: 1024, height: 768, mode: 'cards' },
      { width: 1280, height: 800, mode: 'table' },
      { width: 1440, height: 1000, mode: 'table' },
      { width: 1920, height: 1080, mode: 'table' }
    ];
    const devTools = await launchDevTools();
    try {
      for (const viewport of viewports) {
        const label = `${viewport.width}x${viewport.height}`;
        const page = await devTools.openPage(`${origin}/admin-preview`, viewport);
        const layout = await page.evaluate(STABLE_PROBE);
        const screenshot = path.join(tempDir, `admin-${label}.png`);
        await page.screenshot(screenshot);
        await page.close();
        assert.deepEqual(layout.viewport, { width: viewport.width, height: viewport.height }, `Viewport real diferente de ${label}.`);
        assert.ok(fs.statSync(screenshot).size > 10_000, `Screenshot ${label} não foi renderizado corretamente.`);
        assert.equal(layout.pageOverflow, false, `A página apresentou overflow horizontal em ${label}.`);
        assert.equal(layout.surfaceWithin, true, `A superfície de pedidos saiu do painel em ${label}.`);
        assert.equal(layout.controlsWithin, true, `Um controle saiu do painel em ${label}.`);
        assert.equal(layout.ordersMode, viewport.mode, `Modo de pedidos incorreto em ${label}.`);
        assert.equal(layout.detailsOverflow, false, `Detalhes expandidos provocaram overflow em ${label}.`);
        assert.equal(layout.shows1899, false, `Horário serial de 1899 exibido em ${label}.`);
        assert.ok(layout.mainRowHeights.every(height => height <= 130), `Linha de pedido alta demais em ${label}: ${layout.mainRowHeights}.`);
        assert.match(layout.totals.text, /209,85/, `Total dos pedidos exibidos incorreto em ${label}.`);
        assert.equal(layout.totals.otherHidden, true, `Totalização duplicada entre tabela e cards em ${label}.`);
        if (viewport.mode === 'table') {
          assert.equal(layout.totals.label, 'Total dos pedidos exibidos', `Descrição do rodapé ausente em ${label}.`);
          assert.equal(layout.totals.aligned, true, `Total fora da coluna "Total" em ${label}.`);
          assert.equal(layout.totals.statusEmpty, true, `Coluna "Status" do rodapé não está vazia em ${label}.`);
          assert.equal(layout.totals.bold, true, `Total do rodapé sem destaque em ${label}.`);
        } else {
          assert.match(layout.totals.text, /^Total dos pedidos exibidos:/, `Resumo de totalização ausente em ${label}.`);
          assert.equal(layout.totals.within, true, `Resumo de totalização saiu do painel em ${label}.`);
          assert.equal(layout.totals.belowList, true, `Resumo de totalização não está abaixo dos cards em ${label}.`);
        }
        for (const status of layout.statusSelects) {
          assert.equal(status.title, status.text.replace(/ \(legado\)$/, ''), `Seletor sem identificação acessível do status em ${label}.`);
          if (DEFAULT_STATUSES.includes(status.text)) assert.ok(status.fits, `Status "${status.text}" cortado no seletor em ${label} (${status.width}px).`);
        }

        const kanbanPage = await devTools.openPage(`${origin}/admin-preview`, viewport);
        await kanbanPage.evaluate(STABLE_PROBE);
        const { layout: board } = await kanbanPage.evaluate(KANBAN_PROBE);
        await kanbanPage.evaluate(`document.getElementById('ordersKanbanViewBtn').click(); document.querySelector('.kanban-board').scrollIntoView({ block: 'start' }); new Promise(resolve => setTimeout(resolve, 2600))`);
        await kanbanPage.screenshot(path.join(tempDir, `admin-kanban-${label}.png`));
        await kanbanPage.evaluate(`document.getElementById('ordersListViewBtn').click()`);
        await kanbanPage.close();
        assert.equal(board.pressed, 'true', `Alternância Kanban sem aria-pressed em ${label}.`);
        assert.equal(board.pageOverflow, false, `Kanban provocou overflow da página em ${label}.`);
        assert.equal(board.boardWithin, true, `Quadro saiu do painel em ${label}.`);
        assert.equal(board.overflowX, 'auto', `Quadro sem rolagem horizontal contida em ${label}.`);
        assert.deepEqual(board.columns, [['Aguardando pagamento', 1], ['Confirmado', 1], ['Em produção', 0], ['Concluído', 0], ['Cancelado', 0], ['Outros status', 1]], `Distribuição das colunas incorreta em ${label}.`);
        assert.ok(board.minColumnWidth >= 240, `Coluna estreita demais em ${label}: ${board.minColumnWidth}px.`);
        assert.equal(board.noMoveSelect, true, `Seletor "Mover para…" ainda presente nos cards em ${label}.`);
        assert.equal(board.cardsWithin, true, `Conteúdo do card saiu do card em ${label}.`);
        assert.equal(board.technicalHidden, true, `Dados técnicos expostos na superfície do card em ${label}.`);
        assert.equal(board.shows1899, false, `Horário serial de 1899 exibido no Kanban em ${label}.`);
        assert.match(board.total, /^Total dos pedidos exibidos:[\s\S]*209,85/, `Total do Kanban incorreto em ${label}.`);
        assert.equal(board.detailsOverflow, false, `Detalhes abertos no Kanban provocaram overflow em ${label}.`);
        assert.equal(board.detailsWithin, true, `Detalhes abertos saíram do card em ${label}.`);
        assert.equal(board.restoredList, true, `Retorno para Lista falhou em ${label}.`);
        const dragPage = await devTools.openPage(`${origin}/admin-preview`, viewport);
        await dragPage.evaluate(STABLE_PROBE);
        await dragPage.evaluate(DRAG_HELPERS);
        await dragPage.evaluate('window.__drag.frames()');
        const paidId = 'PF-20260831-113122-AB3E86';
        const waitingId = 'PF-I-IDENTIFICADOR-MUITO-LONGO-PARA-VALIDAR-QUEBRA-RESPONSIVA-001';
        const state = id => dragPage.evaluate(`window.__drag.state(${JSON.stringify(id)})`);

        // Mouse: Confirmado → Em produção, com o card flutuante seguindo o ponteiro.
        const route = await dragPage.evaluate(`window.__drag.prepare('${paidId}', 'Em produção')`);
        const during = await mouseDrag(dragPage, route.start, route.end, {
          beforeRelease: async () => {
            const snapshot = await state(paidId);
            await dragPage.screenshot(path.join(tempDir, `admin-drag-${label}.png`));
            return snapshot;
          }
        });
        const afterDrop = await state(paidId);
        assert.ok(during.ghost, `Card flutuante ausente durante o arraste em ${label}.`);
        assert.ok(Math.abs(during.ghost.cx - (route.end.x + route.offset.x)) <= 3 && Math.abs(during.ghost.cy - (route.end.y + route.offset.y)) <= 3,
          `Card flutuante desalinhado do ponteiro em ${label}: ${JSON.stringify(during.ghost)} vs ${JSON.stringify(route)}.`);
        assert.equal(during.placeholder, 'Em produção', `Espaço de inserção ausente na coluna de destino em ${label}.`);
        assert.deepEqual(during.highlighted, ['Em produção'], `Destaque da coluna de destino incorreto em ${label}.`);
        assert.equal(during.source, true, `Card de origem não foi marcado durante o arraste em ${label}.`);
        assert.equal(during.column, 'Confirmado', `Quadro reconstruído durante o arraste em ${label}.`);
        assert.deepEqual(during.calls, [], `Requisição enviada antes de soltar em ${label}.`);
        assert.equal(during.pageOverflow, false, `Arraste provocou overflow da página em ${label}.`);
        assert.equal(afterDrop.column, 'Em produção', `Card não mudou de coluna imediatamente ao soltar em ${label}.`);
        assert.equal(afterDrop.saving, true, `Indicador de salvamento ausente após soltar em ${label}.`);
        assert.equal(afterDrop.counts.Confirmado, 0, `Contador de origem não foi atualizado em ${label}.`);
        assert.equal(afterDrop.counts['Em produção'], 1, `Contador de destino não foi atualizado em ${label}.`);
        assert.equal(afterDrop.ghost, null, `Card flutuante permaneceu após soltar em ${label}.`);
        assert.equal(afterDrop.placeholder, '', `Espaço de inserção permaneceu após soltar em ${label}.`);
        assert.equal(afterDrop.dragging, false, `Estado de arraste permaneceu em ${label}.`);
        await dragPage.evaluate(`window.__drag.settle('${paidId}')`);
        const consolidated = await state(paidId);
        assert.equal(consolidated.column, 'Em produção', `Card não consolidou após o servidor em ${label}.`);
        assert.equal(consolidated.saving, false, `Salvamento não foi concluído em ${label}.`);
        assert.equal(consolidated.modalOpen, false, `Soltar o card abriu o modal em ${label}.`);
        assert.deepEqual(consolidated.calls, [[paidId, 'Em produção', 'Confirmado']], `Requisição da movimentação incorreta em ${label}.`);

        // Soltura na própria coluna, fora do quadro e cancelamento por Escape: nenhuma requisição.
        await sleep(400);
        const own = await dragPage.evaluate(`window.__drag.point('${waitingId}')`);
        const ownDuring = await mouseDrag(dragPage, own, { x: own.x + 4, y: own.y + 40 }, { steps: 4, beforeRelease: () => state(waitingId) });
        await sleep(400);
        const outside = await dragPage.evaluate(`window.__drag.point('${waitingId}')`);
        const outsideDuring = await mouseDrag(dragPage, outside, { x: 6, y: 6 }, { steps: 6, beforeRelease: () => state(waitingId) });
        await sleep(400);
        const escape = await dragPage.evaluate(`window.__drag.point('${waitingId}')`);
        const escapeDuring = await mouseDrag(dragPage, escape, { x: escape.x + 60, y: escape.y + 20 }, {
          steps: 4,
          beforeRelease: async () => {
            const snapshot = await state(waitingId);
            await dragPage.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
            return { ...snapshot, afterEscape: (await state(waitingId)).ghost };
          }
        });
        const guarded = await state(waitingId);
        for (const [name, snapshot] of [['mesma coluna', ownDuring], ['fora do quadro', outsideDuring], ['Escape', escapeDuring]]) {
          assert.ok(snapshot.ghost, `Arraste (${name}) não foi iniciado em ${label}.`);
        }
        assert.equal(ownDuring.placeholder, '', `Mesma coluna exibiu espaço de inserção em ${label}.`);
        assert.deepEqual(outsideDuring.highlighted, [], `Fora do quadro destacou uma coluna em ${label}.`);
        assert.equal(escapeDuring.afterEscape, null, `Escape não cancelou o arraste em ${label}.`);
        assert.equal(guarded.column, 'Aguardando pagamento', `Soltura inválida moveu o card em ${label}.`);
        assert.deepEqual(guarded.calls, [[paidId, 'Em produção', 'Confirmado']], `Soltura inválida gerou requisição em ${label}.`);
        assert.equal(guarded.ghost, null, `Card flutuante permaneceu após cancelamento em ${label}.`);
        assert.equal(guarded.modalOpen, false, `Arraste cancelado abriu o modal em ${label}.`);

        // Clique simples continua abrindo o modal.
        await sleep(400);
        const clickPoint = await dragPage.evaluate(`window.__drag.point('${waitingId}')`);
        await dragPage.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clickPoint.x, y: clickPoint.y, button: 'left', buttons: 1, clickCount: 1 });
        await dragPage.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clickPoint.x, y: clickPoint.y, button: 'left', buttons: 0, clickCount: 1 });
        await dragPage.evaluate('window.__drag.frames()');
        assert.equal((await state(waitingId)).modalOpen, true, `Clique no card não abriu o modal em ${label}.`);
        await dragPage.evaluate("document.getElementById('orderModalClose').click()");

        // Toque: deslize rápido não inicia arraste; pressão longa arrasta Aguardando → Confirmado.
        await dragPage.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
        const swipe = await dragPage.evaluate(`window.__drag.point('${waitingId}')`);
        await dragPage.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: swipe.x, y: swipe.y }] });
        for (let step = 1; step <= 4; step++) await dragPage.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: swipe.x, y: swipe.y - step * 25 }] });
        await dragPage.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const swiped = await state(waitingId);
        assert.equal(swiped.ghost, null, `Deslize rápido iniciou arraste em ${label}.`);
        assert.equal(swiped.column, 'Aguardando pagamento', `Deslize rápido moveu o card em ${label}.`);
        await sleep(400);
        const touchRoute = await dragPage.evaluate(`window.__drag.prepare('${waitingId}', 'Confirmado')`);
        await dragPage.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchRoute.start.x, y: touchRoute.start.y }] });
        await sleep(320);
        for (let step = 1; step <= 8; step++) {
          await dragPage.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(touchRoute.start.x + (touchRoute.end.x - touchRoute.start.x) * step / 8), y: Math.round(touchRoute.start.y + (touchRoute.end.y - touchRoute.start.y) * step / 8) }] });
        }
        await dragPage.evaluate('window.__drag.frames()');
        const touchDuring = await state(waitingId);
        await dragPage.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const touchAfter = await state(waitingId);
        await dragPage.evaluate(`window.__drag.settle('${waitingId}')`);
        const touchFinal = await state(waitingId);
        await dragPage.evaluate("document.getElementById('ordersListViewBtn').click()");
        await dragPage.close();
        assert.ok(touchDuring.ghost, `Pressão longa não iniciou o arraste por toque em ${label}.`);
        assert.equal(touchDuring.placeholder, 'Confirmado', `Espaço de inserção ausente no arraste por toque em ${label}.`);
        assert.equal(touchAfter.column, 'Confirmado', `Toque não moveu o card imediatamente em ${label}.`);
        assert.equal(touchFinal.saving, false, `Salvamento por toque não concluiu em ${label}.`);
        assert.equal(touchFinal.modalOpen, false, `Arraste por toque abriu o modal em ${label}.`);
        assert.deepEqual(touchFinal.calls, [[paidId, 'Em produção', 'Confirmado'], [waitingId, 'Confirmado', 'Aguardando pagamento']], `Requisições do quadro incorretas em ${label}.`);

        const archivePage = await devTools.openPage(`${origin}/admin-preview`, viewport);
        const touchLayout = viewport.width <= 768;
        if (touchLayout) {
          await archivePage.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
        }
        await archivePage.evaluate(STABLE_PROBE);
        await archivePage.evaluate(ARCHIVE_HELPERS);
        const archiveId = 'PF-20260831-113122-AB3E86';
        const archiveState = () => archivePage.evaluate(`window.__archive.state('${archiveId}')`);
        let spot = await archivePage.evaluate(`window.__archive.show('${archiveId}')`);
        assert.equal((await archiveState()).column, 'Concluído', `Pedido de teste não ficou Concluído em ${label}.`);
        assert.ok(spot.button, `Botão de arquivar ausente no card Concluído em ${label}.`);
        await archivePage.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, button: 'none', buttons: 0 });
        await sleep(250);
        const idle = await archivePage.evaluate(`window.__archive.button('${archiveId}')`);
        assert.equal(idle.label, 'Arquivar pedido', `Nome acessível do botão incorreto em ${label}.`);
        assert.equal(idle.overlapsChip, false, `Botão de arquivar sobrepõe a modalidade em ${label}.`);
        if (touchLayout) {
          assert.equal(idle.opacity, 1, `Botão de arquivar oculto no toque em ${label}.`);
          assert.ok(spot.button.width >= 44 && spot.button.height >= 44, `Botão de arquivar menor que 44px no toque em ${label}.`);
        } else {
          assert.equal(idle.opacity, 0, `Botão de arquivar visível sem hover em ${label}.`);
          await archivePage.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: spot.card.x, y: spot.card.y, button: 'none', buttons: 0 });
          await sleep(250);
          const hovered = await archivePage.evaluate(`window.__archive.button('${archiveId}')`);
          assert.equal(hovered.opacity, 1, `Botão de arquivar não apareceu no hover do card em ${label}.`);
          await archivePage.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: spot.button.x, y: spot.button.y, button: 'none', buttons: 0 });
          await sleep(250);
          const onButton = await archivePage.evaluate(`window.__archive.button('${archiveId}')`);
          assert.notEqual(onButton.background, hovered.background, `Hover do botão sem destaque em ${label}.`);
          await archivePage.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, button: 'none', buttons: 0 });
          assert.equal(await archivePage.evaluate(`window.__archive.focusCard('${archiveId}')`), true);
          await sleep(250);
          assert.equal((await archivePage.evaluate(`window.__archive.button('${archiveId}')`)).opacity, 1, `Botão de arquivar não apareceu com foco no card em ${label}.`);
          await archivePage.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: spot.card.x, y: spot.card.y, button: 'none', buttons: 0 });
          await sleep(250);
        }
        await mouseClick(archivePage, spot.button);
        // Otimista: antes da resposta do servidor (350 ms) o card já saiu e contador/total mudaram.
        const archiving = await archiveState();
        assert.equal(archiving.modalOpen, false, `Botão de arquivar abriu o modal em ${label}.`);
        assert.equal(archiving.ghost, false, `Botão de arquivar iniciou arraste em ${label}.`);
        assert.equal(archiving.column, '', `Card não saiu imediatamente dos Ativos em ${label}.`);
        assert.equal(archiving.concluded, 0, `Contador não mudou imediatamente em ${label}.`);
        assert.match(archiving.total, /159,88/, `Total não mudou imediatamente em ${label}.`);
        await archivePage.evaluate(`window.__archive.settle('${archiveId}')`);
        const archivedNow = await archiveState();
        assert.equal(archivedNow.column, '', `Card arquivado continuou nos Ativos em ${label}.`);
        assert.equal(archivedNow.concluded, 0, `Contador de Concluído não foi atualizado em ${label}.`);
        assert.match(archivedNow.total, /159,88/, `Total não excluiu o pedido arquivado em ${label}.`);
        assert.deepEqual(archivedNow.calls, [['archiveOrder', archiveId, 'Concluído']], `Requisição de arquivamento incorreta em ${label}.`);
        await archivePage.evaluate("window.__archive.filter('archived')");
        await archivePage.evaluate('window.__archive.frames()');
        const archivedView = await archiveState();
        assert.equal(archivedView.column, 'Concluído', `Pedido arquivado ausente no filtro Arquivados em ${label}.`);
        assert.match(archivedView.archivedMeta, /^Arquivado em \d{2}\/\d{2}\/2026/, `Data do arquivamento ausente em ${label}.`);
        assert.equal(archivedView.unarchive, true, `Ação Desarquivar ausente em ${label}.`);
        assert.match(archivedView.total, /49,97/, `Total do filtro Arquivados incorreto em ${label}.`);
        assert.equal(archivedView.pageOverflow, false, `Filtro Arquivados provocou overflow em ${label}.`);
        spot = await archivePage.evaluate(`window.__archive.show('${archiveId}')`);
        await archivePage.screenshot(path.join(tempDir, `admin-archived-${label}.png`));
        await mouseDrag(archivePage, { x: spot.card.x, y: spot.card.y - 30 }, { x: spot.card.x - 120, y: spot.card.y }, { steps: 5, beforeRelease: () => archiveState() })
          .then(during => assert.equal(during.ghost, false, `Pedido arquivado pôde ser arrastado em ${label}.`));
        await sleep(400);
        spot = await archivePage.evaluate(`window.__archive.show('${archiveId}')`);
        await mouseClick(archivePage, spot.button);
        const unarchiving = await archiveState();
        assert.equal(unarchiving.column, '', `Pedido desarquivado não saiu imediatamente de Arquivados em ${label}.`);
        assert.match(unarchiving.total, /0,00/, `Total de Arquivados não mudou imediatamente em ${label}.`);
        await archivePage.evaluate(`window.__archive.settle('${archiveId}')`);
        assert.equal((await archiveState()).column, '', `Pedido desarquivado continuou em Arquivados em ${label}.`);
        await archivePage.evaluate("window.__archive.filter('all')");
        const allView = await archiveState();
        assert.equal(allView.column, 'Concluído', `Desarquivar não preservou o status em ${label}.`);
        assert.match(allView.total, /209,85/, `Total do filtro Todos incorreto em ${label}.`);
        assert.deepEqual(allView.calls, [['archiveOrder', archiveId, 'Concluído'], ['unarchiveOrder', archiveId, 'Concluído']], `Requisições de arquivamento incorretas em ${label}.`);
        await archivePage.evaluate("window.__archive.filter('active'); document.getElementById('ordersListViewBtn').click()");
        await archivePage.close();

        const modalPage = await devTools.openPage(`${origin}/admin-preview`, viewport);
        await modalPage.evaluate(STABLE_PROBE);
        const modal = await modalPage.evaluate(MODAL_PROBE);
        await modalPage.evaluate('document.fonts.ready.then(() => new Promise(resolve => setTimeout(resolve, 300)))');
        await modalPage.screenshot(path.join(tempDir, `admin-modal-${label}.png`));
        await modalPage.evaluate(`document.getElementById('orderModalClose').click(); document.getElementById('ordersListViewBtn').click()`);
        await modalPage.close();
        assert.equal(modal.open.modal, true, `Modal não abriu pelo clique no card em ${label}.`);
        assert.equal(modal.open.title, 'Cliente com nome excepcionalmente extenso para validação visual', `Modal abriu o pedido errado em ${label}.`);
        assert.equal(modal.open.focus, 'orderModalClose', `Foco inicial fora do modal em ${label}.`);
        assert.equal(modal.open.bodyLocked, true, `Rolagem do fundo não foi travada em ${label}.`);
        assert.equal(modal.open.within, true, `Modal ultrapassou a tela em ${label}.`);
        assert.equal(modal.open.closeVisible, true, `Botão de fechar inacessível em ${label}.`);
        assert.equal(modal.open.pageOverflow, false, `Modal provocou overflow da página em ${label}.`);
        assert.equal(modal.open.innerOverflowX, false, `Conteúdo do modal com overflow horizontal em ${label}.`);
        assert.equal(modal.open.scrollsInside, true, `Modal sem rolagem interna em ${label}.`);
        assert.equal(modal.open.backgroundInert, true, `Fundo da central interativo com o modal aberto em ${label}.`);
        assert.equal(modal.open.columns, viewport.width > 860 ? 2 : 1, `Layout do modal incorreto em ${label}.`);
        const compact = viewport.width <= 860;
        assert.deepEqual(modal.open.sections, compact
          ? ['Gestão', 'Encomenda', 'Recebimento', 'Pagamento', 'Observações do cliente', 'Cliente']
          : ['Encomenda', 'Recebimento', 'Observações do cliente', 'Gestão', 'Pagamento', 'Cliente'], `Ordem das seções do modal incorreta em ${label}.`);
        assert.equal(modal.open.statusControls, 1, `Controle de status duplicado no modal em ${label}.`);
        if (compact) assert.equal(modal.open.statusInView, true, `Seletor de status não aparece sem rolagem em ${label}.`);
        assert.deepEqual(modal.open.focusOrder, ['orderModalClose', 'orderModalStatus', 'Conferir na InfinitePay', 'Abrir checkout', 'Abrir conversa no WhatsApp'], `Ordem de foco do modal incorreta em ${label}.`);
        assert.equal(modal.open.finance, 'Aguardando confirmação da InfinitePay', `Situação financeira incorreta em ${label}.`);
        assert.equal(modal.open.tapTargets, true, `Controles do modal menores que 44px em ${label}.`);
        assert.equal(modal.open.shows1899, false, `Horário serial exibido no modal em ${label}.`);
        assert.deepEqual(modal.escape, { closed: true, focusRestored: true, unlocked: true }, `Escape não fechou ou não restaurou o foco em ${label}.`);
        assert.equal(modal.keyboardOpen, true, `Botão do card não abriu o modal em ${label}.`);
        assert.deepEqual(modal.closeButton, { closed: true, focusRestored: true }, `Botão X não fechou ou não restaurou o foco em ${label}.`);
        assert.equal(modal.saving, true, `Modal não mostrou salvamento antes da resposta em ${label}.`);
        assert.equal(modal.statusChange.badge, 'Concluído', `Status do modal não atualizou em ${label}.`);
        assert.equal(modal.statusChange.stillOpen, true, `Modal fechou após salvar em ${label}.`);
        assert.equal(modal.statusChange.column, 'Concluído', `Card não mudou de coluna após salvar pelo modal em ${label}.`);
        assert.match(modal.statusChange.message, /movido para Concluído/, `Confirmação ausente no modal em ${label}.`);
        assert.deepEqual(modal.statusChange.calls, [['PF-20260831-113122-AB3E86', 'Concluído', 'Confirmado']], `Requisição do modal incorreta em ${label}.`);

        for (const [token, expected] of [['visual-verifying', 'verifying'], ['visual-confirmed', 'confirmed']]) {
          const forced = expected === 'verifying' ? '&paid=true&paymentState=confirmed&status=Confirmado' : '';
          const returnPage = await devTools.openPage(`${origin}/?payment_return=1&order_nsu=PF-I-RETORNO-VISUAL-COM-IDENTIFICADOR-LONGO-001&checkout_token=${token}&slug=inv&transaction_nsu=tx${forced}`, viewport);
          const paymentReturn = await returnPage.evaluate(PAYMENT_RETURN_PROBE);
          await returnPage.screenshot(path.join(tempDir, `payment-${expected}-${label}.png`));
          await returnPage.close();
          assert.equal(paymentReturn.state, expected, `Estado do retorno incorreto em ${label}.`);
          assert.equal(paymentReturn.pageOverflow, false, `Retorno do pagamento com overflow em ${label}.`);
          assert.equal(paymentReturn.within, true, `Conteúdo do retorno saiu do card em ${label}.`);
          assert.equal(paymentReturn.tapTargets, true, `Ações do retorno menores que 44px em ${label}.`);
          assert.equal(paymentReturn.urlClean, true, `Token do checkout permaneceu na URL em ${label}.`);
          assert.match(paymentReturn.orderNumber, /PF-I-RETORNO-VISUAL/, `Número do pedido ausente no retorno em ${label}.`);
          if (expected === 'confirmed') {
            assert.match(paymentReturn.title, /Obrigado/, `Tela de obrigado ausente em ${label}.`);
            assert.match(paymentReturn.total, /92,91/, `Resumo confirmado incorreto em ${label}.`);
          } else {
            assert.match(paymentReturn.title, /Verificando seu pagamento/, `Estado de verificação ausente em ${label}.`);
            assert.doesNotMatch(paymentReturn.message, /foi confirmad|está confirmad/, `Verificação afirmou pagamento em ${label}.`);
          }
        }

        const publicPage = await devTools.openPage(`${origin}/?public=1`, viewport);
        const form = await publicPage.evaluate(PUBLIC_FORM_PROBE);
        await publicPage.screenshot(path.join(tempDir, `public-delivery-${label}.png`));
        await publicPage.close();
        assert.equal(form.ready, true, `Formulário público não carregou em ${label}.`);
        assert.equal(form.pageOverflow, false, `Formulário com entrega apresentou overflow em ${label}.`);
        assert.equal(form.fieldsVisible, true, `Campos de endereço ocultos com entrega selecionada em ${label}.`);
        assert.equal(form.fieldsWithin, true, `Campos de recebimento saíram do formulário em ${label}.`);
        assert.equal(form.feeShown, true, `Taxa de entrega ausente no resumo em ${label}.`);
        assert.match(form.total, /27,97/, `Total com taxa incorreto em ${label}.`);
        assert.equal(form.pickupHidesAddress, true, `Retirada manteve campos de endereço em ${label}.`);
        assert.equal(form.stepper.noTypedInput, true, `Quantidade ainda usa campo digitável em ${label}.`);
        assert.equal(form.stepper.startsAtOne, true, `Contador não inicia em 1 com "-" desabilitado em ${label}.`);
        assert.equal(form.stepper.within, true, `Contador de fatias saiu do formulário em ${label}.`);
        assert.equal(form.stepper.targets, true, `Botões do contador menores que 44px em ${label}.`);
        assert.equal(form.stepper.order, true, `Ordem "-", visor, "+" incorreta em ${label}.`);
        assert.match(form.stepper.afterPlus, /^3\|3 fatias[\s\S]*49,97[\s\S]*Economia/, `Prévia não acompanhou o contador em ${label}.`);
        assert.equal(form.stepper.capped, true, `Contador ultrapassou 20 fatias em ${label}.`);
        assert.equal(form.stepper.floored, true, `Contador ficou abaixo de 1 fatia em ${label}.`);
        assert.equal(form.stepper.resetAfterAdd, true, `Contador não voltou a 1 após adicionar em ${label}.`);
      }
    } finally {
      await devTools.close();
    }
    const adminDom = await runChrome([...common, '--dump-dom', `${origin}/`]);
    const previewDom = await runChrome([...common, '--dump-dom', `${origin}/admin-preview`]);
    const publicDom = await runChrome([...common, '--dump-dom', `${origin}/?public=1`]);

    assert.equal(classListFor(adminDom, 'adminAuthView').includes('hidden'), false);
    assert.equal(classListFor(adminDom, 'adminView').includes('hidden'), true);
    assert.equal(classListFor(publicDom, 'customerView').includes('hidden'), false);
    assert.equal(classListFor(publicDom, 'adminAuthView').includes('hidden'), true);
    assert.match(publicDom, /id="pricingEstimate"/);
    assert.doesNotMatch(publicDom, /id="sizeChoices"/);
    assert.equal(classListFor(previewDom, 'adminView').includes('hidden'), false);
    assert.match(previewDom, /id="pricingPanel"/);
    assert.match(previewDom, /order-mobile-card/);
    assert.match(previewDom, /PF-I-IDENTIFICADOR-MUITO-LONGO-PARA-VALIDAR-QUEBRA-RESPONSIVA-001/);
    assert.match(previewDom, /PF-HML-102/);
    console.log('PASS central protegida sem sessão');
    console.log('PASS central operacional sem overflow em viewports reais 390x844, 768x1024, 1024x768, 1280x800, 1440x1000 e 1920x1080');
    console.log('PASS cards responsivos e tabela desktop permanecem dentro do painel, inclusive com detalhes abertos');
    console.log('PASS seletor de status legível e identificado em todas as resoluções');
    console.log('PASS total dos pedidos exibidos no rodapé da tabela e abaixo dos cards nas seis resoluções');
    console.log('PASS Kanban com seis colunas, cards contidos, rolagem horizontal restrita ao quadro e total reutilizado nas seis resoluções');
    console.log('PASS arraste real (mouse e toque): card flutuante alinhado ao ponteiro, espaço de inserção, destaque e mudança imediata de coluna');
    console.log('PASS movimentação otimista: contadores atualizados, salvamento discreto, consolidação após o servidor; mesma coluna, fora do quadro e Escape sem requisição');
    console.log('PASS toque: deslize rápido preserva a rolagem; pressão longa arrasta; clique abre o modal e soltar não abre');
    console.log('PASS modal do pedido: clique, teclado, Escape, X, foco restaurado, fundo inerte, sem abrir após arraste e contido nas seis resoluções');
    console.log('PASS modal compacto (390, 768): Gestão logo abaixo do cabeçalho; desktop (1024+) mantém duas colunas; um único seletor de status');
    console.log('PASS arquivamento otimista: botão no hover/foco (desktop) e sempre visível com 44px (toque); card, contador e total mudam antes da resposta do servidor');
    console.log('PASS filtros Ativos, Arquivados e Todos com data do arquivamento, total correto, sem arrastar arquivados e com desarquivamento');
    console.log('PASS formulário com entrega e retirada contido nas seis resoluções');
    console.log('PASS retorno do pagamento: verificação e tela de obrigado validada pelo servidor nas seis resoluções');
    console.log('PASS contador de fatias com limites 1–20, prévia imediata e botões acessíveis nas seis resoluções');
    if (process.argv.includes('--keep')) console.log(`ARTEFATOS_VISUAIS=${tempDir}`);
  } finally {
    server.close();
    if (!process.argv.includes('--keep')) fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
