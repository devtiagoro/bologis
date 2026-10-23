const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'code.gs'), 'utf8');

function bytes(value) { return Array.from(Buffer.from(value)); }

function createHarness(options = {}) {
  const rows = (options.rows || []).map(row => row.slice());
  const itemRows = (options.itemRows || []).map(row => row.slice());
  const cache = new Map();
  let lockWaits = 0;
  let lockReleases = 0;
  function makeSheet(storage, columns, isItemSheet = false) {
    return {
      getLastRow: () => storage.length + 1,
      getLastColumn: () => columns,
      appendRow: row => storage.push(row.slice()),
      deleteRow(row) { storage.splice(row - 2, 1); },
      deleteRows(row, count) { storage.splice(row - 2, count); },
      getRange(row, column, rowCount = 1, columnCount = 1) {
        return {
          getValues() {
            return storage.slice(row - 2, row - 2 + rowCount).map(item =>
              Array.from({ length: columnCount }, (_, index) => item[column - 1 + index] ?? '')
            );
          },
          setValue(value) {
            if (!storage[row - 2]) storage[row - 2] = [];
            storage[row - 2][column - 1] = value;
          },
          setValues(values) {
            if (isItemSheet && options.failItemWrite) throw new Error('ITEM_WRITE_FAILED');
            values.forEach((valuesRow, index) => { storage[row - 2 + index] = valuesRow.slice(); });
          }
        };
      }
    };
  }
  const sheet = makeSheet(rows, 31);
  const itemSheet = makeSheet(itemRows, 12, true);
  const spreadsheet = {
    getSheetByName: name => name === 'PedidoItens' ? itemSheet : sheet,
    getSpreadsheetTimeZone: () => 'America/Sao_Paulo'
  };
  const config = options.config || {
    flavors: ['Chocolate ficticio'],
    sizes: [{ id: 'p', name: 'Pequeno', description: 'Serve 8 pessoas', price: 89 }],
    payments: [
      { id: 'pix', name: 'PIX', active: true },
      { id: 'off', name: 'Desativado', active: false }
    ],
    progressivePricing: { firstSlicePrice: 19.97, additionalSlicePrice: 15 },
    availability: {
      enabled: true,
      days: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true },
      deliveryDay: 'sunday', paymentDeadlineDay: 'thursday', paymentDeadlineTime: '23:59:59'
    }
  };
  const context = {
    Date, JSON, Math, String, Number, Object, Array, Error, RegExp, URL, isFinite, isNaN,
    console: { log() {}, warn() {}, error() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'unused' }) },
    CacheService: { getScriptCache: () => ({
      get: key => cache.get(key) || null,
      put: (key, value) => cache.set(key, String(value)),
      remove: key => cache.delete(key)
    }) },
    LockService: { getScriptLock: () => ({
      waitLock: () => { lockWaits += 1; },
      releaseLock: () => { lockReleases += 1; }
    }) },
    SpreadsheetApp: {},
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
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
        const ymd = `${parts.year}-${parts.month}-${parts.day}`;
        if (format === 'u') {
          const calendarDay = new Date(`${ymd}T12:00:00Z`).getUTCDay();
          return String(calendarDay === 0 ? 7 : calendarDay);
        }
        if (format === 'yyyy-MM-dd') return ymd;
        if (format.includes("yyyy-MM-dd'T'HH:mm:ss")) return `${ymd}T${parts.hour}:${parts.minute}:${parts.second}-03:00`;
        if (format === 'dd/MM/yyyy HH:mm') return date.toISOString();
        return '20261020-120000';
      },
      parseDate(value) {
        return new Date(String(value).replace(' ', 'T') + '-03:00');
      },
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
  context.currentBusinessDate_ = () => new Date(options.now || '2026-10-20T15:00:00Z');

  function post(overrides = {}) {
    const payload = {
      action: 'createOrder', customerName: 'Cliente Ficticio', whatsapp: '(34) 99999-0000',
      date: '2026-10-25', time: '00:00', items: [{ flavor: 'Chocolate ficticio', quantity: 1 }],
      payment: 'PIX', notes: '', source: 'site', website: '',
      idempotencyKey: 'attempt-fictitious-00000001', ...overrides
    };
    const output = context.doPost({ postData: { contents: JSON.stringify(payload) }, parameter: {} });
    return JSON.parse(output.text);
  }
  return {
    context, rows, itemRows, cache, config, post,
    statuses: vm.runInContext('PF_ORDER.statuses.slice()', context),
    get lockWaits() { return lockWaits; }, get lockReleases() { return lockReleases; }
  };
}

function businessConfig(availability = {}) {
  return {
    flavors: ['Chocolate ficticio'],
    sizes: [{ id: 'p', name: 'Pequeno', description: 'Serve 8 pessoas', price: 89 }],
    payments: [{ id: 'pix', name: 'PIX', active: true }],
    progressivePricing: { firstSlicePrice: 19.97, additionalSlicePrice: 15 },
    availability: {
      enabled: true,
      days: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true },
      deliveryDay: 'sunday', paymentDeadlineDay: 'thursday', paymentDeadlineTime: '23:59:59',
      ...availability
    }
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('uma fatia usa o preco inicial configurado no servidor', () => {
  const h = createHarness();
  const result = h.post({ price: 0.01 });
  assert.equal(result.ok, true);
  assert.equal(result.order.price, 19.97);
  assert.equal(h.rows.length, 1);
});

test('duas fatias aplicam uma vez o preco adicional', () => {
  const h = createHarness();
  const result = h.post({ items: [{ flavor: 'Chocolate ficticio', quantity: 2 }] });
  assert.equal(result.order.total, 34.97);
  assert.equal(result.order.items[0].savings, 4.97);
});

test('quatro fatias calculam R$ 64,97 em centavos inteiros', () => {
  const h = createHarness();
  const result = h.post({ items: [{ flavor: 'Chocolate ficticio', quantity: 4 }] });
  assert.equal(result.order.total, 64.97);
  assert.equal(result.order.items[0].subtotalCents, 6497);
});

test('cinco fatias calculam R$ 79,97', () => {
  const result = createHarness().post({ items: [{ flavor: 'Chocolate ficticio', quantity: 5 }] });
  assert.equal(result.order.total, 79.97);
});

test('vinte fatias respeitam o limite por sabor', () => {
  const result = createHarness().post({ items: [{ flavor: 'Chocolate ficticio', quantity: 20 }] });
  assert.equal(result.order.total, 304.97);
  assert.equal(result.order.totalQuantity, 20);
});

test('dois sabores diferentes sao persistidos sob um unico pedido', () => {
  const config = businessConfig();
  config.flavors.push('Cenoura ficticia');
  const h = createHarness({ config });
  const result = h.post({ items: [
    { flavor: 'Chocolate ficticio', quantity: 2 },
    { flavor: 'Cenoura ficticia', quantity: 3 }
  ] });
  assert.equal(result.order.itemCount, 2);
  assert.equal(result.order.totalQuantity, 5);
  assert.equal(result.order.total, 84.94);
  assert.equal(h.rows.length, 1);
  assert.equal(h.itemRows.length, 2);
});

test('mesmo sabor adicionado novamente e agrupado antes do calculo', () => {
  const h = createHarness();
  const result = h.post({ items: [
    { flavor: 'Chocolate ficticio', quantity: 1 },
    { flavor: 'Chocolate ficticio', quantity: 2 }
  ] });
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].quantity, 3);
  assert.equal(result.order.total, 49.97);
});

test('preco e total adulterados pelo navegador sao ignorados', () => {
  const h = createHarness();
  const result = h.post({ items: [
    { flavor: 'Chocolate ficticio', quantity: 3, firstSlicePrice: 0.01, additionalSlicePrice: 0.01, subtotal: 0.03 }
  ], total: 0.03 });
  assert.equal(result.order.items[0].firstSlicePrice, 19.97);
  assert.equal(result.order.items[0].additionalSlicePrice, 15);
  assert.equal(result.order.total, 49.97);
});

test('economia e precos aplicados ficam rastreaveis em PedidoItens', () => {
  const h = createHarness();
  const result = h.post({ items: [{ flavor: 'Chocolate ficticio', quantity: 4 }] });
  assert.equal(result.order.items[0].savings, 14.91);
  assert.equal(h.itemRows[0][5], 4);
  assert.equal(h.itemRows[0][8], 19.97);
  assert.equal(h.itemRows[0][9], 15);
  assert.equal(h.itemRows[0][10], 14.91);
  assert.equal(h.itemRows[0][11], 'progressive-v1');
});

test('pedido sem itens e quantidades invalidas sao rejeitados', () => {
  assert.equal(createHarness().post({ items: [] }).code, 'ORDER_ITEMS_REQUIRED');
  assert.equal(createHarness().post({ items: [{ flavor: 'Chocolate ficticio', quantity: 0 }] }).code, 'INVALID_ITEM_QUANTITY');
  assert.equal(createHarness().post({ items: [{ flavor: 'Chocolate ficticio', quantity: -1 }] }).code, 'INVALID_ITEM_QUANTITY');
  assert.equal(createHarness().post({ items: [{ flavor: 'Chocolate ficticio', quantity: 1.5 }] }).code, 'INVALID_ITEM_QUANTITY');
  assert.equal(createHarness().post({ items: [{ flavor: 'Chocolate ficticio', quantity: 21 }] }).code, 'INVALID_ITEM_QUANTITY');
});

test('limite total de cinquenta fatias e validado no servidor', () => {
  const config = businessConfig();
  config.flavors.push('Cenoura ficticia', 'Ninho ficticio');
  const accepted = createHarness({ config }).post({ items: [
    { flavor: 'Chocolate ficticio', quantity: 20 }, { flavor: 'Cenoura ficticia', quantity: 20 }, { flavor: 'Ninho ficticio', quantity: 10 }
  ] });
  assert.equal(accepted.ok, true);
  const rejected = createHarness({ config }).post({ items: [
    { flavor: 'Chocolate ficticio', quantity: 20 }, { flavor: 'Cenoura ficticia', quantity: 20 }, { flavor: 'Ninho ficticio', quantity: 11 }
  ] });
  assert.equal(rejected.code, 'ORDER_QUANTITY_LIMIT');
});

test('falha ao persistir itens remove o cabecalho incompleto', () => {
  const h = createHarness({ failItemWrite: true });
  const result = h.post();
  assert.equal(result.code, 'ORDER_PERSISTENCE_FAILED');
  assert.equal(h.rows.length, 0);
  assert.equal(h.itemRows.length, 0);
});

test('nome ausente e tipo inesperado sao rejeitados', () => {
  assert.equal(createHarness().post({ customerName: '' }).code, 'REQUIRED_ORDER_FIELD');
  assert.equal(createHarness().post({ customerName: { injected: true } }).code, 'INVALID_ORDER_FIELD');
});

test('WhatsApp invalido e rejeitado', () => {
  assert.equal(createHarness().post({ whatsapp: '123' }).code, 'INVALID_WHATSAPP');
});

test('sabor inexistente e rejeitado', () => {
  assert.equal(createHarness().post({ items: [{ flavor: 'Sabor inventado', quantity: 1 }] }).code, 'INVALID_FLAVOR');
});

test('campo legado de tamanho nao interfere no preco progressivo', () => {
  const result = createHarness().post({ items: [{ flavor: 'Chocolate ficticio', sizeId: 'xx', quantity: 2 }] });
  assert.equal(result.ok, true);
  assert.equal(result.order.total, 34.97);
});

test('pagamento desativado e rejeitado', () => {
  assert.equal(createHarness().post({ payment: 'off' }).code, 'INVALID_PAYMENT');
});

test('horario invalido e rejeitado', () => {
  assert.equal(createHarness().post({ time: '25:90' }).code, 'INVALID_TIME');
});

test('observacoes excessivas e requisicao grande sao rejeitadas', () => {
  assert.equal(createHarness().post({ notes: 'x'.repeat(501) }).code, 'ORDER_FIELD_TOO_LONG');
  assert.equal(createHarness().post({ ignored: 'x'.repeat(17 * 1024) }).code, 'REQUEST_TOO_LARGE');
});

test('formula e neutralizada na planilha e preservada na resposta', () => {
  const h = createHarness();
  const result = h.post({ customerName: '=IMPORTXML("x")', notes: '+SUM(1,1)' });
  assert.equal(result.ok, true);
  assert.equal(h.rows[0][2], "'=IMPORTXML(\"x\")");
  assert.equal(h.rows[0][12], "'+SUM(1,1)");
  assert.equal(result.order.customerName, '=IMPORTXML("x")');
  assert.equal(result.order.notes, '+SUM(1,1)');
});

test('mesma chave de idempotencia retorna o pedido original sem nova linha', () => {
  const h = createHarness();
  const first = h.post();
  const second = h.post();
  assert.equal(first.orderId, second.orderId);
  assert.equal(second.duplicate, true);
  assert.equal(second.order.customerName, 'Cliente Ficticio');
  assert.equal(h.rows.length, 1);
  assert.equal(h.itemRows.length, 1);
});

test('reutilizacao da chave com payload diferente e rejeitada', () => {
  const h = createHarness();
  assert.equal(h.post().ok, true);
  const retry = h.post({ customerName: 'Payload alterado' });
  assert.equal(retry.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(h.rows.length, 1);
  assert.equal(h.itemRows.length, 1);
});

test('pedido sem chave de idempotencia e rejeitado sem gravacao', () => {
  const h = createHarness();
  assert.equal(h.post({ idempotencyKey: '' }).code, 'REQUIRED_ORDER_FIELD');
  assert.equal(h.rows.length, 0);
});

test('duas requisicoes serializadas pelo lock geram somente uma linha', async () => {
  const h = createHarness();
  const [first, second] = await Promise.all([
    Promise.resolve().then(() => h.post()),
    Promise.resolve().then(() => h.post())
  ]);
  assert.equal(first.orderId, second.orderId);
  assert.equal(h.rows.length, 1);
  assert.equal(h.lockWaits, 2);
  assert.equal(h.lockReleases, 2);
});

test('reenvio idempotente recupera pedido mesmo depois do fechamento da janela', () => {
  const h = createHarness({ now: '2026-10-23T02:58:00Z', config: businessConfig() });
  const first = h.post();
  h.context.currentBusinessDate_ = () => new Date('2026-10-23T03:00:00Z');
  const retry = h.post();
  assert.equal(first.orderId, retry.orderId);
  assert.equal(retry.duplicate, true);
  assert.equal(h.rows.length, 1);
});

test('reenvio idempotente recupera pedido apos mudanca no catalogo', () => {
  const config = businessConfig();
  const h = createHarness({ config });
  const first = h.post();
  config.flavors = [];
  config.payments[0].active = false;
  const retry = h.post();
  assert.equal(retry.ok, true);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.orderId, first.orderId);
  assert.equal(h.rows.length, 1);
});

test('pedidos legados permanecem legiveis e nao sao modificados', () => {
  const legacy = ['PF-20250101-120000-ABC123', new Date('2025-01-01T12:00:00Z'), 'Cliente Antigo', '(34) 99999-1111', new Date('2025-01-05T12:00:00Z'), '00:00', 'Chocolate ficticio', 'p', 'Pequeno', 'Serve 8 pessoas', 89, 'PIX', '', 'Concluido', 'site'];
  const h = createHarness({ rows: [legacy] });
  const result = h.post();
  assert.equal(result.ok, true);
  assert.deepEqual(h.rows[0], legacy);
  assert.equal(h.rows.length, 2);
  const listed = h.context.getOrders_();
  assert.ok(listed.some(order => order.id === legacy[0]));
});

test('entrega respeita o dia configurado e coincide com resposta e planilha', () => {
  const h = createHarness({
    now: '2026-10-19T15:00:00Z',
    config: businessConfig({ deliveryDay: 'wednesday', paymentDeadlineDay: 'tuesday' })
  });
  const result = h.post();
  assert.equal(result.ok, true);
  assert.equal(result.order.deliveryDate, '2026-10-21');
  assert.equal(h.context.Utilities.formatDate(h.rows[0][4], 'America/Sao_Paulo', 'yyyy-MM-dd'), result.order.deliveryDate);
});

test('entrega atravessa corretamente semana e mes', () => {
  const week = createHarness({
    now: '2026-10-23T15:00:00Z',
    config: businessConfig({ deliveryDay: 'monday', paymentDeadlineDay: 'sunday' })
  });
  assert.equal(week.post().order.deliveryDate, '2026-10-26');

  const month = createHarness({
    now: '2026-10-30T15:00:00Z',
    config: businessConfig({ deliveryDay: 'sunday', paymentDeadlineDay: 'saturday' })
  });
  assert.equal(month.post().order.deliveryDate, '2026-11-01');
});

test('dia nao autorizado e rejeitado pelo servidor', () => {
  const days = { monday: true, tuesday: false, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true };
  const h = createHarness({ config: businessConfig({ days }) });
  assert.equal(h.post().code, 'ORDERS_CLOSED_DAY');
  assert.equal(h.rows.length, 0);
});

test('pedido antes do horario limite e aceito', () => {
  const h = createHarness({ now: '2026-10-23T02:58:00Z', config: businessConfig() });
  assert.equal(h.post().ok, true);
});

test('pedido depois do horario limite e rejeitado', () => {
  const h = createHarness({ now: '2026-10-23T03:00:00Z', config: businessConfig() });
  assert.equal(h.post().code, 'ORDER_DEADLINE_CLOSED');
  assert.equal(h.rows.length, 0);
});

test('dia corrente e calculado no timezone de Sao Paulo', () => {
  const days = { monday: false, tuesday: false, wednesday: true, thursday: false, friday: false, saturday: false, sunday: false };
  const h = createHarness({
    now: '2026-10-22T02:30:00Z',
    config: businessConfig({ days, paymentDeadlineDay: 'wednesday', paymentDeadlineTime: '23:59:59' })
  });
  const window = h.context.getOrderWindow_(h.config, h.context.currentBusinessDate_());
  assert.equal(window.currentDay, 'wednesday');
  assert.equal(h.post().ok, true);
});

test('status canonicos sao aceitos pelo servidor', () => {
  const row = ['PF-STATUS-1', new Date(), 'Cliente', '34999990000', new Date(), '00:00', 'Chocolate ficticio', 'p', 'Pequeno', '', 89, 'PIX', '', 'Aguardando pagamento', 'site'];
  const h = createHarness({ rows: [row] });
  for (const status of h.statuses) {
    assert.equal(h.context.updateOrderStatus_('PF-STATUS-1', status).status, status);
  }
});

test('status legado e preservado, mas nao pode ser atribuido novamente', () => {
  for (const legacyStatus of ['Novo', 'Pagamento não confirmado']) {
    const row = ['PF-LEGACY-1', new Date(), 'Cliente', '34999990000', new Date(), '00:00', 'Chocolate ficticio', 'p', 'Pequeno', '', 89, 'PIX', '', legacyStatus, 'site'];
    const h = createHarness({ rows: [row] });
    assert.equal(h.context.getOrders_()[0].status, legacyStatus);
    assert.throws(() => h.context.updateOrderStatus_('PF-LEGACY-1', legacyStatus), /Status inválido/);
    assert.equal(h.rows[0][13], legacyStatus);
  }
});

test('configuracao comercial rejeita dia e horario invalidos', () => {
  const h = createHarness();
  assert.throws(() => h.context.validateBusinessConfig_({
    deliveryDay: 'feriado', paymentDeadlineDay: 'thursday', paymentDeadlineTime: '23:59:59'
  }), error => error.code === 'INVALID_DELIVERY_DAY');
  assert.throws(() => h.context.validateBusinessConfig_({
    deliveryDay: 'sunday', paymentDeadlineDay: 'thursday', paymentDeadlineTime: '25:00'
  }), error => error.code === 'INVALID_DEADLINE_TIME');
});

test('honeypot reduz automacao simples sem criar pedido', () => {
  const h = createHarness();
  assert.equal(h.post({ website: 'https://spam.invalid' }).code, 'INVALID_ORDER');
  assert.equal(h.rows.length, 0);
});

test('limite temporario reduz abuso sem gravar novo pedido', () => {
  const h = createHarness();
  h.cache.set('order-attempts:global', '80');
  assert.equal(h.post().code, 'ORDER_RATE_LIMIT');
  assert.equal(h.rows.length, 0);
});

// ---- Etapa 9: entrega e retirada ----

function fulfillmentConfig(fulfillment = {}) {
  return {
    ...businessConfig(),
    fulfillment: {
      pickupEnabled: true, deliveryEnabled: true, deliveryFeeCents: 800,
      pickupAddress: 'Endereço comercial fictício, 100', pickupInstructions: 'Retire das 9h às 12h.',
      deliveryInstructions: 'Entregas a partir das 14h.', ...fulfillment
    }
  };
}

const fictitiousAddress = (overrides = {}) => ({
  cep: '38400-000', street: 'Rua Fictícia das Flores', number: '123', complement: 'Apto 4',
  neighborhood: 'Bairro Teste', city: 'Cidade Exemplo', state: 'mg', reference: 'Portão azul', ...overrides
});

const deliveryPost = (h, overrides = {}) => h.post({ fulfillment: { mode: 'delivery', address: fictitiousAddress() }, ...overrides });

test('entrega com endereco completo soma taxa em centavos e persiste colunas novas', () => {
  const h = createHarness({ config: fulfillmentConfig() });
  const result = deliveryPost(h);
  assert.equal(result.ok, true);
  const row = h.rows[0];
  assert.equal(row.length, 31);
  assert.equal(row[10], 27.97);
  assert.deepEqual([...row.slice(18, 31)], ['delivery', '38400000', 'Rua Fictícia das Flores', '123', 'Apto 4', 'Bairro Teste', 'Cidade Exemplo', 'MG', 'Portão azul', 1997, 800, 2797, 'Entregas a partir das 14h.']);
  assert.equal(result.order.subtotal, 19.97);
  assert.equal(result.order.deliveryFee, 8);
  assert.equal(result.order.total, 27.97);
  assert.equal(result.order.fulfillment.mode, 'delivery');
  assert.equal(result.order.fulfillment.address.street, 'Rua Fictícia das Flores');
});

test('retirada nao grava endereco nem taxa e registra orientacoes da loja', () => {
  const h = createHarness({ config: fulfillmentConfig() });
  const result = h.post({ fulfillment: { mode: 'pickup', address: fictitiousAddress() } });
  assert.equal(result.ok, true);
  const row = h.rows[0];
  assert.equal(row[18], 'pickup');
  assert.deepEqual([...row.slice(19, 27)], ['', '', '', '', '', '', '', '']);
  assert.deepEqual([...row.slice(27, 30)], [1997, 0, 1997]);
  assert.equal(row[30], 'Endereço comercial fictício, 100 — Retire das 9h às 12h.');
  assert.equal(result.order.fulfillment.address, null);
  assert.equal(result.order.total, 19.97);
});

test('campos obrigatorios do endereco sao validados no servidor', () => {
  for (const field of ['cep', 'street', 'number', 'neighborhood', 'city', 'state']) {
    const h = createHarness({ config: fulfillmentConfig() });
    const result = h.post({ fulfillment: { mode: 'delivery', address: fictitiousAddress({ [field]: '' }) } });
    assert.equal(result.ok, false, `campo ${field}`);
    assert.equal(h.rows.length, 0);
  }
  const missing = createHarness({ config: fulfillmentConfig() });
  assert.equal(missing.post({ fulfillment: { mode: 'delivery' } }).code, 'DELIVERY_ADDRESS_REQUIRED');
  assert.equal(missing.post({ fulfillment: { mode: 'drone' } }).code, 'INVALID_FULFILLMENT');
});

test('CEP e UF invalidos sao rejeitados', () => {
  const h = createHarness({ config: fulfillmentConfig() });
  assert.equal(h.post({ fulfillment: { mode: 'delivery', address: fictitiousAddress({ cep: '3840-00' }) } }).code, 'INVALID_CEP');
  assert.equal(h.post({ fulfillment: { mode: 'delivery', address: fictitiousAddress({ cep: '38400-00a' }) } }).code, 'INVALID_CEP');
  assert.equal(h.post({ fulfillment: { mode: 'delivery', address: fictitiousAddress({ state: 'XX' }) } }).code, 'INVALID_STATE');
  assert.equal(h.rows.length, 0);
});

test('taxa e total enviados pelo navegador sao ignorados', () => {
  const h = createHarness({ config: fulfillmentConfig() });
  const result = h.post({ total: 1, price: 1, deliveryFee: 0, fulfillment: { mode: 'delivery', deliveryFee: 0, deliveryFeeCents: 0, address: fictitiousAddress() } });
  assert.equal(result.ok, true);
  assert.equal(h.rows[0][28], 800);
  assert.equal(h.rows[0][29], 2797);
});

test('modalidade desabilitada ou sem taxa definida e recusada', () => {
  const disabled = createHarness({ config: fulfillmentConfig({ deliveryEnabled: false }) });
  assert.equal(deliveryPost(disabled).code, 'FULFILLMENT_UNAVAILABLE');
  const withoutFee = createHarness({ config: fulfillmentConfig({ deliveryFeeCents: null }) });
  assert.equal(deliveryPost(withoutFee).code, 'FULFILLMENT_UNAVAILABLE');
  const noPickup = createHarness({ config: fulfillmentConfig({ pickupEnabled: false }) });
  assert.equal(noPickup.post({ fulfillment: { mode: 'pickup' } }).code, 'FULFILLMENT_UNAVAILABLE');
  assert.equal(noPickup.post().code, 'FULFILLMENT_REQUIRED');
  assert.equal(disabled.rows.length + withoutFee.rows.length + noPickup.rows.length, 0);
});

test('entrega gratuita so existe com taxa zero explicita', () => {
  const h = createHarness({ config: fulfillmentConfig({ deliveryFeeCents: 0 }) });
  const result = deliveryPost(h);
  assert.equal(result.ok, true);
  assert.equal(h.rows[0][28], 0);
});

test('idempotencia considera modalidade e endereco sem recalcular pedido existente', () => {
  const settings = fulfillmentConfig();
  const h = createHarness({ config: settings });
  const first = deliveryPost(h);
  settings.fulfillment.deliveryFeeCents = 1500;
  const retry = deliveryPost(h);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.order.total, 27.97, 'reenvio devolve o valor original');
  assert.equal(h.rows.length, 1);
  assert.equal(h.post({ fulfillment: { mode: 'delivery', address: fictitiousAddress({ number: '999' }) } }).code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(h.post({ fulfillment: { mode: 'pickup' } }).code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(first.orderId, retry.orderId);
});

test('pedido sem modalidade (versao anterior do site) mantem assinatura e valor', () => {
  const h = createHarness({ config: fulfillmentConfig() });
  const first = h.post();
  const retry = h.post();
  assert.equal(first.ok, true);
  assert.equal(retry.duplicate, true);
  assert.equal(h.rows[0][18], '');
  assert.equal(h.rows[0][10], 19.97);
  assert.equal(first.order.fulfillment.mode, '');
});

test('pedido antigo sem colunas novas continua legivel', () => {
  const legacy = ['PF-20250101-120000-ABC123', new Date('2025-01-01T12:00:00Z'), 'Cliente Antigo', '(34) 99999-1111', new Date('2025-01-05T12:00:00Z'), '00:00', 'Chocolate ficticio', 'p', 'Pequeno', 'Serve 8 pessoas', 89, 'PIX', '', 'Concluido', 'site'];
  const h = createHarness({ rows: [legacy] });
  const order = h.context.getOrders_()[0];
  assert.equal(order.total, 89);
  assert.equal(order.subtotal, 89);
  assert.equal(order.deliveryFee, 0);
  assert.equal(order.fulfillment.mode, '');
  assert.equal(order.fulfillment.address, null);
  assert.equal(h.rows[0].length, legacy.length);
});

test('endereco com formula e neutralizado na planilha e limites sao aplicados', () => {
  const h = createHarness({ config: fulfillmentConfig() });
  const result = h.post({ fulfillment: { mode: 'delivery', address: fictitiousAddress({ street: '=HYPERLINK("https://evil.example")', reference: '+cmd' }) } });
  assert.equal(result.ok, true);
  assert.equal(h.rows[0][20], "'=HYPERLINK(\"https://evil.example\")");
  assert.equal(h.rows[0][26], "'+cmd");
  assert.equal(result.order.fulfillment.address.street, '=HYPERLINK("https://evil.example")');
  const long = createHarness({ config: fulfillmentConfig() });
  assert.equal(long.post({ fulfillment: { mode: 'delivery', address: fictitiousAddress({ street: 'x'.repeat(121) }) } }).code, 'ORDER_FIELD_TOO_LONG');
  assert.equal(long.post({ fulfillment: { mode: 'delivery', address: fictitiousAddress({ number: 12 }) } }).code, 'INVALID_ORDER_FIELD');
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${name}`);
      console.error(error.stack || error);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} testes aprovados`);
  if (failed) process.exitCode = 1;
})();
