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
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
  const calls = [];
  const originalFetch = window.fetch.bind(window);
  window.fetch = (url, options) => { calls.push(JSON.parse(options.body)); return originalFetch(url, options); };
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
    moveTargets: [...board.querySelectorAll('.kanban-move-select')].every(select => select.getBoundingClientRect().height >= 44),
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

  const card = id => document.querySelector('[data-kanban-card="' + id + '"]');
  const drag = (id, status) => {
    const column = document.querySelector('.kanban-column[data-kanban-column="' + status + '"]');
    const data = new DataTransfer();
    card(id).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data });
    column.dispatchEvent(over);
    const state = { accepted: over.defaultPrevented, highlighted: column.classList.contains('is-drop-target') };
    column.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
    card(id)?.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }));
    return state;
  };
  const paidId = 'PF-20260831-113122-AB3E86';
  const waitingId = 'PF-I-IDENTIFICADOR-MUITO-LONGO-PARA-VALIDAR-QUEBRA-RESPONSIVA-001';
  const columnOf = id => card(id)?.closest('.kanban-column')?.dataset.kanbanColumn;
  const settle = async id => { for (let attempt = 0; attempt < 50 && card(id)?.classList.contains('is-saving'); attempt++) await wait(50); };
  const dnd = { same: drag(paidId, 'Confirmado'), callsBeforeMove: calls.length };
  dnd.move = drag(paidId, 'Em produção');
  dnd.whileSaving = { column: columnOf(paidId), saving: card(paidId).classList.contains('is-saving'), draggable: card(paidId).getAttribute('draggable') };
  // Card em salvamento não aceita nova soltura: evita requisições duplicadas.
  dnd.duplicate = drag(paidId, 'Concluído');
  await settle(paidId);
  dnd.after = columnOf(paidId);
  // Pula etapas (Aguardando → Concluído) e volta (Em produção → Aguardando) sem diálogos.
  window.confirm = () => { throw new Error('Diálogo inesperado'); };
  dnd.skip = drag(waitingId, 'Concluído');
  await settle(waitingId);
  dnd.back = drag(paidId, 'Aguardando pagamento');
  await settle(paidId);
  dnd.final = [columnOf(paidId), columnOf(waitingId)];
  dnd.calls = calls.filter(call => call.action === 'updateOrderStatus').map(call => [call.orderId, call.status, call.expectedStatus]);
  dnd.leftover = document.querySelectorAll('.is-drop-target, .is-dragging').length;
  window.fetch = originalFetch;
  // Restaura a preferência para a próxima resolução abrir na Lista.
  document.getElementById('ordersListViewBtn').click();
  layout.restoredList = Boolean(document.querySelector('#ordersContainer .orders-table-wrap'));
  return { layout, dnd };
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

  const data = new DataTransfer();
  card(paidId).dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
  card(paidId).dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }));
  card(paidId).querySelector('.kanban-card-items').click();
  await frame();
  result.dragGuard = !dialog.open;
  await wait(400);
  card(paidId).querySelector('.kanban-move-select').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  result.selectGuard = !dialog.open;

  card(paidId).querySelector('.kanban-card-items').click();
  await frame();
  const select = document.getElementById('orderModalStatus');
  select.value = 'Concluído';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  result.saving = Boolean(document.getElementById('orderModalStatus')?.disabled) && /data-status="Confirmado"/.test(document.getElementById('orderModalHeading').innerHTML);
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
        return setTimeout(() => response.end(JSON.stringify({ ok: true, order: { id: body.orderId, status: body.status, previousStatus: body.expectedStatus } })), 120);
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
        const { layout: board, dnd } = await kanbanPage.evaluate(KANBAN_PROBE);
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
        assert.equal(board.moveTargets, true, `Controle "Mover para" menor que 44px em ${label}.`);
        assert.equal(board.cardsWithin, true, `Conteúdo do card saiu do card em ${label}.`);
        assert.equal(board.technicalHidden, true, `Dados técnicos expostos na superfície do card em ${label}.`);
        assert.equal(board.shows1899, false, `Horário serial de 1899 exibido no Kanban em ${label}.`);
        assert.match(board.total, /^Total dos pedidos exibidos:[\s\S]*209,85/, `Total do Kanban incorreto em ${label}.`);
        assert.equal(board.detailsOverflow, false, `Detalhes abertos no Kanban provocaram overflow em ${label}.`);
        assert.equal(board.detailsWithin, true, `Detalhes abertos saíram do card em ${label}.`);
        assert.equal(board.restoredList, true, `Retorno para Lista falhou em ${label}.`);
        assert.deepEqual(dnd.same, { accepted: false, highlighted: false }, `Mesma coluna aceitou soltura em ${label}.`);
        assert.equal(dnd.callsBeforeMove, 0, `Soltura na mesma coluna gerou requisição em ${label}.`);
        assert.deepEqual(dnd.move, { accepted: true, highlighted: true }, `Coluna de destino não foi destacada em ${label}.`);
        assert.deepEqual(dnd.whileSaving, { column: 'Confirmado', saving: true, draggable: 'false' }, `Card mudou antes da resposta do servidor em ${label}.`);
        assert.deepEqual(dnd.duplicate, { accepted: false, highlighted: false }, `Card em salvamento aceitou nova soltura em ${label}.`);
        assert.equal(dnd.after, 'Em produção', `Card não foi para a coluna de destino em ${label}.`);
        assert.deepEqual(dnd.skip, { accepted: true, highlighted: true }, `Salto de etapa recusado em ${label}.`);
        assert.deepEqual(dnd.back, { accepted: true, highlighted: true }, `Retorno a etapa anterior recusado em ${label}.`);
        assert.deepEqual(dnd.final, ['Aguardando pagamento', 'Concluído'], `Movimentação livre não refletida no quadro em ${label}.`);
        assert.deepEqual(dnd.calls, [
          ['PF-20260831-113122-AB3E86', 'Em produção', 'Confirmado'],
          ['PF-I-IDENTIFICADOR-MUITO-LONGO-PARA-VALIDAR-QUEBRA-RESPONSIVA-001', 'Concluído', 'Aguardando pagamento'],
          ['PF-20260831-113122-AB3E86', 'Aguardando pagamento', 'Em produção']
        ], `Requisições de movimentação incorretas em ${label}.`);
        assert.equal(dnd.leftover, 0, `Destaques de arraste permaneceram em ${label}.`);

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
        assert.equal(modal.dragGuard, true, `Fim do arraste abriu o modal em ${label}.`);
        assert.equal(modal.selectGuard, true, `"Mover para…" abriu o modal em ${label}.`);
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
    console.log('PASS drag-and-drop livre: pula e volta etapas sem diálogos, salvamento antes da consolidação, sem requisição duplicada ou na mesma coluna');
    console.log('PASS modal do pedido: clique, teclado, Escape, X, foco restaurado, fundo inerte, sem abrir após arraste e contido nas seis resoluções');
    console.log('PASS modal compacto (390, 768): Gestão logo abaixo do cabeçalho; desktop (1024+) mantém duas colunas; um único seletor de status');
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
