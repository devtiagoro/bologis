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
    Pedidos: createSheet(orderRows, 18),
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
        if (options.networkFailure) throw new Error('NETWORK_FAILURE');
        return {
          getResponseCode: () => response.status,
          getContentText: () => JSON.stringify(response.body)
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

test('resposta sem URL e rejeitada', () => {
  const h = createHarness({ response: { status: 201, body: { id: 'sem-url' } } });
  assert.equal(h.post().order.checkout.state, 'failed');
});

test('URL maliciosa nunca e devolvida ao navegador', () => {
  const h = createHarness({ response: { status: 201, body: { url: 'https://evil.example/pay' } } });
  const checkout = h.post().order.checkout;
  assert.equal(checkout.available, false);
  assert.equal(checkout.url, undefined);
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

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try { await fn(); console.log(`PASS ${name}`); }
    catch (error) { failed += 1; console.error(`FAIL ${name}`); console.error(error.stack || error); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} testes aprovados`);
  if (failed) process.exitCode = 1;
})();
