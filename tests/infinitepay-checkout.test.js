const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'code.gs'), 'utf8');

function bytes(value) { return Array.from(Buffer.from(value)); }

function createSheet(rows, columns) {
  return {
    getLastRow: () => rows.length + 1,
    getLastColumn: () => columns,
    appendRow: row => rows.push(row.slice()),
    deleteRow: row => rows.splice(row - 2, 1),
    deleteRows: (row, count) => rows.splice(row - 2, count),
    getRange(row, column, rowCount = 1, columnCount = 1) {
      return {
        getValues: () => rows.slice(row - 2, row - 2 + rowCount).map(item =>
          Array.from({ length: columnCount }, (_, index) => item[column - 1 + index] ?? '')
        ),
        setValue(value) {
          if (!rows[row - 2]) rows[row - 2] = [];
          rows[row - 2][column - 1] = value;
        },
        setValues(values) { values.forEach((value, index) => { rows[row - 2 + index] = value.slice(); }); }
      };
    }
  };
}

function createHarness(options = {}) {
  const orderRows = [];
  const itemRows = [];
  const checkoutRows = (options.checkoutRows || []).map(row => row.slice());
  const properties = new Map();
  const cache = new Map();
  const fetches = [];
  const fakeApiKey = ['inchk', 'fictitious_checkout_key'].join('_');
  if (options.configured !== false) {
    properties.set('INFINITEPAY_API_KEY', fakeApiKey);
    properties.set('INFINITEPAY_HANDLE', 'primeira-fornada-teste');
    properties.set('INFINITEPAY_REDIRECT_URL', 'https://devtiagoro.github.io/bologis/?public=1');
    properties.set('INFINITEPAY_RETURN_SECRET', 'fictitious-return-secret');
  }
  const sheets = {
    Pedidos: createSheet(orderRows, 31),
    PedidoItens: createSheet(itemRows, 12),
    CheckoutCobrancas: createSheet(checkoutRows, 11)
  };
  const spreadsheet = {
    getSheetByName: name => sheets[name] || null,
    getSpreadsheetTimeZone: () => 'America/Sao_Paulo'
  };
  const scriptProperties = {
    getProperty: key => properties.get(key) || null,
    setProperty: (key, value) => properties.set(key, String(value)),
    deleteProperty: key => properties.delete(key),
    setProperties: values => Object.entries(values).forEach(([key, value]) => properties.set(key, String(value)))
  };
  const config = {
    flavors: ['Chocolate', 'Ninho'], sizes: [],
    payments: [{ id: 'pix', name: 'PIX', active: true }],
    progressivePricing: { firstSlicePrice: 19.97, additionalSlicePrice: 15 },
    availability: {
      enabled: true,
      days: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true },
      deliveryDay: 'sunday', paymentDeadlineDay: 'thursday', paymentDeadlineTime: '23:59:59'
    }
  };
  const response = options.response || { status: 201, body: { url: 'https://checkout.infinitepay.com.br/fictitious-link', id: 'charge-fictitious' } };
  const responses = options.responses ? options.responses.slice() : null;
  const context = {
    Date, JSON, Math, String, Number, Object, Array, Error, RegExp, URL, encodeURIComponent, isFinite, isNaN,
    console: { log() {}, warn() {}, error() {} },
    PropertiesService: { getScriptProperties: () => scriptProperties },
    CacheService: { getScriptCache: () => ({
      get: key => cache.get(key) || null,
      put: (key, value) => cache.set(key, String(value)),
      remove: key => cache.delete(key)
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: {},
    UrlFetchApp: {
      fetch(url, request) {
        fetches.push({ url, request, payload: JSON.parse(request.payload) });
        const current = responses ? (responses.length > 1 ? responses.shift() : responses[0]) : response;
        if (options.networkFailure || current.networkFailure) throw new Error(options.networkMessage || current.networkMessage || 'NETWORK_FAILURE');
        return {
          getResponseCode: () => current.status,
          getContentText: () => current.text !== undefined ? current.text : JSON.stringify(current.body),
          getAllHeaders: () => current.headers || {}
        };
      }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_algorithm, value) => bytes(crypto.createHash('sha256').update(String(value)).digest()),
      computeHmacSha256Signature: (value, key) => bytes(crypto.createHmac('sha256', String(key)).update(String(value)).digest()),
      base64EncodeWebSafe: value => Buffer.from(value).toString('base64url'),
      base64DecodeWebSafe: value => bytes(Buffer.from(value, 'base64url')),
      newBlob: value => {
        const buffer = Array.isArray(value) ? Buffer.from(value) : Buffer.from(String(value));
        return { getBytes: () => bytes(buffer), getDataAsString: () => buffer.toString('utf8') };
      },
      formatDate(dateValue, _timezone, format) {
        const date = new Date(dateValue);
        if (format === 'u') return '2';
        if (format === 'yyyy-MM-dd') return '2026-10-25';
        if (format.includes("yyyy-MM-dd'T'HH:mm:ss")) return date.toISOString().replace('Z', '-03:00');
        return '20261020-120000';
      },
      parseDate: value => new Date(String(value).replace(' ', 'T') + '-03:00'),
      getUuid: () => '00000000-0000-4000-8000-000000000001', sleep() {}
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: text => ({ text, setMimeType() { return this; } })
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'code.gs' });
  context.getConfig_ = () => config;
  context.getSpreadsheet_ = () => spreadsheet;
  context.currentBusinessDate_ = () => new Date('2026-10-20T15:00:00Z');
  context.getOrderWindow_ = () => ({
    open: true, code: '', message: '', deliveryDate: new Date('2026-10-25T15:00:00Z'),
    deliveryDateText: '2026-10-25', deadline: new Date('2026-10-23T02:59:59Z'),
    deadlineText: '2026-10-22T23:59:59-03:00', serverNow: '2026-10-20T12:00:00-03:00'
  });

  function post(overrides = {}) {
    const payload = {
      action: 'createOrder', customerName: 'Cliente Fictício', whatsapp: '(34) 99999-0000',
      date: '2026-10-25', time: '10:00',
      items: [{ flavor: 'Chocolate', quantity: 2 }, { flavor: 'Ninho', quantity: 1 }],
      payment: 'InfinitePay', notes: '', source: 'site', website: '',
      idempotencyKey: 'checkout-fictitious-attempt-01', ...overrides
    };
    return JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) }, parameter: {} }).text);
  }

  return { context, config, properties, fetches, orderRows, itemRows, checkoutRows, fakeApiKey, post };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('cria checkout valido somente depois de registrar o pedido', () => {
  const h = createHarness();
  const result = h.post();
  assert.equal(result.ok, true);
  assert.equal(h.orderRows.length, 1);
  assert.equal(result.order.checkout.available, true);
  assert.equal(h.fetches.length, 1);
});

test('envia o valor definitivo em centavos sem aceitar total do navegador', () => {
  const h = createHarness();
  h.post({ total: 1, price: 1 });
  const items = h.fetches[0].payload.items;
  assert.equal(items.reduce((sum, item) => sum + item.quantity * item.price, 0), 5494);
});

test('habilita pix e cartao e pagamento unico', () => {
  const h = createHarness();
  h.post();
  assert.deepEqual(JSON.parse(JSON.stringify(h.fetches[0].payload.options.payment_methods_enabled)), ['credit_card', 'pix']);
  assert.equal(h.fetches[0].payload.options.single_payment, true);
});

test('pedido com varios sabores preserva itens progressivos no checkout', () => {
  const h = createHarness();
  h.post();
  assert.equal(h.fetches[0].payload.items.length, 3);
  assert.match(h.fetches[0].payload.items[0].description, /Chocolate/);
  assert.match(h.fetches[0].payload.items[2].description, /Ninho/);
});

test('reenvio idempotente reutiliza checkout existente', () => {
  const h = createHarness();
  const first = h.post();
  const second = h.post();
  assert.equal(second.order.id, first.order.id);
  assert.equal(second.order.checkout.url, first.order.checkout.url);
  assert.equal(h.fetches.length, 1);
  assert.equal(h.checkoutRows.length, 1);
});

test('falha de rede preserva pedido e bloqueia duplicacao automatica', () => {
  const h = createHarness({ networkFailure: true });
  const first = h.post();
  const second = h.post();
  assert.equal(first.order.checkout.state, 'unknown');
  assert.equal(h.orderRows.length, 1);
  assert.equal(h.fetches.length, 1);
  assert.equal(second.order.checkout.state, 'unknown');
});

test('falha da API preserva pedido com estado failed', () => {
  const h = createHarness({ response: { status: 422, body: { error: 'invalid' } } });
  const result = h.post();
  assert.equal(result.order.checkout.state, 'failed');
  assert.equal(h.orderRows.length, 1);
});

test('resposta 2xx sem URL fica em conciliacao sem recriar cobranca', () => {
  const h = createHarness({ response: { status: 201, body: { id: 'sem-url' } } });
  assert.equal(h.post().order.checkout.state, 'unknown');
  assert.equal(h.post().order.checkout.state, 'unknown');
  assert.equal(h.fetches.length, 1);
});

test('URL maliciosa nunca e devolvida ao navegador', () => {
  const h = createHarness({ response: { status: 201, body: { url: 'https://evil.example/pay' } } });
  const checkout = h.post().order.checkout;
  assert.equal(checkout.available, false);
  assert.equal(Boolean(checkout.url), false);
  assert.equal(JSON.stringify(checkout).includes('evil.example'), false);
});

test('pedido cancelado ou confirmado nao gera novo checkout', () => {
  const h = createHarness();
  const base = { id: 'PF-STATUS', total: 19.97, price: 19.97, customerName: 'Cliente', whatsapp: '34999990000', items: [{ flavor: 'Chocolate', quantity: 1, subtotal: 19.97, firstSlicePrice: 19.97, additionalSlicePrice: 15 }] };
  assert.equal(h.context.ensureCheckoutForOrder_({ ...base, status: 'Cancelado' }, '2026-10-22T23:59:59-03:00').state, 'blocked_order_status');
  assert.equal(h.context.ensureCheckoutForOrder_({ ...base, status: 'Confirmado' }, '2026-10-22T23:59:59-03:00').state, 'blocked_order_status');
  assert.equal(h.fetches.length, 0);
});

test('checkout expirado nao cria outra cobranca', () => {
  const h = createHarness();
  const order = { id: 'PF-EXP', total: 19.97, price: 19.97, status: 'Aguardando pagamento', customerName: 'Cliente', whatsapp: '34999990000', items: [{ flavor: 'Chocolate', quantity: 1, subtotal: 19.97, firstSlicePrice: 19.97, additionalSlicePrice: 15 }] };
  const version = h.context.checkoutValueVersion_(order);
  h.checkoutRows.push(['PF-EXP', version, 'https://checkout.infinitepay.com.br/old', 'old', 1997, new Date('2026-10-18T00:00:00Z'), new Date('2026-10-19T00:00:00Z'), 'active', '', '{}', new Date('2026-10-18T00:00:00Z')]);
  const result = h.context.ensureCheckoutForOrder_(order, '2026-10-22T23:59:59-03:00');
  assert.equal(result.state, 'expired');
  assert.equal(h.fetches.length, 0);
});

test('pedido permanece registrado quando checkout nao esta configurado', () => {
  const h = createHarness({ configured: false });
  const result = h.post();
  assert.equal(result.ok, true);
  assert.equal(result.order.checkout.state, 'not_configured');
  assert.equal(h.orderRows.length, 1);
  assert.equal(h.fetches.length, 0);
});

test('credencial fica apenas no header e nunca na resposta ou planilha', () => {
  const h = createHarness();
  const result = h.post();
  assert.equal(h.fetches[0].request.headers['X-Api-Key'], h.fakeApiKey);
  assert.equal(JSON.stringify(result).includes(h.fakeApiKey), false);
  assert.equal(JSON.stringify(h.checkoutRows).includes(h.fakeApiKey), false);
});

test('retorno assinado registra referencias sem confirmar pedido', () => {
  const h = createHarness();
  const created = h.post().order;
  const version = h.checkoutRows[0][1];
  const token = h.context.checkoutReturnToken_(created.id, version);
  const returned = h.context.registerCheckoutReturn_({
    order_nsu: created.id, checkoutToken: token, slug: 'invoice-fictitious',
    transaction_nsu: 'transaction-fictitious', capture_method: 'pix',
    receipt_url: 'https://app.infinitepay.io/receipt/fictitious'
  });
  assert.equal(returned.subjectToManualReview, true);
  assert.equal(h.orderRows[0][13], 'Aguardando pagamento');
  assert.equal(h.checkoutRows[0][7], 'returned_unverified');
});

test('retorno repetido com outra transacao e rejeitado', () => {
  const h = createHarness();
  const created = h.post().order;
  const token = h.context.checkoutReturnToken_(created.id, h.checkoutRows[0][1]);
  h.context.registerCheckoutReturn_({ order_nsu: created.id, checkoutToken: token, slug: 'invoice-1', transaction_nsu: 'transaction-1' });
  assert.throws(
    () => h.context.registerCheckoutReturn_({ order_nsu: created.id, checkoutToken: token, slug: 'invoice-2', transaction_nsu: 'transaction-2' }),
    error => error.code === 'CHECKOUT_RETURN_CONFLICT'
  );
});

test('consulta com valor divergente nao confirma pedido', () => {
  const h = createHarness({ response: { status: 200, body: { paid: true, amount: 1, paid_amount: 1, installments: 1 } } });
  h.checkoutRows.push(['PF-CHECK', 'v1', 'https://checkout.infinitepay.com.br/check', 'invoice-check', 1997, new Date('2026-10-20T15:00:00Z'), new Date('2026-10-22T23:59:59Z'), 'returned_unverified', '', JSON.stringify({ slug: 'invoice-check', transactionNsu: 'transaction-check' }), new Date('2026-10-20T15:00:00Z')]);
  const result = h.context.checkCheckoutPayment_('PF-CHECK');
  assert.equal(result.providerPaid, true);
  assert.equal(result.amountMatches, false);
  assert.equal(h.checkoutRows[0][7], 'payment_amount_mismatch');
});

test('pedidos antigos continuam legiveis sem checkout', () => {
  const h = createHarness({ configured: false });
  h.orderRows.push(['PF-LEGACY', new Date('2026-10-10T12:00:00Z'), 'Cliente antigo', '34999990000', new Date('2026-10-12T12:00:00Z'), '10:00', 'Chocolate', 'p', 'Pequeno', '', 89, 'PIX', '', 'Confirmado', 'site']);
  const orders = h.context.getOrders_();
  assert.equal(orders[0].id, 'PF-LEGACY');
  assert.equal(orders[0].checkout.available, false);
  assert.equal(orders[0].status, 'Confirmado');
});

// ---- Etapa 8.1: contrato documentado, diagnóstico e recuperação segura ----

const httpFailure = (status, body = { success: false, message: 'falha fictícia' }, headers = {}) => ({ response: { status, body, headers } });

test('payload envia handle sem cifrao e preserva campos documentados', () => {
  const h = createHarness();
  h.properties.set('INFINITEPAY_HANDLE', '$primeira-fornada-teste');
  h.post();
  const payload = h.fetches[0].payload;
  assert.equal(payload.handle, 'primeira-fornada-teste');
  assert.equal(h.fetches[0].url, 'https://api.checkout.infinitepay.io/links');
  assert.equal(payload.order_nsu, h.orderRows[0][0]);
  assert.match(payload.redirect_url, /^https:\/\/devtiagoro\.github\.io\/bologis\/\?public=1&payment_return=1&checkout_token=/);
  assert.equal(payload.customer.phone_number, '+5534999990000');
  assert.equal(payload.options.valid_until, '2026-10-22T23:59:59-03:00');
});

test('duas fatias usam preco progressivo em centavos (34,97)', () => {
  const h = createHarness();
  h.post({ items: [{ flavor: 'Chocolate', quantity: 2 }] });
  const items = h.fetches[0].payload.items;
  assert.deepEqual(items.map(item => [item.quantity, item.price]), [[1, 1997], [1, 1500]]);
  assert.equal(h.checkoutRows[0][4], 3497);
});

test('aceita checkout_url e dominio oficial checkout.infinitepay.io', () => {
  const h = createHarness({ response: { status: 200, body: { checkout_url: 'https://checkout.infinitepay.io/primeira-fornada/1RxANX7tdF' } } });
  const checkout = h.post().order.checkout;
  assert.equal(checkout.available, true);
  assert.equal(checkout.url, 'https://checkout.infinitepay.io/primeira-fornada/1RxANX7tdF');
});

test('HTTP 400 registra diagnostico sanitizado e permite retry seguro', () => {
  const h = createHarness(httpFailure(400, { success: false, message: 'param is missing or the value is empty or invalid: handle inchk_vazado_123 (34) 99999-0000' }, { 'X-Request-Id': 'req-fict-400' }));
  const checkout = h.post().order.checkout;
  assert.equal(checkout.state, 'failed');
  assert.equal(checkout.canRetry, true);
  assert.equal(checkout.diagnostic, undefined, 'diagnóstico não pode ir ao navegador do cliente');
  const references = JSON.parse(h.checkoutRows[0][9]);
  assert.equal(references.lastError.httpStatus, 400);
  assert.equal(references.lastError.category, 'invalid_request');
  assert.equal(references.lastError.correlationId, 'req-fict-400');
  assert.match(references.lastError.providerMessage, /invalid: handle/);
  assert.doesNotMatch(JSON.stringify(h.checkoutRows), /inchk_vazado|99999-0000/);
  assert.match(h.checkoutRows[0][8], /^HTTP 400 · invalid_request/);
});

test('HTTP 401 e 403 sao falhas de autenticacao sem cobranca', () => {
  for (const status of [401, 403]) {
    const h = createHarness(httpFailure(status));
    assert.equal(h.post().order.checkout.state, 'failed');
    assert.equal(JSON.parse(h.checkoutRows[0][9]).lastError.category, 'auth');
  }
});

test('HTTP 429 e falha definitiva com categoria de limite', () => {
  const h = createHarness(httpFailure(429));
  assert.equal(h.post().order.checkout.state, 'failed');
  assert.equal(JSON.parse(h.checkoutRows[0][9]).lastError.category, 'rate_limited');
});

test('HTTP 500 fica ambiguo e nao recria cobranca automaticamente', () => {
  const h = createHarness(httpFailure(500));
  const first = h.post().order.checkout;
  assert.equal(first.state, 'unknown');
  assert.equal(first.canRetry, false);
  h.post();
  assert.equal(h.fetches.length, 1);
  assert.equal(JSON.parse(h.checkoutRows[0][9]).lastError.category, 'provider_error');
});

test('timeout fica ambiguo com categoria propria', () => {
  const h = createHarness({ networkFailure: true, networkMessage: 'Timeout: https://api.checkout.infinitepay.io/links' });
  assert.equal(h.post().order.checkout.state, 'unknown');
  assert.equal(JSON.parse(h.checkoutRows[0][9]).lastError.category, 'timeout');
});

test('JSON invalido em 2xx fica ambiguo', () => {
  const h = createHarness({ response: { status: 200, text: '<html>gateway</html>' } });
  assert.equal(h.post().order.checkout.state, 'unknown');
  assert.equal(JSON.parse(h.checkoutRows[0][9]).lastError.category, 'invalid_json');
});

test('URL fora do dominio oficial fica ambigua e nunca e exposta', () => {
  const h = createHarness({ response: { status: 201, body: { url: 'https://evil.example/pay?token=x' } } });
  const checkout = h.post().order.checkout;
  assert.equal(checkout.state, 'unknown');
  assert.equal(JSON.parse(h.checkoutRows[0][9]).lastError.category, 'invalid_url');
  assert.doesNotMatch(JSON.stringify(h.checkoutRows), /token=x/);
});

test('retry apos falha definitiva reutiliza o mesmo registro', () => {
  const h = createHarness({ responses: [{ status: 400, body: { message: 'invalid' } }, { status: 201, body: { url: 'https://checkout.infinitepay.com.br/apos-retry' } }] });
  assert.equal(h.post().order.checkout.state, 'failed');
  const second = h.post().order.checkout;
  assert.equal(second.state, 'active');
  assert.equal(second.url, 'https://checkout.infinitepay.com.br/apos-retry');
  assert.equal(h.fetches.length, 2);
  assert.equal(h.orderRows.length, 1);
  assert.equal(h.checkoutRows.length, 1);
  const references = JSON.parse(h.checkoutRows[0][9]);
  assert.equal(references.attempts, 2);
  assert.equal(references.lastError, undefined);
  // Depois de ativo, novos reenvios não chamam a InfinitePay.
  h.post();
  assert.equal(h.fetches.length, 2);
});

test('retry automatico respeita limite de tentativas', () => {
  const h = createHarness(httpFailure(400));
  for (let index = 0; index < 5; index += 1) h.post();
  assert.equal(h.fetches.length, 3);
  assert.equal(h.post().order.checkout.canRetry, false);
  assert.equal(h.checkoutRows.length, 1);
});

test('registro failed da versao anterior nao repete automaticamente', () => {
  const h = createHarness();
  const created = h.post().order;
  h.checkoutRows[0][2] = '';
  h.checkoutRows[0][7] = 'failed';
  h.checkoutRows[0][8] = 'A InfinitePay não pôde criar o checkout neste momento.';
  h.checkoutRows[0][9] = '{}';
  const again = h.post().order.checkout;
  assert.equal(again.state, 'failed');
  assert.equal(again.canRetry, false);
  assert.equal(h.fetches.length, 1);
  assert.equal(h.context.getOrders_()[0].checkout.canManualRetry, true);
  const retried = h.context.retryOrderCheckout_(created.id);
  assert.equal(retried.state, 'active');
  assert.equal(h.fetches.length, 2);
  assert.equal(h.checkoutRows.length, 1);
});

test('nova tentativa administrativa e bloqueada para cobranca ativa ou ambigua', () => {
  const active = createHarness();
  const order = active.post().order;
  assert.throws(() => active.context.retryOrderCheckout_(order.id), error => error.code === 'CHECKOUT_RETRY_NOT_ALLOWED');
  const ambiguous = createHarness(httpFailure(503));
  const second = ambiguous.post().order;
  assert.throws(() => ambiguous.context.retryOrderCheckout_(second.id), error => error.code === 'CHECKOUT_RETRY_NOT_ALLOWED');
  assert.equal(ambiguous.fetches.length, 1);
});

test('nova tentativa administrativa recusa pedido de fornada encerrada', () => {
  const h = createHarness(httpFailure(400));
  const order = h.post().order;
  h.context.getOrderWindow_ = () => ({ open: true, deliveryDateText: '2026-11-01', deadlineText: '2026-10-29T23:59:59-03:00' });
  assert.throws(() => h.context.retryOrderCheckout_(order.id), error => error.code === 'CHECKOUT_RETRY_EXPIRED');
  assert.equal(h.fetches.length, 1);
});

test('central recebe diagnostico sem credencial', () => {
  const h = createHarness(httpFailure(401, { message: 'invalid api key inchk_vazado_999' }, { 'cf-ray': 'ray-fict' }));
  h.post();
  const checkout = h.context.getOrders_()[0].checkout;
  assert.equal(checkout.diagnostic.httpStatus, 401);
  assert.equal(checkout.diagnostic.category, 'auth');
  assert.equal(checkout.diagnostic.correlationId, 'ray-fict');
  assert.doesNotMatch(JSON.stringify(checkout), /inchk_/);
  assert.equal(checkout.canManualRetry, true);
});

test('acao administrativa de nova tentativa exige sessao', () => {
  const h = createHarness();
  const result = JSON.parse(h.context.doPost({ postData: { contents: JSON.stringify({ action: 'retryCheckout', orderId: 'PF-X' }) }, parameter: {} }).text);
  assert.equal(result.ok, false);
  assert.equal(h.fetches.length, 0);
});

test('configuracao publica expoe WhatsApp comercial para contato', () => {
  const h = createHarness();
  h.config.businessWhatsapp = '(34) 99999-8888';
  assert.equal(h.context.getPublicConfig_().businessWhatsapp, '(34) 99999-8888');
});

// ---- Etapa 9: entrega e retirada no checkout ----

function withFulfillment(h, overrides = {}) {
  h.config.fulfillment = { pickupEnabled: true, deliveryEnabled: true, deliveryFeeCents: 800, pickupAddress: 'Loja fictícia, 100', ...overrides };
  return h;
}

const deliveryRequest = (address = {}) => ({
  fulfillment: {
    mode: 'delivery',
    address: { cep: '38400-000', street: 'Rua Fictícia das Flores', number: '123', complement: 'Casa 2', neighborhood: 'Bairro Teste', city: 'Cidade Exemplo', state: 'MG', reference: 'Portão azul', ...address }
  }
});

test('entrega envia endereco do BOLOGIS e nao pede endereco no checkout', () => {
  const h = withFulfillment(createHarness());
  h.post(deliveryRequest());
  const payload = h.fetches[0].payload;
  assert.equal(payload.options.require_delivery_address, false);
  assert.deepEqual(JSON.parse(JSON.stringify(payload.address)), {
    cep: '38400000', street: 'Rua Fictícia das Flores', number: '123', neighborhood: 'Bairro Teste',
    city: 'Cidade Exemplo', state: 'MG', complement: 'Casa 2'
  });
  assert.equal(JSON.stringify(payload).includes('Portão azul'), false, 'referência é interna');
});

test('valor final do checkout inclui a taxa de entrega como item proprio', () => {
  const h = withFulfillment(createHarness());
  const result = h.post({ ...deliveryRequest(), items: [{ flavor: 'Chocolate', quantity: 2 }] });
  const items = h.fetches[0].payload.items;
  assert.deepEqual(items.map(item => [item.description, item.quantity, item.price]), [
    ['Chocolate — primeira fatia', 1, 1997], ['Chocolate — fatias adicionais', 1, 1500], ['Taxa de entrega', 1, 800]
  ]);
  assert.equal(items.reduce((sum, item) => sum + item.quantity * item.price, 0), 4297);
  assert.equal(h.checkoutRows[0][4], 4297);
  assert.equal(result.order.total, 42.97);
});

test('retirada nao envia endereco e mantem total sem taxa', () => {
  const h = withFulfillment(createHarness());
  h.post({ fulfillment: { mode: 'pickup' }, items: [{ flavor: 'Chocolate', quantity: 2 }] });
  const payload = h.fetches[0].payload;
  assert.equal(payload.address, undefined);
  assert.equal(payload.options.require_delivery_address, false);
  assert.equal(payload.items.some(item => /Taxa/.test(item.description)), false);
  assert.equal(h.checkoutRows[0][4], 3497);
});

test('versao de cobranca de pedidos sem modalidade nao muda', () => {
  const h = createHarness();
  const base = { id: 'PF-V', total: 19.97, items: [{ flavor: 'Chocolate', quantity: 1, subtotal: 19.97 }] };
  const legacyVersion = h.context.checkoutValueVersion_(base);
  assert.equal(h.context.checkoutValueVersion_({ ...base, fulfillment: { mode: '' }, deliveryFeeCents: 0 }), legacyVersion);
  assert.notEqual(h.context.checkoutValueVersion_({ ...base, fulfillment: { mode: 'pickup' }, deliveryFeeCents: 0 }), legacyVersion);
  assert.notEqual(
    h.context.checkoutValueVersion_({ ...base, fulfillment: { mode: 'delivery' }, deliveryFeeCents: 800 }),
    h.context.checkoutValueVersion_({ ...base, fulfillment: { mode: 'delivery' }, deliveryFeeCents: 900 })
  );
});

test('reenvio reaproveita a cobranca da entrega sem novo valor', () => {
  const h = withFulfillment(createHarness());
  const first = h.post(deliveryRequest());
  h.config.fulfillment.deliveryFeeCents = 1500;
  const second = h.post(deliveryRequest());
  assert.equal(second.order.checkout.url, first.order.checkout.url);
  assert.equal(h.fetches.length, 1);
  assert.equal(second.order.total, first.order.total);
});

test('nova tentativa administrativa preserva taxa e endereco do pedido', () => {
  const h = withFulfillment(createHarness(httpFailure(400)));
  const order = h.post(deliveryRequest()).order;
  h.context.retryOrderCheckout_(order.id);
  const retryPayload = h.fetches[1].payload;
  assert.equal(retryPayload.address.street, 'Rua Fictícia das Flores');
  assert.equal(retryPayload.items.at(-1).description, 'Taxa de entrega');
  assert.equal(h.checkoutRows.length, 1);
});

test('endereco e nome nunca chegam ao diagnostico nem aos registros', () => {
  const h = withFulfillment(createHarness(httpFailure(400, { message: 'invalid address: Rua Fictícia das Flores, Bairro Teste, Cliente Fictício' })));
  const logs = [];
  h.context.console.warn = message => logs.push(String(message));
  h.post(deliveryRequest());
  const stored = JSON.stringify(h.checkoutRows);
  assert.doesNotMatch(stored, /Rua Fictícia|Bairro Teste|Cliente Fictício/);
  assert.doesNotMatch(logs.join('\n'), /Rua Fictícia|Bairro Teste|Cliente Fictício/);
  assert.match(stored, /invalid address: \[dado pessoal\]/);
});

test('configuracao publica de recebimento nao expoe dados de pedidos', () => {
  const h = withFulfillment(createHarness());
  h.post(deliveryRequest());
  const publicConfig = JSON.stringify(h.context.getPublicConfig_());
  assert.match(publicConfig, /"deliveryFeeCents":800/);
  assert.doesNotMatch(publicConfig, /Rua Fictícia|38400000/);
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log(`PASS ${name}`); }
    catch (error) { failed += 1; console.error(`FAIL ${name}`); console.error(error.stack || error); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} testes aprovados`);
  if (failed) process.exitCode = 1;
})();
