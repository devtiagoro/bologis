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
