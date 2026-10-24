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
        renderPricingEditor,
        renderPaymentEditor,
        renderOrderSuccess,
        renderPaymentDetails,
        renderAdminCheckout,
        retryPublicCheckout,
        renderCheckoutReturn,
        refreshPaymentStatus,
        checkCheckoutPayment,
        setLastSubmittedOrder(value) { lastSubmittedOrder = value; },
        updateSummary,
        renderFulfillmentOptions,
        validateFulfillment,
        makeOrderPayload,
        formatCep,
        orderFulfillmentSummary,
        readFulfillmentEditor,
        getConfig() { return config; },
        orderTimeText,
        shortOrderId,
        orderFlavorSummary,
        orderSlicesText,
        safeCheckoutUrl,
        normalizeClientOrderItems,
        progressivePriceDetails,
        itemDetails,
        orderDisplayItems,
        orderTotalQuantity,
        orderTotal,
        ordersTotalCents,
        renderAdminOrderItems,
        configDomainPayload,
        updateOrderItemQuantity,
        removeOrderItem,
        addSelectedOrderItem,
        setBuilderQuantity,
        builderQuantity() { return builderQuantity; },
        changeOrderStatus,
        moveOrderToStatus,
        orderStatusTransition,
        kanbanColumns,
        kanbanDropKind,
        handleKanbanDrop,
        setOrdersView,
        savingOrders() { return [...savingOrderIds]; },
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
    listeners: {},
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
    dispatch(type, event = {}) { (this.listeners[type] || []).forEach(handler => handler({ target: this, ...event })); },
    attributes: {}, setAttribute(name, value) { this.attributes[name] = String(value); }, removeAttribute() {}, hasAttribute() { return false; },
    appendChild() {}, insertAdjacentElement() {}, remove() {}, focus() {}, click() {}, reset() {},
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; }
  };
}

function createRuntime(fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true }) }), runtimeOptions = {}) {
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
  const localStorage = runtimeOptions.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
  const window = {
    location: { search: runtimeOptions.search || '', href: 'http://127.0.0.1:4173/' + (runtimeOptions.search || '') },
    history: { replaceState(_state, _title, url) { window.replacedUrl = url; } },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    confirm: runtimeOptions.confirm || (() => true),
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
  runtime.window.__uxTest.renderPaymentEditor();
  assert.match(runtime.get('flavorEditor').innerHTML, /Pausado/);
  assert.match(runtime.get('flavorEditor').innerHTML, /Reativar/);
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
  assert.match(html, /step-number" aria-hidden="true">3<\/span>Como deseja receber\?/);
  assert.match(html, /step-number" aria-hidden="true">4<\/span>Detalhes do pedido/);
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

// ---- Etapa 9: entrega e retirada ----

const fulfillmentSettings = (overrides = {}) => ({
  flavors: ['Chocolate'], sizes: [], payments: [],
  progressivePricing: { firstSlicePrice: 19.97, additionalSlicePrice: 15 },
  fulfillment: { pickupEnabled: true, deliveryEnabled: true, deliveryFeeCents: 800, pickupAddress: 'Loja fictícia, 100', pickupInstructions: 'Das 9h às 12h.', deliveryInstructions: 'Após as 14h.', ...overrides }
});

function fillAddress(runtime, values = {}) {
  const address = { addressCep: '38400-000', addressStreet: 'Rua Fictícia', addressNumber: '10', addressComplement: '', addressNeighborhood: 'Centro Teste', addressCity: 'Cidade Exemplo', addressState: 'MG', addressReference: '', ...values };
  Object.entries(address).forEach(([id, value]) => { runtime.get(id).value = value; });
}

test('formulário oferece entrega e retirada com campos de endereço completos', () => {
  for (const id of ['fulfillmentDelivery', 'fulfillmentPickup', 'addressCep', 'addressStreet', 'addressNumber', 'addressComplement', 'addressNeighborhood', 'addressCity', 'addressState', 'addressReference']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(html, />Receber no meu endereço</);
  assert.match(html, />Retirar no local</);
  assert.match(html, /id="fulfillmentPanel"/);
});

test('entrega soma a taxa configurada ao resumo antes de finalizar', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setConfig(fulfillmentSettings());
  api.setOrderItems([{ flavor: 'Chocolate', quantity: 2 }]);
  api.renderFulfillmentOptions();
  runtime.get('fulfillmentDelivery').checked = true;
  api.updateSummary();
  assert.match(runtime.get('summarySubtotal').textContent, /34,97/);
  assert.equal(runtime.get('summaryDeliveryFeeRow').classList.contains('hidden'), false);
  assert.match(runtime.get('summaryDeliveryFee').textContent, /8,00/);
  assert.match(runtime.get('summaryTotal').textContent, /42,97/);
  assert.match(runtime.get('deliveryFeeLabel').textContent, /8,00/);
});

test('retirada não tem taxa e não envia endereço', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setConfig(fulfillmentSettings());
  api.setOrderItems([{ flavor: 'Chocolate', quantity: 1 }]);
  fillAddress(runtime);
  runtime.get('fulfillmentPickup').checked = true;
  api.updateSummary();
  assert.equal(runtime.get('summaryDeliveryFeeRow').classList.contains('hidden'), true);
  assert.match(runtime.get('summaryTotal').textContent, /19,97/);
  assert.deepEqual(JSON.parse(JSON.stringify(api.makeOrderPayload().fulfillment)), { mode: 'pickup' });
});

test('payload de entrega envia endereço sem taxa nem total', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setConfig(fulfillmentSettings());
  fillAddress(runtime, { addressState: 'mg' });
  runtime.get('fulfillmentDelivery').checked = true;
  const fulfillment = JSON.parse(JSON.stringify(api.makeOrderPayload().fulfillment));
  assert.equal(fulfillment.mode, 'delivery');
  assert.equal(fulfillment.address.state, 'MG');
  assert.equal(fulfillment.address.street, 'Rua Fictícia');
  assert.equal('deliveryFee' in fulfillment, false);
  assert.equal('total' in api.makeOrderPayload(), false);
});

test('validação exige modalidade, endereço completo, CEP e UF válidos', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setConfig(fulfillmentSettings());
  assert.equal(api.validateFulfillment().field, 'fulfillmentChoices');
  runtime.get('fulfillmentDelivery').checked = true;
  fillAddress(runtime, { addressCep: '3840' });
  assert.equal(api.validateFulfillment().field, 'addressCep');
  fillAddress(runtime, { addressStreet: '' });
  assert.equal(api.validateFulfillment().field, 'addressStreet');
  fillAddress(runtime, { addressState: 'XX' });
  assert.equal(api.validateFulfillment().field, 'addressState');
  fillAddress(runtime);
  assert.equal(api.validateFulfillment(), null);
  assert.equal(api.formatCep('38400000'), '38400-000');
  assert.equal(api.formatCep('38a4.00-0001'), '38400-000');
});

test('modalidade única é pré-selecionada e entrega sem taxa definida fica oculta', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setConfig(fulfillmentSettings({ pickupEnabled: false }));
  api.renderFulfillmentOptions();
  assert.equal(runtime.get('fulfillmentDelivery').checked, true);
  assert.equal(runtime.get('pickupChoice').classList.contains('hidden'), true);
  const second = createRuntime();
  second.window.__uxTest.setConfig(fulfillmentSettings({ deliveryFeeCents: null }));
  second.window.__uxTest.renderFulfillmentOptions();
  assert.equal(second.get('deliveryChoice').classList.contains('hidden'), true);
  assert.equal(second.get('fulfillmentPickup').checked, true);
  assert.equal(second.window.__uxTest.getConfig().fulfillment.deliveryEnabled, false);
});

test('confirmação mostra endereço e valores do próprio pedido sem resíduo do anterior', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setConfig(fulfillmentSettings());
  const base = { customerName: 'Ana', whatsapp: '34999991111', deliveryDate: '2026-10-25', status: 'Aguardando pagamento', totalQuantity: 1, items: [{ flavor: 'Chocolate', quantity: 1, subtotal: 19.97, pricingModel: 'progressive-v1' }] };
  api.renderOrderSuccess({ ...base, total: 27.97, subtotal: 19.97, deliveryFee: 8, fulfillment: { mode: 'delivery', instructions: 'Após as 14h.', address: { cep: '38400000', street: 'Rua Fictícia', number: '10', complement: '', neighborhood: 'Centro Teste', city: 'Cidade Exemplo', state: 'MG', reference: 'Portão azul' } } }, 'PF-E1');
  assert.match(runtime.get('successFulfillment').textContent, /Entrega no endereço/);
  assert.match(runtime.get('successFulfillmentDetails').textContent, /Rua Fictícia, 10/);
  assert.match(runtime.get('successFulfillmentDetails').textContent, /CEP 38400-000/);
  assert.match(runtime.get('successDeliveryFee').textContent, /8,00/);
  assert.match(runtime.get('successSubtotal').textContent, /19,97/);
  assert.match(runtime.get('successPrice').textContent, /27,97/);
  api.renderOrderSuccess({ ...base, total: 19.97, subtotal: 19.97, deliveryFee: 0, fulfillment: { mode: 'pickup', instructions: 'Loja fictícia, 100 — Das 9h às 12h.', address: null } }, 'PF-R1');
  assert.doesNotMatch(runtime.get('successFulfillmentDetails').textContent, /Rua Fictícia/);
  assert.match(runtime.get('successFulfillmentDetails').textContent, /Loja fictícia, 100/);
  assert.equal(runtime.get('successDeliveryFeeRow').classList.contains('hidden'), true);
  assert.equal(runtime.get('successDeliveryFee').textContent, '');
});

test('central apresenta modalidade, endereço e pedidos antigos sem colunas novas', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  const delivery = { id: 'PF-ENT', customerName: 'Ana', status: 'Aguardando pagamento', date: '2026-10-25', total: 27.97, subtotal: 19.97, deliveryFee: 8, fulfillment: { mode: 'delivery', address: { cep: '38400000', street: 'Rua Fictícia', number: '10', neighborhood: 'Centro Teste', city: 'Cidade Exemplo', state: 'MG' }, instructions: '' } };
  const legacy = { id: 'PF-OLD', customerName: 'Bruno', status: 'Concluído', date: '2025-01-05', total: 89 };
  assert.equal(api.orderFulfillmentSummary(delivery).label, 'Entrega no endereço');
  assert.match(api.orderFulfillmentSummary(legacy).details, /Não informado/);
  api.setOrders([delivery, legacy]);
  api.renderLocalOrders();
  const markup = runtime.get('ordersContainer').innerHTML;
  assert.match(markup, /order-fulfillment">Entrega</);
  assert.match(markup, /order-fulfillment">Não informado</);
  assert.match(markup, /Taxa de entrega<\/span>R\$\s?8,00/);
  assert.match(markup, /Rua Fictícia, 10/);
  assert.equal((markup.match(/<th>/g) || []).length, 5, 'tabela mantém cinco colunas');
});

test('editor administrativo exige uma modalidade e taxa explícita para entrega', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  runtime.get('adminPickupEnabled').checked = false;
  runtime.get('adminDeliveryEnabled').checked = false;
  assert.match(api.readFulfillmentEditor().error, /ao menos uma/);
  runtime.get('adminDeliveryEnabled').checked = true;
  runtime.get('adminDeliveryFee').value = '';
  assert.match(api.readFulfillmentEditor().error, /taxa/);
  runtime.get('adminDeliveryFee').value = '8.5';
  runtime.get('adminPickupAddress').value = 'Loja fictícia, 100';
  const edited = api.readFulfillmentEditor().value;
  assert.equal(edited.deliveryFeeCents, 850);
  api.setConfig({ ...fulfillmentSettings(), fulfillment: edited });
  const payload = JSON.parse(JSON.stringify(api.configDomainPayload('fulfillment')));
  assert.equal(payload.fulfillment.deliveryFee, 8.5);
  assert.equal(payload.fulfillment.deliveryEnabled, true);
  assert.equal(payload.fulfillment.pickupEnabled, false);
});

// ---- Etapa 9.1: catálogo e preços separados ----

test('catálogo administra somente sabores, sem tamanhos, preços ou links antigos', () => {
  const catalog = html.slice(html.indexOf('<div id="catalogPanel"'), html.indexOf('<div id="pricingPanel"'));
  assert.ok(catalog.length > 100);
  assert.match(catalog, /Catálogo de sabores/);
  assert.match(catalog, /id="flavorEditor"/);
  assert.match(catalog, /id="addFlavorBtn"/);
  assert.match(catalog, /id="saveCatalogBtn"/);
  assert.doesNotMatch(catalog, /Tamanhos históricos|sizeEditor|addSizeBtn|size-price|Link de checkout|crédito\/débito/);
  assert.doesNotMatch(html, /size-pix-link|size-card-link|id="sizeEditor"/);
});

test('preços continua sendo a única configuração de preço dos bolos', () => {
  for (const id of ['adminFirstSlicePrice', 'adminAdditionalSlicePrice', 'pricingAdminPreview', 'savePricingBtn']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.equal((html.match(/type="number"[^>]*step="0\.01"/g) || []).length, 3, 'apenas primeira fatia, fatia adicional e taxa de entrega');
});

test('salvar catálogo envia somente sabores', () => {
  const api = createRuntime().window.__uxTest;
  api.setConfig({
    flavorItems: [{ id: 'a', name: 'Chocolate', active: true }],
    sizes: [{ id: 'p', name: 'Pequeno', price: 89 }],
    payments: [{ id: 'pix', name: 'PIX', type: 'pix', paymentLink: 'https://pay.example/legado' }]
  });
  const payload = JSON.parse(JSON.stringify(api.configDomainPayload('flavors')));
  assert.deepEqual(Object.keys(payload), ['flavorItems']);
  assert.equal(payload.flavorItems[0].name, 'Chocolate');
  assert.throws(() => api.configDomainPayload('catalog'), /inválido/);
});

// ---- Etapa 9.2: central de pedidos simplificada ----

const legacySizeOrder = {
  id: 'PF-20260831-113122-AB3E86', createdAt: '2026-08-31T14:31:22Z', customerName: 'Cliente Histórico Fictício',
  whatsapp: '(34) 99999-1111', date: '2026-09-06', deliveryDate: '2026-09-06',
  time: 'Sat Dec 30 1899 00:00:00 GMT-0306 (Horário Padrão de Brasília)',
  total: 49.97, price: 49.97, payment: 'PIX', notes: 'Observação fictícia', status: 'Confirmado',
  items: [{ flavor: 'Bolo de Choconinho (Massa branca, recheio de brigadeiro e creme de ninho)', sizeId: '3f', size: '3 Fatias', quantity: 1, unitPrice: 49.97, subtotal: 49.97, pricingModel: 'legacy-size' }],
  checkout: { state: 'not_created', available: false }
};

const multiFlavorOrder = {
  id: 'PF-I-ABCDEFGHIJKLMNOPQRSTUVWXYZ', createdAt: '2026-10-20T12:00:00Z', customerName: 'Pessoa Fictícia',
  whatsapp: '(34) 98888-2222', date: '2026-10-25', time: '00:00', total: 82.91, subtotal: 74.91, deliveryFee: 8,
  payment: 'InfinitePay — PIX ou cartão', notes: 'x'.repeat(400), status: 'Aguardando pagamento',
  fulfillment: { mode: 'delivery', instructions: '', address: { cep: '38400000', street: 'Rua Fictícia', number: '10', neighborhood: 'Centro', city: 'Cidade Exemplo', state: 'MG' } },
  items: [
    { flavor: 'Choconinho', quantity: 2, subtotal: 34.97, pricingModel: 'progressive-v1' },
    { flavor: 'Chocolate', quantity: 1, subtotal: 19.97, pricingModel: 'progressive-v1' },
    { flavor: 'Cenoura', quantity: 1, subtotal: 19.97, pricingModel: 'progressive-v1' }
  ],
  checkout: { state: 'failed', available: false, canManualRetry: true, attempts: 2, chargeId: 'invoice-fict', diagnostic: { category: 'invalid_request', httpStatus: 400 } }
};

test('horário só aparece quando é real; serial de 1899 e 00:00 fixo são ignorados', () => {
  const api = createRuntime().window.__uxTest;
  assert.equal(api.orderTimeText('Sat Dec 30 1899 00:00:00 GMT-0306 (Horário Padrão de Brasília)'), '');
  assert.equal(api.orderTimeText('Sat Dec 30 1899 14:30:00 GMT-0306 (Horário Padrão de Brasília)'), '14:30');
  assert.equal(api.orderTimeText('00:00'), '');
  assert.equal(api.orderTimeText('9:05'), '09:05');
  assert.equal(api.orderTimeText('14:30:00'), '14:30');
  for (const malformed of ['', null, undefined, 'abc', '25:10', '12:75', '1899-12-30T03:06:28.000Z', 'Horário não informado']) {
    assert.equal(api.orderTimeText(malformed), '', String(malformed));
  }
});

test('tabela mostra cinco informações essenciais sem data de 1899 nem dados técnicos', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setOrders([legacySizeOrder, multiFlavorOrder]);
  api.setOrderView({ loading: false, error: '', search: '', status: '', deliveryDate: '', sort: 'delivery-asc' });
  api.renderLocalOrders();
  const markup = runtime.get('ordersContainer').innerHTML;
  assert.deepEqual((markup.match(/<th>[^<]+<\/th>/g) || []).map(cell => cell.replace(/<\/?th>/g, '')), ['Pedido / cliente', 'Encomenda', 'Recebimento', 'Total', 'Status']);
  assert.doesNotMatch(markup, /1899|GMT/);
  const mainRows = markup.split('<tr class="order-row').slice(1).map(part => part.split('order-details-row')[0]);
  assert.equal(mainRows.length, 2);
  for (const row of mainRows) {
    assert.doesNotMatch(row, /Valor esperado|Conferir na InfinitePay|Gerar checkout|Abrir checkout|invoice-fict|Observação fictícia/);
    assert.match(row, /class="control order-status"/);
  }
  assert.match(mainRows[0], /#AB3E86/);
  assert.match(mainRows[0], /title="PF-20260831-113122-AB3E86"/);
  assert.match(mainRows[0], /<strong>Choconinho<\/strong><small>3 fatias<\/small>/);
  assert.match(mainRows[0], /<strong>06\/09\/2026<\/strong><small class="order-fulfillment">Não informado/);
  assert.match(mainRows[1], /Choconinho \+ 2 sabores/);
  assert.match(mainRows[1], /4 fatias/);
  assert.match(mainRows[1], /<strong>25\/10\/2026<\/strong><small class="order-fulfillment">Entrega/);
  assert.match(mainRows[1], /R\$\s?82,91/);
});

test('mais informações concentra pedido, itens, valores, recebimento e checkout', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setOrders([multiFlavorOrder]);
  api.renderLocalOrders();
  const markup = runtime.get('ordersContainer').innerHTML;
  const detailsRow = markup.slice(markup.indexOf('class="order-details-row"'), markup.indexOf('</tr>', markup.indexOf('class="order-details-row"')));
  assert.match(markup, /aria-expanded="false" aria-controls="order-details-0"/);
  assert.match(markup, /id="order-details-0" class="order-details-row" hidden/);
  for (const expected of [/PF-I-ABCDEFGHIJKLMNOPQRSTUVWXYZ/, /\(34\) 98888-2222/, /Choconinho/, /Cenoura/, /Subtotal<\/span>R\$\s?74,91/, /Taxa de entrega<\/span>R\$\s?8,00/, /Total<\/span><strong>R\$\s?82,91/, /Entrega no endereço/, /Rua Fictícia, 10/, /x{400}/, /InfinitePay — PIX ou cartão/, /Dados do checkout/, /invoice-fict/, /HTTP 400/, /2 tentativa/, /checkout-retry/]) {
    assert.match(detailsRow, expected);
  }
  const card = markup.slice(markup.indexOf('<article class="order-mobile-card"'));
  assert.match(card, /Encomenda<\/dt><dd>Choconinho \+ 2 sabores · 4 fatias/);
  assert.match(card, /Recebimento<\/dt><dd>25\/10\/2026 · <span class="order-fulfillment">Entrega/);
  assert.match(card, /<details class="order-details"><summary>Mais informações<\/summary>/);
  assert.match(card, /Dados do checkout/);
  assert.match(card, /class="control order-status"/);
});

test('ações de checkout continuam disponíveis somente nos detalhes', () => {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setOrders([{ ...multiFlavorOrder, checkout: { state: 'returned_unverified', available: true, url: 'https://checkout.infinitepay.com.br/fict', chargeId: 'invoice-fict', expiresAt: '2026-10-22T23:59:59-03:00' } }]);
  api.renderLocalOrders();
  const markup = runtime.get('ordersContainer').innerHTML;
  const [mainRow, detailsRow] = markup.split('class="order-details-row"');
  assert.doesNotMatch(mainRow, /checkout-check|Abrir checkout/);
  assert.match(detailsRow, /class="ghost-btn checkout-check" type="button" data-order-id="PF-I-ABCDEFGHIJKLMNOPQRSTUVWXYZ"/);
  assert.match(detailsRow, /href="https:\/\/checkout\.infinitepay\.com\.br\/fict"[^>]*>Abrir checkout/);
  assert.match(detailsRow, /Retorno recebido/);
  assert.match(detailsRow, /Expira: 22\/10\/2026/);
});

test('resumo de sabores e fatias cobre pedidos atuais e por tamanho', () => {
  const api = createRuntime().window.__uxTest;
  assert.equal(api.shortOrderId('PF-20260831-113122-AB3E86'), 'AB3E86');
  assert.equal(api.shortOrderId('PF-101'), 'PF-101');
  assert.equal(api.orderFlavorSummary({ items: [{ flavor: 'Choconinho', quantity: 1, pricingModel: 'progressive-v1' }, { flavor: 'Choconinho', quantity: 2, pricingModel: 'progressive-v1' }] }), 'Choconinho');
  assert.equal(api.orderFlavorSummary({ items: [{ flavor: 'A', quantity: 1, pricingModel: 'progressive-v1' }, { flavor: 'B', quantity: 1, pricingModel: 'progressive-v1' }] }), 'A + 1 sabor');
  assert.equal(api.orderSlicesText({ items: [{ flavor: 'Bolo', sizeId: 'p', size: 'Pequeno', quantity: 2 }] }), '2 bolos');
  assert.equal(api.orderSlicesText({ items: [{ flavor: 'Bolo', sizeId: 'f', size: '1 Fatia', quantity: 2 }] }), '2 fatias');
});

// Etapa 10: retorno do pagamento com estados "verificando" e "confirmado"
const confirmedPayment = {
  orderId: 'PF-I-RETORNO', paymentState: 'confirmed', reviewRequired: false,
  order: {
    id: 'PF-I-RETORNO', status: 'Confirmado', totalQuantity: 3, total: 62.94, subtotal: 54.94, deliveryFee: 8, deliveryDate: '2026-10-25',
    items: [{ flavor: 'Chocolate', quantity: 2, subtotal: 34.97, pricingModel: 'progressive-v1' }, { flavor: 'Ninho', quantity: 1, subtotal: 19.97, pricingModel: 'progressive-v1' }],
    fulfillment: { mode: 'delivery' }
  }
};

function paymentReturnRuntime(answers, search = '?payment_return=1&order_nsu=PF-I-RETORNO&checkout_token=token-assinado&slug=inv&transaction_nsu=tx&capture_method=pix') {
  const calls = [];
  const queue = answers.slice();
  const runtime = createRuntime(async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.action === 'registerCheckoutReturn') return { ok: true, json: async () => ({ ok: true, checkout: { state: 'returned_unverified' } }) };
    const answer = queue.length > 1 ? queue.shift() : queue[0];
    if (answer instanceof Error) throw answer;
    return { ok: true, json: async () => ({ ok: true, payment: answer }) };
  }, { search });
  return { runtime, api: runtime.window.__uxTest, calls, verifyCalls: () => calls.filter(call => call.action === 'verifyCheckoutPayment') };
}

const isShown = (runtime, id) => !runtime.get(id).classList.contains('hidden');

test('retorno confirmado pelo servidor exibe tela de obrigado com resumo', async () => {
  const { runtime, api, calls } = paymentReturnRuntime([{ orderId: 'PF-I-RETORNO', paymentState: 'verifying' }, confirmedPayment]);
  await api.renderCheckoutReturn();
  assert.equal(calls[0].action, 'registerCheckoutReturn');
  assert.equal(calls[0].transaction_nsu, 'tx');
  assert.equal(isShown(runtime, 'paymentConfirmedState'), true);
  assert.equal(isShown(runtime, 'paymentVerifyingState'), false);
  assert.equal(runtime.get('confirmedOrderNumber').textContent, 'Nº do pedido: PF-I-RETORNO');
  assert.equal(runtime.get('confirmedQuantity').textContent, '3 fatias');
  assert.match(runtime.get('confirmedItems').innerHTML, /Chocolate · 2 fatias[\s\S]*R\$\s?34,97/);
  assert.match(runtime.get('confirmedTotal').textContent, /R\$\s?62,94/);
  assert.match(runtime.get('confirmedDeliveryFee').textContent, /R\$\s?8,00/);
  assert.equal(runtime.get('confirmedDelivery').textContent, '25/10/2026');
  assert.equal(runtime.get('confirmedFulfillment').textContent, 'Entrega no endereço');
  assert.equal(runtime.get('confirmedStatus').textContent, 'Confirmado');
});

test('retorno pendente mostra verificando sem afirmar pagamento e permite nova consulta', async () => {
  const { runtime, api, verifyCalls } = paymentReturnRuntime([{ orderId: 'PF-I-RETORNO', paymentState: 'verifying' }]);
  await api.renderCheckoutReturn();
  assert.equal(verifyCalls().length, 4, 'Consulta automática limitada a quatro tentativas.');
  assert.equal(isShown(runtime, 'paymentVerifyingState'), true);
  assert.equal(isShown(runtime, 'paymentConfirmedState'), false);
  assert.match(runtime.get('returnPaymentMessage').textContent, /Ainda não recebemos a confirmação/);
  assert.doesNotMatch(runtime.get('returnPaymentMessage').textContent, /foi confirmad|está confirmad|pagamento aprovado/i);
  assert.equal(runtime.get('recheckPaymentBtn').disabled, false);
  assert.equal(verifyCalls()[0].checkoutToken, 'token-assinado');
  assert.equal(runtime.window.replacedUrl, '?public=1', 'Token removido da barra de endereço.');
  runtime.get('recheckPaymentBtn').dispatch('click');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(verifyCalls().length, 5);
  assert.equal(verifyCalls()[4].checkoutToken, 'token-assinado', 'Nova consulta usa o token mantido em memória.');
});

test('parametros da URL nunca forcam o estado confirmado', async () => {
  const search = '?payment_return=1&order_nsu=PF-I-RETORNO&checkout_token=token-assinado&paid=true&status=Confirmado&paymentState=confirmed&confirmed=1';
  const { runtime, api } = paymentReturnRuntime([{ orderId: 'PF-I-RETORNO', paymentState: 'verifying' }], search);
  await api.renderCheckoutReturn();
  assert.equal(isShown(runtime, 'paymentConfirmedState'), false);
  assert.equal(runtime.get('confirmedOrderNumber').textContent, '');
  const withoutOrder = paymentReturnRuntime([{ orderId: 'PF-I-RETORNO', paymentState: 'confirmed', order: null }]);
  await withoutOrder.api.renderCheckoutReturn();
  assert.equal(isShown(withoutOrder.runtime, 'paymentConfirmedState'), false, 'Confirmação exige o resumo validado pelo servidor.');
});

test('pagamento em conferencia interrompe consultas e orienta sem novo pagamento', async () => {
  const { runtime, api, verifyCalls } = paymentReturnRuntime([{ orderId: 'PF-I-RETORNO', paymentState: 'verifying', reviewRequired: true }]);
  await api.renderCheckoutReturn();
  assert.equal(verifyCalls().length, 1);
  assert.match(runtime.get('returnPaymentMessage').textContent, /conferência da nossa equipe[\s\S]*Não é necessário pagar de novo/);
});

test('falha de rede e retorno sem token mantem pedido em verificacao', async () => {
  const failing = paymentReturnRuntime([new Error('offline')]);
  await failing.api.renderCheckoutReturn();
  assert.match(failing.runtime.get('returnPaymentMessage').textContent, /Não foi possível consultar a confirmação agora/);
  assert.equal(failing.runtime.get('recheckPaymentBtn').disabled, false);
  const missing = paymentReturnRuntime([confirmedPayment], '?payment_return=1&order_nsu=PF-I-RETORNO');
  await missing.api.renderCheckoutReturn();
  assert.equal(missing.calls.length, 0);
  assert.equal(missing.runtime.get('recheckPaymentBtn').disabled, true);
  assert.equal(isShown(missing.runtime, 'paymentConfirmedState'), false);
});

test('central identifica pagamento confirmado e motivo de conferencia', () => {
  const api = createRuntime().window.__uxTest;
  assert.match(api.renderAdminCheckout({ id: 'PF-1', status: 'Confirmado', checkout: { state: 'paid_confirmed', chargeId: 'inv', expectedAmountCents: 5494 } }), /Pagamento confirmado[\s\S]*Pagamento validado pela InfinitePay/);
  const review = api.renderAdminCheckout({ id: 'PF-2', status: 'Cancelado', checkout: { state: 'paid_unverified', reviewReason: 'order_cancelled', chargeId: 'inv' } });
  assert.match(review, /Conferência: pedido cancelado com pagamento aprovado/);
  assert.match(review, /checkout-check/);
});

test('consulta administrativa atualiza o status confirmado automaticamente', async () => {
  const runtime = createRuntime(async () => ({ ok: true, json: async () => ({ ok: true, checkout: { state: 'paid_confirmed', autoConfirmed: true, orderStatus: 'Confirmado', providerPaid: true } }) }));
  const api = runtime.window.__uxTest;
  api.setOrders([{ ...orders[0], checkout: { state: 'returned_unverified' } }]);
  await api.checkCheckoutPayment('PF-103');
  assert.equal(api.state().orders[0].status, 'Confirmado');
  assert.equal(api.state().orders[0].checkout.state, 'paid_confirmed');
});

// Contador de fatias com botões de menos e mais
function stepperRuntime() {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setConfig({ progressivePricing: { firstSlicePrice: 19.97, additionalSlicePrice: 15 }, flavors: ['Chocolate', 'Ninho'], sizes: [], payments: [] });
  api.setBuilderQuantity(1);
  const press = (id, times = 1) => { for (let i = 0; i < times; i++) runtime.get(id).dispatch('click'); };
  return { runtime, api, press, plus: n => press('itemQuantityIncrease', n), minus: n => press('itemQuantityDecrease', n) };
}

test('formulário usa contador de fatias sem campo digitável', () => {
  const builder = html.slice(html.indexOf('<div class="item-builder-actions">'), html.indexOf('id="addOrderItemBtn"'));
  assert.doesNotMatch(builder, /<input[^>]*itemQuantity/);
  assert.match(builder, /<button id="itemQuantityDecrease" class="stepper-btn" type="button" aria-label="Diminuir uma fatia" disabled>/);
  assert.match(builder, /<output id="itemQuantity" class="stepper-value"[^>]*>1<\/output>/);
  assert.match(builder, /<button id="itemQuantityIncrease" class="stepper-btn" type="button" aria-label="Aumentar uma fatia">/);
  assert.ok(builder.indexOf('itemQuantityDecrease') < builder.indexOf('id="itemQuantity"') && builder.indexOf('id="itemQuantity"') < builder.indexOf('itemQuantityIncrease'));
});

test('contador inicia em 1, soma e subtrai uma fatia e atualiza a prévia', () => {
  const { runtime, api, plus, minus } = stepperRuntime();
  assert.equal(api.builderQuantity(), 1);
  assert.equal(runtime.get('itemQuantity').textContent, '1');
  assert.match(runtime.get('pricingEstimate').innerHTML, /1 fatia · primeira R\$\s?19,97<\/span><strong>R\$\s?19,97<\/strong>/);
  plus(2);
  assert.equal(runtime.get('itemQuantity').textContent, '3');
  assert.match(runtime.get('pricingEstimate').innerHTML, /3 fatias · primeira R\$\s?19,97 \+ 2 × R\$\s?15,00/);
  assert.match(runtime.get('pricingEstimate').innerHTML, /R\$\s?49,97<br><span class="economy">Economia R\$\s?9,94/);
  minus();
  assert.equal(api.builderQuantity(), 2);
  assert.match(runtime.get('pricingEstimate').innerHTML, /R\$\s?34,97/);
});

test('contador respeita os limites de 1 e 20 fatias e desabilita os botões nos extremos', () => {
  const { runtime, api, plus, minus } = stepperRuntime();
  assert.equal(runtime.get('itemQuantityDecrease').disabled, true);
  assert.equal(runtime.get('itemQuantityIncrease').disabled, false);
  minus(3);
  assert.equal(api.builderQuantity(), 1);
  plus(25);
  assert.equal(api.builderQuantity(), 20);
  assert.equal(runtime.get('itemQuantity').textContent, '20');
  assert.equal(runtime.get('itemQuantityIncrease').disabled, true);
  assert.equal(runtime.get('itemQuantityDecrease').disabled, false);
  assert.match(runtime.get('pricingEstimate').innerHTML, /R\$\s?304,97/);
  minus();
  assert.equal(runtime.get('itemQuantityIncrease').disabled, false);
  for (const value of [0, -4, 99, 'abc', 2.7]) {
    api.setBuilderQuantity(value);
    assert.ok(api.builderQuantity() >= 1 && api.builderQuantity() <= 20 && Number.isInteger(api.builderQuantity()), String(value));
  }
});

test('adicionar à encomenda usa a quantidade do contador e o redefine para 1', () => {
  const { runtime, api, plus } = stepperRuntime();
  runtime.get('flavorSelect').value = 'Chocolate';
  plus(3);
  api.addSelectedOrderItem();
  assert.equal(JSON.stringify(api.getOrderItems()), JSON.stringify([{ flavor: 'Chocolate', quantity: 4 }]));
  assert.equal(api.builderQuantity(), 1);
  assert.equal(runtime.get('itemQuantity').textContent, '1');
  assert.equal(runtime.get('itemQuantityDecrease').disabled, true);
  assert.match(runtime.get('orderItems').innerHTML, /Chocolate · 4 fatias/);
  assert.match(runtime.get('summaryTotal').textContent, /R\$\s?64,97/);
  assert.match(runtime.get('pricingEstimate').innerHTML, /1 fatia ·/);
});

test('contador mantém o limite de 20 fatias somado ao mesmo sabor', () => {
  const { runtime, api, plus } = stepperRuntime();
  runtime.get('flavorSelect').value = 'Ninho';
  plus(17);
  api.addSelectedOrderItem();
  plus(2);
  api.addSelectedOrderItem();
  assert.equal(JSON.stringify(api.getOrderItems()), JSON.stringify([{ flavor: 'Ninho', quantity: 18 }]));
  assert.equal(api.builderQuantity(), 3, 'Quantidade recusada permanece no contador para ajuste.');
});

// Etapa 9.3: totalização dos pedidos exibidos
const totalOrders = [
  { ...multiFlavorOrder, id: 'PF-T-1', customerName: 'Ana Entrega', date: '2026-10-25', status: 'Aguardando pagamento' },
  { ...legacySizeOrder, id: 'PF-T-2', customerName: 'Bruno Histórico', date: '2026-09-06', deliveryDate: '2026-09-06', status: 'Confirmado' },
  { id: 'PF-T-3', customerName: 'Célia Antiga', date: '2026-10-25', createdAt: '2026-10-01T12:00:00Z', flavor: 'Cenoura', size: 'Grande', price: 179, status: 'Cancelado' },
  { id: 'PF-T-4', customerName: 'Ana Retirada', date: '2026-10-25', createdAt: '2026-10-02T12:00:00Z', total: 0.1, items: [{ flavor: 'Chocolate', quantity: 1, subtotal: 0.1, pricingModel: 'progressive-v1' }], status: 'Confirmado' }
];
const noFilters = { loading: false, error: '', search: '', status: '', deliveryDate: '', sort: 'delivery-asc' };

function renderedTotals(runtime) {
  const markup = runtime.get('ordersContainer').innerHTML;
  const foot = markup.match(/<tfoot>([\s\S]*?)<\/tfoot>/)?.[1] || '';
  const summaries = [...markup.matchAll(/class="orders-total-summary" data-orders-total="(\d+)"><span>Total dos pedidos exibidos:<\/span><strong>([^<]+)<\/strong>/g)];
  return {
    markup, foot,
    table: foot.match(/data-orders-total="(\d+)"/)?.[1],
    tableText: foot.match(/class="order-value">([^<]+)</)?.[1],
    cards: summaries.map(match => match[1]),
    cardsText: summaries.map(match => match[2])
  };
}

function renderWith(view, list = totalOrders) {
  const runtime = createRuntime();
  const api = runtime.window.__uxTest;
  api.setOrders(list.map(order => ({ ...order })));
  api.setOrderView({ ...noFilters, ...view });
  api.renderLocalOrders();
  return { runtime, api, totals: renderedTotals(runtime) };
}

test('total soma todos os pedidos carregados sem filtros, inclusive cancelados', () => {
  const { totals } = renderWith({});
  // 82,91 + 49,97 + 179,00 + 0,10
  assert.equal(totals.table, '31198');
  assert.match(totals.tableText, /R\$\s?311,98/);
  assert.deepEqual(totals.cards, ['31198']);
});

test('total acompanha o filtro de status', () => {
  assert.equal(renderWith({ status: 'Confirmado' }).totals.table, '5007');
  assert.equal(renderWith({ status: 'Cancelado' }).totals.table, '17900');
});

test('total acompanha o filtro de data de recebimento', () => {
  const { totals } = renderWith({ deliveryDate: '2026-10-25' });
  assert.equal(totals.table, '26201');
  assert.deepEqual(totals.cards, ['26201']);
});

test('total acompanha a pesquisa por cliente', () => {
  assert.equal(renderWith({ search: 'célia' }).totals.table, '17900');
  assert.equal(renderWith({ search: 'ana' }).totals.table, '8301');
});

test('total combina pesquisa, status e data e ignora a ordenação', () => {
  assert.equal(renderWith({ search: 'ana', status: 'Confirmado', deliveryDate: '2026-10-25' }).totals.table, '10');
  const sorts = ['delivery-asc', 'delivery-desc', 'created-asc', 'created-desc'].map(sort => renderWith({ sort }).totals.table);
  assert.deepEqual([...new Set(sorts)], ['31198']);
});

test('total é recalculado após alteração de status e limpeza de filtros', async () => {
  const runtime = createRuntime(async (_url, options) => {
    const payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true, order: { id: payload.orderId, status: payload.status } }) };
  });
  const api = runtime.window.__uxTest;
  api.setOrders(totalOrders.map(order => ({ ...order })));
  api.setOrderView({ ...noFilters, status: 'Confirmado' });
  api.renderLocalOrders();
  assert.equal(renderedTotals(runtime).table, '5007');
  await api.changeOrderStatus('PF-T-3', 'Confirmado');
  assert.equal(renderedTotals(runtime).table, '22907');
  api.setOrderView({ search: '', status: '', deliveryDate: '' });
  api.renderLocalOrders();
  assert.equal(renderedTotals(runtime).table, '31198');
});

test('lista vazia ou sem resultados exibe total R$ 0,00', () => {
  for (const { totals } of [renderWith({}, []), renderWith({ search: 'não existe' })]) {
    assert.equal(totals.table, undefined);
    assert.deepEqual(totals.cards, ['0']);
    assert.match(totals.cardsText[0], /R\$\s?0,00/);
  }
});

test('pedidos antigos usam price e pedidos com entrega usam o total com taxa', () => {
  const api = createRuntime().window.__uxTest;
  assert.equal(api.ordersTotalCents([{ id: 'antigo', price: 179 }]), 17900);
  assert.equal(api.ordersTotalCents([{ id: 'sem valor' }]), 0);
  assert.equal(api.ordersTotalCents([multiFlavorOrder]), 8291);
  assert.notEqual(api.ordersTotalCents([multiFlavorOrder]), 7491, 'O total não deve usar o subtotal sem taxa.');
  assert.equal(api.ordersTotalCents([{ ...multiFlavorOrder, total: undefined, price: 82.91 }]), 8291);
});

test('soma monetária é feita em centavos inteiros', () => {
  const api = createRuntime().window.__uxTest;
  const cents = api.ordersTotalCents([{ total: 0.1 }, { total: 0.2 }, { total: 19.97 }, { total: 15 }]);
  assert.equal(cents, 3527);
  assert.ok(Number.isInteger(cents));
  assert.equal(api.ordersTotalCents(Array.from({ length: 10 }, () => ({ total: 0.1 }))), 100);
});

test('rodapé desktop mantém cinco colunas com total na quarta e status vazio', () => {
  const { totals } = renderWith({});
  assert.match(totals.markup, /<\/tbody>\s*<tfoot>/);
  const cells = [...totals.foot.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
  assert.equal(cells.length, 3);
  assert.equal(cells[0][1].trim(), 'colspan="3"');
  assert.equal(cells[0][2], 'Total dos pedidos exibidos');
  assert.match(cells[1][2], /<strong class="order-value">R\$\s?311,98<\/strong>/);
  assert.equal(cells[2][2], '');
  assert.equal(cells.reduce((sum, cell) => sum + Number(cell[1].match(/colspan="(\d+)"/)?.[1] || 1), 0), 5);
  assert.equal((totals.markup.match(/<th>/g) || []).length, 5);
});

test('resumo mobile fica abaixo dos cards e usa o mesmo total filtrado', () => {
  const { totals } = renderWith({ status: 'Confirmado' });
  const list = totals.markup.slice(totals.markup.indexOf('<div class="orders-mobile-list">'));
  assert.ok(list.lastIndexOf('<article class="order-mobile-card"') < list.indexOf('class="orders-total-summary"'));
  assert.deepEqual(totals.cards, [totals.table]);
  assert.match(totals.cardsText[0], /R\$\s?50,07/);
});

// Etapa 11: visualização Kanban
// Resultados criados no contexto vm têm outro protótipo; compara a estrutura serializada.
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);
const progressiveItem = (flavor, quantity, subtotal) => ({ flavor, quantity, subtotal, pricingModel: 'progressive-v1' });
const kanbanOrders = [
  {
    id: 'PF-20261020-120000-KANB01', customerName: 'Ana Aguardando', whatsapp: '(34) 99999-1111', date: '2026-10-25', time: '10:00',
    createdAt: '2026-10-20T12:00:00Z', total: 47.97, subtotal: 39.97, deliveryFee: 8, totalQuantity: 2, notes: 'Sem nozes',
    items: [progressiveItem('Chocolate com brigadeiro', 2, 39.97)], status: 'Aguardando pagamento',
    fulfillment: { mode: 'delivery', address: { cep: '38400000', street: 'Rua Fictícia', number: '10', neighborhood: 'Centro', city: 'Cidade Exemplo', state: 'MG' } },
    checkout: { state: 'returned_unverified', chargeId: 'invoice-kanban-tecnico', expectedAmountCents: 4797, url: 'https://checkout.infinitepay.io/fictitious' }
  },
  { id: 'PF-K-2', customerName: 'Bruno Confirmado', whatsapp: '(34) 98888-2222', date: '2026-10-24', createdAt: '2026-10-19T12:00:00Z', total: 19.97, totalQuantity: 1, items: [progressiveItem('Ninho com morango', 1, 19.97)], status: 'Confirmado', fulfillment: { mode: 'pickup' } },
  { id: 'PF-K-3', customerName: 'Célia Produção', date: '2026-10-26', createdAt: '2026-10-18T12:00:00Z', total: 64.94, totalQuantity: 4, items: [progressiveItem('Cenoura', 2, 34.97), progressiveItem('Red Velvet', 2, 29.97)], status: 'Em produção', fulfillment: { mode: 'pickup' } },
  { id: 'PF-K-4', customerName: 'Davi Concluído', date: '2026-10-20', createdAt: '2026-10-15T12:00:00Z', total: 19.97, totalQuantity: 1, items: [progressiveItem('Chocolate', 1, 19.97)], status: 'Concluído', fulfillment: { mode: 'delivery', address: null } },
  { id: 'PF-K-5', customerName: 'Eva Cancelada', date: '2026-10-21', createdAt: '2026-10-14T12:00:00Z', total: 19.97, totalQuantity: 1, items: [progressiveItem('Ninho', 1, 19.97)], status: 'Cancelado' },
  { id: 'PF-K-6', customerName: 'Fábio Legado', date: '2026-10-27', createdAt: '2026-08-01T12:00:00Z', time: 'Sat Dec 30 1899 00:00:00 GMT-0306 (Horário Padrão de Brasília)', flavor: 'Cenoura', size: 'Grande', price: 179, status: 'Pagamento não confirmado' },
  { id: 'PF-K-7', customerName: 'Gil Personalizado', date: '2026-10-28', createdAt: '2026-08-02T12:00:00Z', total: 19.97, totalQuantity: 1, items: [progressiveItem('Chocolate', 1, 19.97)], status: 'Retirado na loja' }
];

function kanbanLayout(runtime) {
  return runtime.get('ordersContainer').innerHTML.split('<section class="kanban-column"').slice(1).map(chunk => ({
    status: chunk.match(/data-kanban-column="([^"]*)"/)[1],
    title: chunk.match(/<h3[^>]*>([^<]+)<\/h3>/)[1],
    count: Number(chunk.match(/class="kanban-count"[^>]*>(\d+)</)[1]),
    ids: [...chunk.matchAll(/data-kanban-card="([^"]+)"/g)].map(match => match[1]),
    markup: chunk
  }));
}

function columnOf(runtime, orderId) {
  return kanbanLayout(runtime).find(column => column.ids.includes(orderId))?.title;
}

function apiResponse(body) {
  return { ok: true, json: async () => body };
}

function kanbanRuntime(handler = () => ({ ok: true }), runtimeOptions = {}) {
  const requests = [];
  const runtime = createRuntime(async (_url, options) => {
    const payload = JSON.parse(options.body);
    requests.push(payload);
    return apiResponse(await handler(payload));
  }, runtimeOptions);
  const api = runtime.window.__uxTest;
  api.setOrders(kanbanOrders.map(order => JSON.parse(JSON.stringify(order))));
  api.setOrderView({ ...noFilters });
  api.setOrdersView('kanban');
  const statusUpdates = () => requests.filter(payload => payload.action === 'updateOrderStatus');
  return { runtime, api, requests, statusUpdates, layout: () => kanbanLayout(runtime), statusOf: id => api.state().orders.find(order => order.id === id)?.status };
}

const savedStatus = payload => payload.action === 'updateOrderStatus'
  ? { ok: true, order: { id: payload.orderId, status: payload.status, previousStatus: payload.expectedStatus, unchanged: false } }
  : { ok: true };

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

test('kanban: alterna entre Lista e Kanban preservando a lista e persistindo só a preferência', () => {
  const storage = memoryStorage();
  const runtime = createRuntime(undefined, { localStorage: storage });
  const api = runtime.window.__uxTest;
  api.setOrders(kanbanOrders.map(order => ({ ...order })));
  api.setOrderView({ ...noFilters });
  api.renderLocalOrders();
  assert.equal(api.state().orderViewState.view, 'list');
  assert.match(runtime.get('ordersContainer').innerHTML, /orders-table/);
  assert.doesNotMatch(runtime.get('ordersContainer').innerHTML, /kanban-board/);
  runtime.get('ordersKanbanViewBtn').dataset.ordersView = 'kanban';
  runtime.get('ordersKanbanViewBtn').dispatch('click');
  assert.match(runtime.get('ordersContainer').innerHTML, /class="kanban-board"/);
  assert.doesNotMatch(runtime.get('ordersContainer').innerHTML, /orders-table/);
  assert.equal(runtime.get('ordersKanbanViewBtn').attributes['aria-pressed'], 'true');
  assert.equal(runtime.get('ordersListViewBtn').attributes['aria-pressed'], 'false');
  same([...storage.values.entries()], [['bologis:orders-view', 'kanban']]);
  api.setOrdersView('list');
  assert.match(runtime.get('ordersContainer').innerHTML, /orders-table[\s\S]*orders-mobile-list[\s\S]*<details class="order-details">/);
  assert.equal(storage.values.get('bologis:orders-view'), 'list');
});

test('kanban: preferência salva é restaurada e armazenamento inválido ou bloqueado volta para Lista', () => {
  assert.equal(createRuntime(undefined, { localStorage: memoryStorage({ 'bologis:orders-view': 'kanban' }) }).window.__uxTest.state().orderViewState.view, 'kanban');
  assert.equal(createRuntime(undefined, { localStorage: memoryStorage({ 'bologis:orders-view': '<script>' }) }).window.__uxTest.state().orderViewState.view, 'list');
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); }, removeItem() {} };
  const runtime = createRuntime(undefined, { localStorage: blocked });
  assert.equal(runtime.window.__uxTest.state().orderViewState.view, 'list');
  runtime.window.__uxTest.setOrders([]);
  assert.doesNotThrow(() => runtime.window.__uxTest.setOrdersView('kanban'));
  assert.equal(runtime.window.__uxTest.state().orderViewState.view, 'kanban');
});

test('kanban: renderiza as cinco colunas com nome, quantidade e estado vazio', () => {
  const { api, layout, runtime } = kanbanRuntime();
  api.setOrderView({ search: 'Bruno' });
  api.renderLocalOrders();
  const columns = layout();
  same(columns.map(column => column.title), ['Aguardando pagamento', 'Confirmado', 'Em produção', 'Concluído', 'Cancelado']);
  same(columns.map(column => column.count), [0, 1, 0, 0, 0]);
  assert.equal(columns.filter(column => /class="kanban-empty">Nenhum pedido</.test(column.markup)).length, 4);
  assert.equal(columns.every(column => /class="kanban-dropzone"/.test(column.markup)), true);
  assert.match(runtime.get('ordersResultCount').innerHTML, /<strong>1<\/strong> pedido encontrado/);
});

test('kanban: distribui os pedidos pelas colunas e não perde status legados ou personalizados', () => {
  const { layout } = kanbanRuntime();
  const columns = layout();
  same(columns.map(column => [column.title, column.ids]), [
    ['Aguardando pagamento', ['PF-20261020-120000-KANB01']],
    ['Confirmado', ['PF-K-2']],
    ['Em produção', ['PF-K-3']],
    ['Concluído', ['PF-K-4']],
    ['Cancelado', ['PF-K-5']],
    ['Outros status', ['PF-K-6', 'PF-K-7']]
  ]);
  assert.equal(columns.reduce((sum, column) => sum + column.count, 0), kanbanOrders.length);
  const other = columns.at(-1);
  assert.equal(other.status, '');
  assert.match(other.markup, /status-badge" data-status="Pagamento não confirmado">Pagamento não confirmado/);
  assert.match(other.markup, /status-badge" data-status="Retirado na loja">Retirado na loja/);
});

test('kanban: card resume o pedido e mantém detalhes e dados técnicos dentro de "Mais informações"', () => {
  const { layout } = kanbanRuntime();
  const card = layout()[0].markup;
  const surface = card.split('<details class="order-details">')[0];
  assert.match(surface, /#KANB01/);
  assert.match(surface, /Ana Aguardando/);
  assert.match(surface, /Chocolate com brigadeiro · 2 fatias/);
  assert.match(surface, /25\/10\/2026 · 10:00/);
  assert.match(surface, /order-fulfillment">Entrega</);
  assert.match(surface, /R\$\s*47,97/);
  assert.doesNotMatch(surface, /invoice-kanban-tecnico|99999-1111|Sem nozes|Rua Fictícia|checkout\.infinitepay/);
  const details = card.split('<details class="order-details">')[1];
  assert.match(details, /wa\.me\/5534999991111/);
  assert.match(details, /Rua Fictícia/);
  assert.match(details, /Sem nozes/);
  assert.match(details, /invoice-kanban-tecnico/);
  assert.match(details, /Conferir na InfinitePay/);
  assert.match(details, /Abrir checkout/);
  assert.match(layout()[1].markup, /order-fulfillment">Retirada</);
  assert.match(layout()[4].markup, /order-fulfillment">Não informado</);
});

test('kanban: arrastar para outra coluna só consolida após resposta positiva', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const k = kanbanRuntime(async payload => { if (payload.action === 'updateOrderStatus') await gate; return savedStatus(payload); });
  const move = k.api.handleKanbanDrop('PF-K-2', 'Em produção');
  assert.equal(columnOf(k.runtime, 'PF-K-2'), 'Confirmado', 'Card não pode mudar de coluna antes da resposta.');
  const savingColumn = k.layout()[1].markup;
  assert.match(savingColumn, /kanban-card is-saving/);
  assert.match(savingColumn, /aria-busy="true"/);
  assert.match(savingColumn, /Salvando\.\.\./);
  assert.match(savingColumn, /draggable="false"/);
  same(k.api.savingOrders(), ['PF-K-2']);
  assert.equal((await k.api.handleKanbanDrop('PF-K-2', 'Concluído')).reason, 'none', 'Card em salvamento não aceita nova movimentação.');
  release();
  same(await move, { moved: true });
  assert.equal(columnOf(k.runtime, 'PF-K-2'), 'Em produção');
  assert.equal(k.statusOf('PF-K-2'), 'Em produção');
  same(k.api.savingOrders(), []);
  same(k.statusUpdates().map(({ adminToken, ...payload }) => payload), [
    { action: 'updateOrderStatus', orderId: 'PF-K-2', status: 'Em produção', expectedStatus: 'Confirmado' }
  ]);
});

test('kanban: soltar na mesma coluna ou na coluna de outros status não altera o pedido', async () => {
  const k = kanbanRuntime(savedStatus);
  assert.equal(k.api.kanbanDropKind('PF-K-3', 'Em produção'), 'same');
  same(await k.api.handleKanbanDrop('PF-K-3', 'Em produção'), { moved: false, reason: 'same' });
  same(await k.api.handleKanbanDrop('PF-K-3', ''), { moved: false, reason: 'none' });
  same(await k.api.handleKanbanDrop('PF-INEXISTENTE', 'Concluído'), { moved: false, reason: 'none' });
  assert.equal(k.requests.length, 0);
  assert.equal(k.statusOf('PF-K-3'), 'Em produção');
});

test('kanban: falha de rede mantém o card na coluna original com mensagem', async () => {
  for (const failure of [async () => { throw new TypeError('Failed to fetch'); }, async () => ({ ok: false, status: 503, json: async () => ({}) })]) {
    const runtime = createRuntime(failure);
    const api = runtime.window.__uxTest;
    api.setOrders(kanbanOrders.map(order => ({ ...order })));
    api.setOrderView({ ...noFilters });
    api.setOrdersView('kanban');
    const result = await api.handleKanbanDrop('PF-K-2', 'Em produção');
    assert.equal(result.reason, 'error');
    assert.equal(columnOf(runtime, 'PF-K-2'), 'Confirmado');
    assert.equal(api.state().orders.find(order => order.id === 'PF-K-2').status, 'Confirmado');
    same(api.savingOrders(), []);
    assert.match(runtime.get('ordersMessage').className, /error/);
    assert.match(runtime.get('ordersMessage').textContent, /Não foi possível mover o pedido #PF-K-2: falha de conexão\. Ele permanece em "Confirmado"/);
  }
});

test('kanban: conflito com webhook recarrega o quadro com o status mais recente', async () => {
  const fresh = kanbanOrders.map(order => order.id === 'PF-20261020-120000-KANB01' ? { ...order, status: 'Confirmado', checkout: { state: 'paid_confirmed' } } : order);
  const k = kanbanRuntime(payload => payload.action === 'getOrders'
    ? { ok: true, orders: fresh }
    : { ok: false, code: 'STATUS_CONFLICT', message: 'O pedido foi atualizado por outra operação. Os pedidos foram recarregados com o status mais recente.', currentStatus: 'Confirmado' });
  const result = await k.api.handleKanbanDrop('PF-20261020-120000-KANB01', 'Cancelado');
  assert.equal(result.reason, 'conflict');
  same(k.requests.map(payload => payload.action), ['updateOrderStatus', 'getOrders']);
  assert.equal(k.statusUpdates()[0].expectedStatus, 'Aguardando pagamento');
  assert.equal(columnOf(k.runtime, 'PF-20261020-120000-KANB01'), 'Confirmado');
  assert.match(k.runtime.get('ordersMessage').textContent, /atualizado por outra operação/);
  same(k.api.savingOrders(), []);
});

test('kanban: card acompanha a confirmação automática da InfinitePay', async () => {
  const k = kanbanRuntime(() => ({ ok: true, checkout: { state: 'paid_confirmed', autoConfirmed: true, orderStatus: 'Confirmado', providerPaid: true } }));
  assert.equal(columnOf(k.runtime, 'PF-20261020-120000-KANB01'), 'Aguardando pagamento');
  await k.api.checkCheckoutPayment('PF-20261020-120000-KANB01');
  assert.equal(columnOf(k.runtime, 'PF-20261020-120000-KANB01'), 'Confirmado');
  assert.equal(k.statusUpdates().length, 0, 'A confirmação automática não passa pela movimentação manual.');
});

test('kanban: arrastar para Confirmado exige confirmação manual explícita do pagamento', async () => {
  const prompts = [];
  let accept = false;
  const k = kanbanRuntime(savedStatus, { confirm: message => { prompts.push(message); return accept; } });
  assert.equal((await k.api.handleKanbanDrop('PF-20261020-120000-KANB01', 'Confirmado')).reason, 'dismissed');
  assert.equal(k.requests.length, 0);
  assert.match(prompts[0], /Confirmar manualmente o pagamento do pedido #KANB01/);
  assert.match(prompts[0], /mover o pedido não valida pagamento/);
  assert.equal(columnOf(k.runtime, 'PF-20261020-120000-KANB01'), 'Aguardando pagamento');
  accept = true;
  same(await k.api.handleKanbanDrop('PF-20261020-120000-KANB01', 'Confirmado'), { moved: true });
  assert.equal(k.statusUpdates()[0].manualPaymentConfirmation, true);
  assert.equal(k.statusUpdates()[0].confirmTransition, undefined);
});

test('kanban: produção sem pagamento confirmado e reversão de pagamento são bloqueadas sem requisição', async () => {
  const k = kanbanRuntime(savedStatus);
  for (const [id, target, message] of [
    ['PF-20261020-120000-KANB01', 'Em produção', /Confirme o pagamento antes/],
    ['PF-20261020-120000-KANB01', 'Concluído', /Confirme o pagamento antes/],
    ['PF-K-2', 'Aguardando pagamento', /não voltam para "Aguardando pagamento"/],
    ['PF-K-6', 'Em produção', /Confirme o pagamento antes/]
  ]) {
    assert.equal(k.api.kanbanDropKind(id, target), 'blocked');
    assert.equal((await k.api.handleKanbanDrop(id, target)).reason, 'blocked');
    assert.match(k.runtime.get('ordersMessage').textContent, message);
  }
  assert.equal(k.requests.length, 0);
});

test('kanban: cancelamento pede confirmação e envia autorização explícita', async () => {
  const prompts = [];
  let accept = false;
  const k = kanbanRuntime(savedStatus, { confirm: message => { prompts.push(message); return accept; } });
  assert.equal((await k.api.handleKanbanDrop('PF-K-3', 'Cancelado')).reason, 'dismissed');
  assert.equal(k.requests.length, 0);
  assert.equal(columnOf(k.runtime, 'PF-K-3'), 'Em produção');
  assert.match(prompts[0], /Cancelar o pedido #PF-K-3 \(Célia Produção\)\?/);
  accept = true;
  await k.api.handleKanbanDrop('PF-K-3', 'Cancelado');
  assert.equal(k.statusUpdates()[0].confirmTransition, true);
  assert.equal(k.statusUpdates()[0].manualPaymentConfirmation, undefined);
  assert.equal(columnOf(k.runtime, 'PF-K-3'), 'Cancelado');
});

test('kanban: reabrir pedido concluído exige confirmação', async () => {
  const prompts = [];
  const k = kanbanRuntime(savedStatus, { confirm: message => { prompts.push(message); return true; } });
  await k.api.handleKanbanDrop('PF-K-4', 'Em produção');
  assert.match(prompts[0], /Reabrir o pedido #PF-K-4 \(Davi Concluído\) em "Em produção"/);
  same(k.statusUpdates().map(payload => [payload.expectedStatus, payload.status, payload.confirmTransition]), [['Concluído', 'Em produção', true]]);
  assert.equal(columnOf(k.runtime, 'PF-K-4'), 'Em produção');
  // Avanços operacionais simples não interrompem com diálogos.
  await k.api.handleKanbanDrop('PF-K-2', 'Em produção');
  assert.equal(prompts.length, 1);
});

test('kanban: pedido cancelado fica travado e não é arrastável', async () => {
  const k = kanbanRuntime(savedStatus);
  const cancelled = k.layout()[4].markup;
  assert.match(cancelled, /draggable="false"/);
  assert.match(cancelled, /Pedido cancelado: movimentação bloqueada\./);
  assert.doesNotMatch(cancelled, /kanban-move-select/);
  for (const status of ['Aguardando pagamento', 'Confirmado', 'Em produção', 'Concluído']) {
    assert.equal((await k.api.handleKanbanDrop('PF-K-5', status)).reason, 'blocked');
  }
  assert.equal(k.requests.length, 0);
});

test('kanban: controle de movimentação por toque e teclado usa select nativo com destinos válidos', async () => {
  const k = kanbanRuntime(savedStatus);
  const waiting = k.layout()[0].markup;
  assert.match(waiting, /<label class="kanban-move"><span class="sr-only">Mover pedido #KANB01 para<\/span><select class="control kanban-move-select"/);
  assert.match(waiting, /<option value="">Mover para…<\/option>/);
  assert.match(waiting, /value="Confirmado" >Confirmado · confirmação manual/);
  assert.match(waiting, /value="Em produção" disabled>Em produção · indisponível/);
  assert.match(waiting, /value="Cancelado" >Cancelado · pede confirmação/);
  assert.doesNotMatch(waiting, /value="Aguardando pagamento"/, 'O status atual não aparece como destino.');
  assert.match(k.layout()[1].markup, /value="Em produção" >Em produção<\/option>/);
  same(await k.api.moveOrderToStatus('PF-K-2', 'Em produção'), { moved: true });
  assert.equal(columnOf(k.runtime, 'PF-K-2'), 'Em produção');
});

test('kanban: Lista usa as mesmas regras e desabilita destinos bloqueados', async () => {
  const prompts = [];
  const runtime = createRuntime(async (_url, options) => apiResponse(savedStatus(JSON.parse(options.body))), { confirm: message => { prompts.push(message); return false; } });
  const api = runtime.window.__uxTest;
  api.setOrders(kanbanOrders.map(order => ({ ...order })));
  api.setOrderView({ ...noFilters });
  api.renderLocalOrders();
  const waitingOptions = api.renderStatusOptions('Aguardando pagamento');
  assert.match(waitingOptions, /value="Em produção" {2}disabled/);
  assert.match(waitingOptions, /value="Concluído" {2}disabled/);
  assert.doesNotMatch(waitingOptions, /value="Confirmado" {2}disabled/);
  assert.match(api.renderStatusOptions('Cancelado'), /value="Confirmado" {2}disabled/);
  assert.equal((await api.moveOrderToStatus('PF-K-3', 'Cancelado')).reason, 'dismissed');
  assert.match(prompts[0], /Cancelar o pedido/);
  assert.equal(api.state().orders.find(order => order.id === 'PF-K-3').status, 'Em produção');
  assert.match(runtime.get('ordersContainer').innerHTML, /orders-table/);
});

test('kanban: filtros produzem os mesmos pedidos da Lista', () => {
  const k = kanbanRuntime();
  for (const filters of [
    { search: 'célia' }, { search: '98888' }, { status: 'Pagamento não confirmado' }, { status: 'Confirmado' },
    { deliveryDate: '2026-10-25' }, { search: 'chocolate', sort: 'created-desc' }, { search: 'não existe' }
  ]) {
    k.api.setOrderView({ ...noFilters, ...filters });
    k.api.renderLocalOrders();
    const expected = k.api.filterAndSortOrders().map(order => order.id).sort();
    const shown = k.layout().flatMap(column => column.ids).sort();
    same(shown, expected, JSON.stringify(filters));
    if (!expected.length) assert.match(k.runtime.get('ordersContainer').innerHTML, /Nenhum pedido corresponde aos filtros/);
  }
});

test('kanban: ordenação existente é respeitada dentro de cada coluna', () => {
  const extra = [
    { id: 'PF-S-1', customerName: 'Primeiro', date: '2026-10-30', createdAt: '2026-10-01T12:00:00Z', total: 1, status: 'Confirmado' },
    { id: 'PF-S-2', customerName: 'Segundo', date: '2026-10-22', createdAt: '2026-10-05T12:00:00Z', total: 1, status: 'Confirmado' }
  ];
  const k = kanbanRuntime();
  k.api.setOrders([...kanbanOrders, ...extra]);
  k.api.setOrderView({ ...noFilters, sort: 'delivery-asc' });
  k.api.renderLocalOrders();
  same(k.layout()[1].ids, ['PF-S-2', 'PF-K-2', 'PF-S-1']);
  k.api.setOrderView({ sort: 'created-desc' });
  k.api.renderLocalOrders();
  same(k.layout()[1].ids, ['PF-K-2', 'PF-S-2', 'PF-S-1']);
});

test('kanban: totalização reutiliza o mesmo cálculo e acompanha os filtros', () => {
  const k = kanbanRuntime();
  const totalFor = () => renderedTotals(k.runtime).cards;
  // 47,97 + 19,97 + 64,94 + 19,97 + 19,97 + 179,00 + 19,97 = 371,79 (inclui cancelado; não é faturamento recebido)
  same(totalFor(), ['37179']);
  assert.equal(String(k.api.ordersTotalCents(k.api.filterAndSortOrders())), '37179');
  k.api.setOrderView({ status: 'Confirmado' });
  k.api.renderLocalOrders();
  same(totalFor(), ['1997']);
  k.api.setOrdersView('list');
  assert.equal(renderedTotals(k.runtime).table, '1997');
  k.api.setOrdersView('kanban');
  k.api.setOrderView({ search: 'não existe' });
  k.api.renderLocalOrders();
  same(totalFor(), ['0']);
});

test('kanban: estrutura acessível com região rolável, colunas rotuladas e alternância anunciada', () => {
  const k = kanbanRuntime();
  const markup = k.runtime.get('ordersContainer').innerHTML;
  assert.match(markup, /<div class="kanban-board" role="region" aria-label="Quadro de pedidos por status" tabindex="0">/);
  for (const [index, column] of k.layout().entries()) {
    assert.match(column.markup, new RegExp(`aria-labelledby="kanban-column-${index}"[\\s\\S]*<h3 id="kanban-column-${index}">`));
    assert.match(column.markup, new RegExp(`aria-label="${column.count} ${column.count === 1 ? 'pedido' : 'pedidos'}"`));
  }
  assert.equal([...markup.matchAll(/<article class="kanban-card[^>]*aria-label="Pedido #[^"]+, [^"]+"/g)].length, kanbanOrders.length);
  assert.equal([...markup.matchAll(/<details class="order-details"><summary>Mais informações<\/summary>/g)].length, kanbanOrders.length);
  assert.match(html, /<div class="orders-view-switch" role="group" aria-label="Visualização dos pedidos">/);
  assert.match(html, /id="ordersListViewBtn" type="button" data-orders-view="list" aria-pressed="true">Lista</);
  assert.match(html, /id="ordersKanbanViewBtn" type="button" data-orders-view="kanban" aria-pressed="false">Kanban</);
  assert.match(html, /\.sr-only \{ position: absolute;/);
  assert.match(html, /\.orders-view-switch button:focus-visible, \.kanban-board:focus-visible \{ outline: 2px solid var\(--accent\)/);
});

test('kanban: quadro tem rolagem horizontal contida e colunas adaptadas ao celular', () => {
  const board = html.match(/\.kanban-board \{([\s\S]*?)\n {4}\}/)[1];
  assert.match(board, /overflow-x: auto;/);
  assert.match(board, /overscroll-behavior-inline: contain;/);
  assert.match(board, /max-width: 100%;/);
  assert.match(board, /grid-auto-flow: column;/);
  assert.match(html, /@media \(max-width: 660px\) \{[\s\S]*?\.kanban-board \{ --kanban-column: 84%; \}/);
  assert.match(html, /\.kanban-move \.control \{[^}]*min-height: 44px;/);
});

test('kanban: compatibilidade histórica com pedidos sem itens, sem recebimento e com horário serial', () => {
  const k = kanbanRuntime(savedStatus);
  const legacy = k.layout().at(-1).markup.split('<article').find(chunk => chunk.includes('PF-K-6'));
  const surface = legacy.split('<details')[0];
  assert.match(surface, /Fábio Legado/);
  assert.match(surface, /Cenoura · 1 bolo/);
  assert.match(surface, /order-fulfillment">Não informado</);
  assert.match(surface, /R\$\s*179,00/);
  assert.match(surface, /27\/10\/2026</);
  assert.doesNotMatch(legacy, /1899|GMT-/);
  assert.match(surface, /value="Aguardando pagamento" >Aguardando pagamento<\/option>/);
});

test('kanban: status legado pode ser normalizado para Aguardando pagamento sem diálogo', async () => {
  const prompts = [];
  const k = kanbanRuntime(savedStatus, { confirm: message => { prompts.push(message); return true; } });
  same(await k.api.handleKanbanDrop('PF-K-7', 'Aguardando pagamento'), { moved: true });
  assert.equal(prompts.length, 0);
  assert.equal(k.statusUpdates()[0].expectedStatus, 'Retirado na loja');
  assert.equal(columnOf(k.runtime, 'PF-K-7'), 'Aguardando pagamento');
  assert.equal(k.layout().some(column => column.title === 'Outros status' && column.ids.includes('PF-K-7')), false);
});

test('kanban: regras do navegador espelham exatamente as do Apps Script', () => {
  const backend = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'code.gs'), 'utf8'), backend, { filename: 'code.gs' });
  const api = createRuntime().window.__uxTest;
  const statuses = ['Aguardando pagamento', 'Confirmado', 'Em produção', 'Concluído', 'Cancelado'];
  for (const from of [...statuses, 'Novo', 'Pagamento não confirmado', 'Retirado na loja', '']) {
    for (const to of statuses) {
      const server = vm.runInContext(`orderStatusTransition_(${JSON.stringify(from)}, ${JSON.stringify(to)})`, backend);
      const client = api.orderStatusTransition(from, to);
      assert.equal(client.kind, server.kind, `${from || '(vazio)'} → ${to}`);
      assert.equal(client.message, server.message, `${from || '(vazio)'} → ${to}`);
    }
  }
});

test('kanban: envio de status nunca marca confirmação financeira por padrão', async () => {
  const k = kanbanRuntime(savedStatus);
  await k.api.changeOrderStatus('PF-K-2', 'Em produção');
  const [payload] = k.statusUpdates();
  assert.equal(payload.expectedStatus, 'Confirmado');
  assert.equal('manualPaymentConfirmation' in payload, false);
  assert.equal('confirmTransition' in payload, false);
});

test('kanban: Lista também mostra o pedido em salvamento e não aceita nova alteração simultânea', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const k = kanbanRuntime(async payload => { await gate; return savedStatus(payload); });
  k.api.setOrdersView('list');
  const move = k.api.moveOrderToStatus('PF-K-2', 'Em produção');
  assert.match(k.runtime.get('ordersContainer').innerHTML, /data-order-id="PF-K-2"[^>]*disabled aria-busy="true"/);
  same(await k.api.moveOrderToStatus('PF-K-2', 'Concluído'), { moved: false, reason: 'unavailable' });
  release();
  same(await move, { moved: true });
  assert.doesNotMatch(k.runtime.get('ordersContainer').innerHTML, /aria-busy="true"/);
  assert.equal(k.statusUpdates().length, 1);
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
