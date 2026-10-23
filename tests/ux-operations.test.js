const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(Boolean);
let source = scripts.at(-1);

source = source.replace(
  /\s+initializeApp\(\);\s+\}\)\(\);\s*$/,
  `
      window.__uxTest = {
        filterAndSortOrders,
        renderStatusOptions,
        renderLocalOrders,
        renderFlavorEditor,
        renderSizeEditor,
        renderPricingEditor,
        renderPaymentEditor,
        renderOrderSuccess,
        renderPaymentDetails,
        renderAdminCheckout,
        retryPublicCheckout,
        setLastSubmittedOrder(value) { lastSubmittedOrder = value; },
        safeCheckoutUrl,
        normalizeClientOrderItems,
        progressivePriceDetails,
        itemDetails,
        orderDisplayItems,
        orderTotalQuantity,
        orderTotal,
        renderAdminOrderItems,
        configDomainPayload,
        updateOrderItemQuantity,
        removeOrderItem,
        changeOrderStatus,
        normalizedPhoneDigits,
        setOrders(value) { appState.orders = value; },
        setOrderView(value) { Object.assign(orderViewState, value); },
        setConfig(value) { config = normalizeConfig(value); appState.config = config; },
        setOrderItems(value) { orderItems = normalizeClientOrderItems(value); },
        getOrderItems() { return orderItems.map(item => ({ ...item })); },
        state() { return { orders: appState.orders, orderViewState: { ...orderViewState } }; }
      };
    })();`
);

assert.match(source, /window\.__uxTest/, 'Não foi possível instrumentar o frontend.');

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    toggle(name, force) {
      if (force === true) values.add(name);
      else if (force === false) values.delete(name);
      else if (values.has(name)) values.delete(name);
      else values.add(name);
      return values.has(name);
    },
    contains: name => values.has(name)
  };
}

function makeElement(id = '') {
  return {
    id, value: '', textContent: '', innerHTML: '', className: '', type: 'text', href: '',
    checked: false, disabled: false, dataset: {}, style: {}, classList: makeClassList(),
    addEventListener() {}, setAttribute() {}, removeAttribute() {}, hasAttribute() { return false; },
    appendChild() {}, insertAdjacentElement() {}, remove() {}, focus() {}, click() {}, reset() {},
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; }
  };
}

function createRuntime(fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true }) })) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement(id));
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    createElement: tag => makeElement(tag),
    body: makeElement('body'),
    execCommand() { return true; }
  };
  const localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const window = {
    location: { search: '', href: 'http://127.0.0.1:4173/' },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    confirm: () => true,
    setTimeout: callback => { callback(); return 1; },
    clearTimeout() {}, scrollTo() {}, open() {}
  };
  const context = {
    window, document, localStorage, fetch: fetchImpl,
    navigator: { clipboard: { writeText: async () => {} } },
    URL, URLSearchParams, Intl, Date, JSON, Math, String, Number, Object, Array, Set,
    Error, RegExp, Promise, console,
    setTimeout: window.setTimeout, clearTimeout() {},
    FormData: class { entries() { return []; } },
    QRCode: function QRCode() {}
  };
  window.document = document;
  window.localStorage = localStorage;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'index.inline.js' });
  return { window, get: id => document.getElementById(id) };
}

const orders = [
  { id: 'PF-103', customerName: 'Ana Lima', whatsapp: '(34) 99999-1111', date: '2026-10-25', createdAt: '2026-10-20T12:00:00Z', flavor: 'Chocolate', size: 'Médio', description: '15 pessoas', price: 129, payment: 'PIX', notes: 'Sem nozes', status: 'Aguardando pagamento' },
  { id: 'PF-101', customerName: 'Bruno Souza', whatsapp: '(34) 98888-2222', date: '2026-10-24', createdAt: '2026-10-18T12:00:00Z', flavor: 'Ninho', size: 'Pequeno', price: 89, payment: 'Cartão', notes: '', status: 'Confirmado' },
  { id: 'PF-102', customerName: 'Célia Prado', whatsapp: '(34) 97777-3333', date: '2026-10-26', createdAt: '2026-10-19T12:00:00Z', flavor: 'Cenoura', size: 'Grande', price: 179, payment: 'PIX', notes: 'Mensagem curta', status: 'Status antigo' }
];

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('pesquisa pedidos por cliente, WhatsApp e número', () => {
  const { window } = createRuntime();
  const api = window.__uxTest;
  assert.deepEqual(api.filterAndSortOrders(orders, { search: 'celia', status: '', deliveryDate: '', sort: 'delivery-asc' }).map(item => item.id), ['PF-102']);
  assert.deepEqual(api.filterAndSortOrders(orders, { search: '98888', status: '', deliveryDate: '', sort: 'delivery-asc' }).map(item => item.id), ['PF-101']);
  assert.deepEqual(api.filterAndSortOrders(orders, { search: 'PF-103', status: '', deliveryDate: '', sort: 'delivery-asc' }).map(item => item.id), ['PF-103']);
});

test('filtro por status inclui status legado', () => {
  const api = createRuntime().window.__uxTest;
  assert.deepEqual(api.filterAndSortOrders(orders, { search: '', status: 'Status antigo', deliveryDate: '', sort: 'delivery-asc' }).map(item => item.id), ['PF-102']);
  assert.match(api.renderStatusOptions('Status antigo'), /Status antigo \(legado\)/);
});

test('filtro por entrega usa a data efetiva do pedido', () => {
  const api = createRuntime().window.__uxTest;
  assert.deepEqual(api.filterAndSortOrders(orders, { search: '', status: '', deliveryDate: '2026-10-24', sort: 'delivery-asc' }).map(item => item.id), ['PF-101']);
});

test('ordenação funciona por entrega e recebimento', () => {
  const api = createRuntime().window.__uxTest;
  assert.deepEqual(api.filterAndSortOrders(orders, { search: '', status: '', deliveryDate: '', sort: 'delivery-asc' }).map(item => item.id), ['PF-101', 'PF-103', 'PF-102']);
  assert.deepEqual(api.filterAndSortOrders(orders, { search: '', status: '', deliveryDate: '', sort: 'created-desc' }).map(item => item.id), ['PF-103', 'PF-102', 'PF-101']);
});

test('renderização produz tabela desktop e cards mobile sem rolagem obrigatória', () => {
  const runtime = createRuntime();
  runtime.window.__uxTest.setOrders(orders);
  runtime.window.__uxTest.renderLocalOrders();
  const content = runtime.get('ordersContainer').innerHTML;
  assert.match(content, /orders-table/);
  assert.match(content, /orders-mobile-list/);
  assert.match(content, /order-mobile-card/);
  assert.match(content, /<details class="order-details">/);
});

test('estados vazio, filtrado, carregando e erro são contextualizados', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setOrders([]);
  api.setOrderView({ loading: false, error: '', search: '' });
  api.renderLocalOrders();
  assert.match(runtime.get('ordersContainer').innerHTML, /Ainda não há pedidos/);
  api.setOrders(orders);
  api.setOrderView({ search: 'não existe' });
  api.renderLocalOrders();
  assert.match(runtime.get('ordersContainer').innerHTML, /Nenhum pedido corresponde/);
  api.setOrderView({ loading: true, error: '' });
  api.renderLocalOrders();
  assert.match(runtime.get('ordersContainer').innerHTML, /Carregando pedidos/);
  api.setOrderView({ loading: false, error: 'falha' });
  api.renderLocalOrders();
  assert.match(runtime.get('ordersContainer').innerHTML, /Não foi possível mostrar/);
});

test('alteração manual de status passa pela API protegida e atualiza estado local', async () => {
  let payload;
  const runtime = createRuntime(async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, order: { id: payload.orderId, status: payload.status } }) };
  });
  runtime.window.__uxTest.setOrders(orders.map(item => ({ ...item })));
  await runtime.window.__uxTest.changeOrderStatus('PF-103', 'Confirmado');
  assert.equal(payload.action, 'updateOrderStatus');
  assert.equal(payload.status, 'Confirmado');
  assert.equal(runtime.window.__uxTest.state().orders.find(item => item.id === 'PF-103').status, 'Confirmado');
});

test('catálogo distingue ativos e inativos e oferece reativação', () => {
  const runtime = createRuntime();
  runtime.window.__uxTest.setConfig({
    flavorItems: [{ id: 'a', name: 'Ativo', active: true }, { id: 'b', name: 'Pausado', active: false }],
    flavors: ['Ativo'],
    sizes: [{ id: 'p', name: 'P', price: 10, active: false }],
    payments: [{ id: 'pix', name: 'PIX', type: 'pix', active: false }]
  });
  runtime.window.__uxTest.renderFlavorEditor();
  runtime.window.__uxTest.renderSizeEditor();
  runtime.window.__uxTest.renderPaymentEditor();
  assert.match(runtime.get('flavorEditor').innerHTML, /Pausado/);
  assert.match(runtime.get('flavorEditor').innerHTML, /Reativar/);
  assert.match(runtime.get('sizeEditor').innerHTML, /Inativo/);
  assert.match(runtime.get('paymentEditor').innerHTML, /Reativar/);
});

test('confirmação destaca número e só mostra WhatsApp comercial válido', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setConfig({ flavors: ['Chocolate'], sizes: [{ id: 'p', name: 'Pequeno', price: 89 }], payments: [], businessWhatsapp: '34999998888' });
  api.renderOrderSuccess({ customerName: 'Ana', whatsapp: '34999991111', flavor: 'Chocolate', sizeId: 'p', size: 'Pequeno', price: 89, deliveryDate: '2026-10-25', payment: 'PIX', status: 'Aguardando pagamento' }, 'PF-200');
  assert.match(runtime.get('successOrderNumber').textContent, /PF-200/);
  assert.equal(runtime.get('businessWhatsappBtn').classList.contains('hidden'), false);
  assert.match(runtime.get('businessWhatsappBtn').href, /^https:\/\/wa\.me\/5534999998888/);

  api.setConfig({ flavors: [], sizes: [], payments: [], businessWhatsapp: 'inválido' });
  api.renderOrderSuccess({ customerName: 'Ana', whatsapp: '', flavor: '', price: 0 }, 'PF-201');
  assert.equal(runtime.get('businessWhatsappBtn').classList.contains('hidden'), true);
  assert.match(html, /id="newOrderBtn"/);
});

test('frontend agrupa repetição do mesmo sabor', () => {
  const api = createRuntime().window.__uxTest;
  const items = api.normalizeClientOrderItems([
    { flavor: 'Chocolate', quantity: 2 },
    { flavor: 'Chocolate', quantity: 3 }
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 5);
});

test('estimativa progressiva usa centavos e calcula economia', () => {
  const api = createRuntime().window.__uxTest;
  api.setConfig({ progressivePricing: { firstSlicePrice: 19.97, additionalSlicePrice: 15 }, flavors: [], sizes: [], payments: [] });
  assert.equal(api.progressivePriceDetails(1).subtotal, 19.97);
  assert.equal(api.progressivePriceDetails(2).subtotal, 34.97);
  assert.equal(api.progressivePriceDetails(4).subtotal, 64.97);
  assert.equal(api.progressivePriceDetails(5).subtotal, 79.97);
  assert.equal(api.progressivePriceDetails(20).subtotal, 304.97);
  assert.equal(api.progressivePriceDetails(4).savings, 14.91);
});

test('frontend permite alterar quantidade e remover item', () => {
  const api = createRuntime().window.__uxTest;
  api.setOrderItems([
    { flavor: 'Chocolate', quantity: 1 },
    { flavor: 'Cenoura', quantity: 2 }
  ]);
  assert.equal(api.updateOrderItemQuantity(0, 4), true);
  assert.equal(api.getOrderItems()[0].quantity, 4);
  api.removeOrderItem(1);
  assert.equal(api.getOrderItems().length, 1);
});

test('central administrativa exibe itens quantidades subtotais e total', () => {
  const api = createRuntime().window.__uxTest;
  const order = {
    items: [
      { flavor: 'Chocolate', sizeId: 'm', size: 'Médio', quantity: 2, unitPrice: 129, subtotal: 258 },
      { flavor: 'Cenoura', sizeId: 'g', size: 'Grande', quantity: 1, unitPrice: 179, subtotal: 179 }
    ],
    totalQuantity: 3, total: 437
  };
  const markup = api.renderAdminOrderItems(order);
  assert.match(markup, /2×/);
  assert.match(markup, /Chocolate/);
  assert.match(markup, /3 bolos no total/);
  assert.equal(api.orderTotal(order), 437);
});

test('central edita o dominio de precos progressivos', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setConfig({ progressivePricing: { firstSlicePrice: 21.5, additionalSlicePrice: 16 }, flavors: [], sizes: [], payments: [] });
  api.renderPricingEditor();
  assert.equal(runtime.get('adminFirstSlicePrice').value, '21.50');
  assert.equal(runtime.get('adminAdditionalSlicePrice').value, '16.00');
  const payload = api.configDomainPayload('pricing');
  assert.equal(payload.progressivePricing.firstSlicePrice, 21.5);
  assert.equal(payload.progressivePricing.additionalSlicePrice, 16);
});

test('confirmação pública usa itens e total definitivos do servidor', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setConfig({
    flavors: ['Chocolate', 'Cenoura'],
    sizes: [{ id: 'p', name: 'Pequeno', price: 89 }, { id: 'g', name: 'Grande', price: 169 }],
    payments: [{ id: 'pix', name: 'PIX', type: 'pix', active: true, paymentLink: 'https://pay.example/p' }],
    progressivePricing: { firstSlicePrice: 19.97, additionalSlicePrice: 15 },
    businessWhatsapp: ''
  });
  api.renderOrderSuccess({
    customerName: 'Ana', whatsapp: '34999991111', deliveryDate: '2026-10-25', payment: 'PIX',
    status: 'Aguardando pagamento', totalQuantity: 3, total: 54.94,
    items: [
      { flavor: 'Chocolate', quantity: 2, firstSlicePrice: 19.97, additionalSlicePrice: 15, subtotal: 34.97, savings: 4.97, pricingModel: 'progressive-v1' },
      { flavor: 'Cenoura', quantity: 1, firstSlicePrice: 19.97, additionalSlicePrice: 15, subtotal: 19.97, savings: 0, pricingModel: 'progressive-v1' }
    ]
  }, 'PF-MULTI-1');
  assert.match(runtime.get('successItems').innerHTML, /Chocolate/);
  assert.match(runtime.get('successItems').innerHTML, /Cenoura/);
  assert.match(runtime.get('successPrice').textContent, /54,94/);
  assert.match(runtime.get('successItems').innerHTML, /economia/);
  assert.match(runtime.get('successPaymentDetails').innerHTML, /valor integral/);
});

test('confirmação pública oferece checkout InfinitePay válido', () => {
  const runtime = createRuntime();
  runtime.window.__uxTest.renderOrderSuccess({
    customerName: 'Ana', whatsapp: '34999991111', deliveryDate: '2026-10-25',
    payment: 'InfinitePay — PIX ou cartão', status: 'Aguardando pagamento', totalQuantity: 1, total: 19.97,
    items: [{ flavor: 'Chocolate', quantity: 1, subtotal: 19.97, pricingModel: 'progressive-v1' }],
    checkout: { state: 'active', available: true, url: 'https://checkout.infinitepay.com.br/teste', expectedAmountCents: 1997, expiresAt: '2026-10-22T23:59:59-03:00' }
  }, 'PF-CHECKOUT-1');
  const markup = runtime.get('successPaymentDetails').innerHTML;
  assert.match(markup, /data-payment-method="pix"/);
  assert.match(markup, /data-payment-method="credit_card"/);
  assert.match(markup, /checkout\.infinitepay\.com\.br/);
  assert.match(runtime.get('successPaymentDetails').innerHTML, /19,97/);
});

test('frontend rejeita URL de checkout fora do domínio oficial', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  assert.equal(api.safeCheckoutUrl('https://evil.example/pay'), '');
  const container = runtime.get('checkout-test');
  api.renderPaymentDetails(container, { state: 'active', available: true, url: 'https://evil.example/pay' }, { total: 19.97 });
  assert.doesNotMatch(container.innerHTML, /href=/);
});

test('central mostra estado identificador validade e link do checkout', () => {
  const markup = createRuntime().window.__uxTest.renderAdminCheckout({
    id: 'PF-CHECKOUT-2',
    checkout: { state: 'returned_unverified', chargeId: 'invoice-123', expiresAt: '2026-10-22T23:59:59-03:00', url: 'https://checkout.infinitepay.com.br/teste' }
  });
  assert.match(markup, /Retorno recebido/);
  assert.match(markup, /invoice-123/);
  assert.match(markup, /Abrir checkout/);
  assert.match(markup, /Conferir na InfinitePay/);
});

// ---- Etapa 8.1: pagamento na confirmação ----

const checkoutOrder = (checkout, extra = {}) => ({
  customerName: 'Ana', whatsapp: '34999991111', deliveryDate: '2026-10-25',
  payment: 'InfinitePay — PIX ou cartão', status: 'Aguardando pagamento', totalQuantity: 2, total: 34.97,
  items: [{ flavor: 'Choconinho', quantity: 2, subtotal: 34.97, savings: 4.97, pricingModel: 'progressive-v1' }],
  checkout, ...extra
});

test('formulário inicial não tem seção nem campo de pagamento', () => {
  assert.doesNotMatch(html, /id="paymentSelect"/);
  assert.doesNotMatch(html, /id="summaryPayment"/);
  assert.doesNotMatch(html, /<h2>[^<]*<span class="step-number"[^>]*>\d<\/span>Pagamento<\/h2>/);
  assert.match(html, /id="submitOrderBtn"[^>]*>Finalizar encomenda</);
  assert.match(html, /step-number" aria-hidden="true">3<\/span>Detalhes do pedido/);
});

test('confirmação mostra PIX e cartão de crédito para o mesmo checkout', () => {
  const runtime = createRuntime();
  runtime.window.__uxTest.renderOrderSuccess(checkoutOrder({ state: 'active', available: true, url: 'https://checkout.infinitepay.com.br/unico' }), 'PF-81');
  const markup = runtime.get('successPaymentDetails').innerHTML;
  const links = [...markup.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(links, ['https://checkout.infinitepay.com.br/unico', 'https://checkout.infinitepay.com.br/unico']);
  assert.match(markup, />PIX</);
  assert.match(markup, />Cartão de crédito</);
  assert.match(markup, /escolha definitiva entre PIX e cartão de crédito/);
  assert.doesNotMatch(markup, /débito/i);
});

test('domínio de checkout .io documentado é aceito', () => {
  const api = createRuntime().window.__uxTest;
  assert.equal(api.safeCheckoutUrl('https://checkout.infinitepay.io/loja/abc'), 'https://checkout.infinitepay.io/loja/abc');
  assert.equal(api.safeCheckoutUrl('http://checkout.infinitepay.io/loja/abc'), '');
  assert.equal(api.safeCheckoutUrl('https://checkout.infinitepay.io.evil.example/x'), '');
});

test('botões de pagamento não aparecem sem URL válida', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  for (const checkout of [{ state: 'active', available: true, url: '' }, { state: 'active', available: false, url: 'https://checkout.infinitepay.com.br/x' }, { state: 'failed', available: false }]) {
    const container = runtime.get('checkout-none');
    api.renderPaymentDetails(container, checkout, { total: 34.97 });
    assert.doesNotMatch(container.innerHTML, /payment-method-btn|href=/);
    assert.match(container.innerHTML, /Seu pedido está registrado/);
  }
});

test('falha definitiva oferece nova tentativa sem novo pedido', async () => {
  let sent;
  const runtime = createRuntime(async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, order: checkoutOrder({ state: 'active', available: true, url: 'https://checkout.infinitepay.com.br/retry' }, { duplicate: true }) }) };
  });
  const api = runtime.window.__uxTest;
  const original = { action: 'createOrder', customerName: 'Ana', items: [{ flavor: 'Choconinho', quantity: 2 }], idempotencyKey: 'chave-fixa-0000000001' };
  api.setLastSubmittedOrder(original);
  const container = runtime.get('checkout-retry');
  api.renderPaymentDetails(container, { state: 'failed', available: false, canRetry: true }, { total: 34.97 });
  assert.match(container.innerHTML, /id="retryCheckoutBtn"/);
  assert.match(container.innerHTML, /nenhuma cobrança foi criada/);
  await api.retryPublicCheckout(container);
  assert.equal(sent.action, 'createOrder');
  assert.equal(sent.idempotencyKey, 'chave-fixa-0000000001');
  assert.match(container.innerHTML, /data-payment-method="pix"/);
});

test('estado ambíguo não oferece nova tentativa e indica contato', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setConfig({ flavors: [], sizes: [], payments: [], businessWhatsapp: '34999998888' });
  api.setLastSubmittedOrder({ action: 'createOrder', idempotencyKey: 'chave-fixa-0000000002' });
  const container = runtime.get('checkout-unknown');
  api.renderPaymentDetails(container, { state: 'unknown', available: false, canRetry: false }, { total: 34.97 });
  assert.doesNotMatch(container.innerHTML, /retryCheckoutBtn/);
  assert.match(container.innerHTML, /duplicidade/);
  assert.match(container.innerHTML, /WhatsApp abaixo/);
});

test('central exibe diagnóstico e só oferece nova geração quando seguro', () => {
  const api = createRuntime().window.__uxTest;
  const failed = api.renderAdminCheckout({
    id: 'PF-FAIL', status: 'Aguardando pagamento',
    checkout: { state: 'failed', available: false, canManualRetry: true, attempts: 1, diagnostic: { category: 'invalid_request', httpStatus: 400, providerMessage: 'invalid: handle', correlationId: 'req-1' } }
  });
  assert.match(failed, /Requisição recusada · HTTP 400 · invalid: handle · correlação req-1/);
  assert.match(failed, /checkout-retry/);
  const ambiguous = api.renderAdminCheckout({
    id: 'PF-AMB', status: 'Aguardando pagamento',
    checkout: { state: 'unknown', available: false, canManualRetry: false, diagnostic: { category: 'timeout' } }
  });
  assert.match(ambiguous, /Tempo esgotado/);
  assert.doesNotMatch(ambiguous, /checkout-retry/);
  const confirmed = api.renderAdminCheckout({ id: 'PF-OK', status: 'Confirmado', checkout: { state: 'failed', canManualRetry: true } });
  assert.doesNotMatch(confirmed, /checkout-retry/);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}`);
      console.error(error.stack || error);
      process.exitCode = 1;
    }
  }
  console.log(`\n${passed}/${tests.length} testes aprovados`);
})();
