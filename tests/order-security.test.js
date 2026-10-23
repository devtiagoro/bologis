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
  const sheet = makeSheet(rows, 18);
  const itemSheet = makeSheet(itemRows, 8, true);
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
      date: '2026-10-25', time: '00:00', items: [{ flavor: 'Chocolate ficticio', sizeId: 'p', quantity: 1 }],
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

test('pedido valido e publico usa preco do catalogo no servidor', () => {
  const h = createHarness();
  const result = h.post({ price: 0.01 });
  assert.equal(result.ok, true);
  assert.equal(result.order.price, 89);
  assert.equal(h.rows.length, 1);
});

test('um item com quantidade maior calcula subtotal e quantidade total', () => {
  const h = createHarness();
  const result = h.post({ items: [{ flavor: 'Chocolate ficticio', sizeId: 'p', quantity: 3 }] });
  assert.equal(result.order.total, 267);
  assert.equal(result.order.totalQuantity, 3);
  assert.equal(result.order.items[0].subtotal, 267);
  assert.equal(h.itemRows[0][5], 3);
});

test('dois sabores diferentes sao persistidos sob um unico pedido', () => {
  const config = businessConfig();
  config.flavors.push('Cenoura ficticia');
  const h = createHarness({ config });
  const result = h.post({ items: [
    { flavor: 'Chocolate ficticio', sizeId: 'p', quantity: 1 },
    { flavor: 'Cenoura ficticia', sizeId: 'p', quantity: 2 }
  ] });
  assert.equal(result.order.itemCount, 2);
  assert.equal(result.order.totalQuantity, 3);
  assert.equal(h.rows.length, 1);
  assert.equal(h.itemRows.length, 2);
});

test('mesmo sabor com tamanhos diferentes usa os precos corretos', () => {
  const config = businessConfig();
  config.sizes.push({ id: 'g', name: 'Grande', description: 'Serve 20 pessoas', price: 179 });
  const h = createHarness({ config });
  const result = h.post({ items: [
    { flavor: 'Chocolate ficticio', sizeId: 'p', quantity: 1 },
    { flavor: 'Chocolate ficticio', sizeId: 'g', quantity: 2 }
  ] });
  assert.equal(result.order.total, 447);
  assert.deepEqual(Array.from(result.order.items, item => item.subtotal), [89, 358]);
});

test('itens repetidos sao agrupados e o preco enviado pelo cliente e ignorado', () => {
  const h = createHarness();
  const result = h.post({ items: [
    { flavor: 'Chocolate ficticio', sizeId: 'p', quantity: 1, unitPrice: 0.01 },
    { flavor: 'Chocolate ficticio', sizeId: 'p', quantity: 2, subtotal: 0.03 }
  ], total: 0.03 });
  assert.equal(result.order.items.length, 1);
  assert.equal(result.order.items[0].quantity, 3);
  assert.equal(result.order.items[0].unitPrice, 89);
  assert.equal(result.order.total, 267);
});

test('pedido sem itens e quantidades invalidas sao rejeitados', () => {
  assert.equal(createHarness().post({ items: [] }).code, 'ORDER_ITEMS_REQUIRED');
  assert.equal(createHarness().post({ items: [{ flavor: 'Chocolate ficticio', sizeId: 'p', quantity: 0 }] }).code, 'INVALID_ITEM_QUANTITY');
  assert.equal(createHarness().post({ items: [{ flavor: 'Chocolate ficticio', sizeId: 'p', quantity: 1.5 }] }).code, 'INVALID_ITEM_QUANTITY');
  assert.equal(createHarness().post({ items: [{ flavor: 'Chocolate ficticio', sizeId: 'p', quantity: 21 }] }).code, 'INVALID_ITEM_QUANTITY');
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
  assert.equal(createHarness().post({ items: [{ flavor: 'Sabor inventado', sizeId: 'p', quantity: 1 }] }).code, 'INVALID_FLAVOR');
});

test('tamanho invalido e rejeitado', () => {
  assert.equal(createHarness().post({ items: [{ flavor: 'Chocolate ficticio', sizeId: 'xx', quantity: 1 }] }).code, 'INVALID_SIZE');
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
