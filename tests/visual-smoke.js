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
const PUBLIC_FORM_PROBE = `(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  for (let attempt = 0; attempt < 60; attempt++) {
    if (!document.getElementById('customerView').classList.contains('hidden') && !document.getElementById('deliveryChoice').classList.contains('hidden')) break;
    await wait(100);
  }
  const ready = !document.getElementById('deliveryChoice').classList.contains('hidden');
  document.getElementById('flavorSelect').value = document.getElementById('flavorSelect').options[1]?.value || '';
  document.getElementById('addOrderItemBtn').click();
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
  const snapshot = { ...result };
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

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/api') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    response.end(JSON.stringify({ ok: true, config: publicConfig }));
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
         return {
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
        for (const status of layout.statusSelects) {
          assert.equal(status.title, status.text.replace(/ \(legado\)$/, ''), `Seletor sem identificação acessível do status em ${label}.`);
          if (DEFAULT_STATUSES.includes(status.text)) assert.ok(status.fits, `Status "${status.text}" cortado no seletor em ${label} (${status.width}px).`);
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
    console.log('PASS formulário com entrega e retirada contido nas seis resoluções');
    if (process.argv.includes('--keep')) console.log(`ARTEFATOS_VISUAIS=${tempDir}`);
  } finally {
    server.close();
    if (!process.argv.includes('--keep')) fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
