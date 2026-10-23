const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'code.gs'), 'utf8');
function copy(value) { return value.map(row => row.slice()); }
function bytes(value) { return Array.from(Buffer.from(value)); }

class FakeSheet {
  constructor(name, data, failures) {
    this.name = name;
    this.data = copy(data || []);
    this.hidden = false;
    this.failures = failures;
  }
  getLastRow() { return this.data.length; }
  getLastColumn() { return Math.max(1, ...this.data.map(row => row.length)); }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), this.getLastColumn()); }
  getRange(row, column, rowCount = 1, columnCount = 1) {
    const sheet = this;
    return {
      getValues() {
        return Array.from({ length: rowCount }, (_, y) =>
          Array.from({ length: columnCount }, (_, x) => sheet.data[row - 1 + y]?.[column - 1 + x] ?? '')
        );
      },
      setValues(values) {
        sheet.maybeFail();
        values.forEach((sourceRow, y) => {
          const targetRow = row - 1 + y;
          if (!sheet.data[targetRow]) sheet.data[targetRow] = [];
          sourceRow.forEach((value, x) => { sheet.data[targetRow][column - 1 + x] = value; });
        });
      },
      clearContent() {
        for (let y = 0; y < rowCount; y += 1) {
          for (let x = 0; x < columnCount; x += 1) {
            if (sheet.data[row - 1 + y]) sheet.data[row - 1 + y][column - 1 + x] = '';
          }
        }
        while (sheet.data.length && sheet.data.at(-1).every(value => value === '')) sheet.data.pop();
      },
      setValue(value) {
        sheet.maybeFail();
        if (!sheet.data[row - 1]) sheet.data[row - 1] = [];
        sheet.data[row - 1][column - 1] = value;
      }
    };
  }
  maybeFail() {
    const remaining = Number(this.failures[this.name] || 0);
    if (remaining > 0) {
      this.failures[this.name] = remaining - 1;
      throw new Error(`Falha ficticia em ${this.name}`);
    }
  }
  appendRow(row) { this.maybeFail(); this.data.push(row.slice()); }
  deleteRows(start, count) { this.data.splice(start - 1, count); }
  hideSheet() { this.hidden = true; }
}

function createHarness() {
  const failures = {};
  const properties = new Map([['CONFIG_REVISION', '1']]);
  const sheets = new Map();
  const initial = {
    Configuracoes: [
      ['Chave', 'Valor'], ['brandName', 'Marca Antiga'], ['heroTitle', 'Título antigo'],
      ['heroSubtitle', 'Sub antigo'], ['description', 'Descrição antiga'], ['ordersEnabled', true],
      ['deliveryDay', 'sunday'], ['paymentDeadlineDay', 'thursday'], ['paymentDeadlineTime', '23:59:59']
    ],
    Sabores: [['ID', 'Nome', 'Ativo', 'Ordem'], ['chocolate', 'Chocolate', true, 1], ['ninho', 'Ninho', true, 2]],
    Tamanhos: [['ID', 'Nome', 'Descrição', 'Preço', 'Ativo', 'Ordem'], ['p', 'Pequeno', 'Serve 8', 89, true, 1], ['m', 'Médio', 'Serve 15', 129, true, 2]],
    Pagamentos: [['ID', 'Nome', 'Tipo', 'Descrição', 'Link/Payload', 'Ativo', 'Ordem'], ['pix', 'PIX', 'pix', 'Pagamento PIX', 'https://pay.example/pix', true, 1]],
    Disponibilidade: [
      ['Dia', 'Código', 'Aberto', 'Ordem'], ['Segunda-feira', 'monday', true, 1], ['Terça-feira', 'tuesday', true, 2],
      ['Quarta-feira', 'wednesday', true, 3], ['Quinta-feira', 'thursday', true, 4], ['Sexta-feira', 'friday', false, 5],
      ['Sábado', 'saturday', false, 6], ['Domingo', 'sunday', false, 7]
    ]
  };
  Object.entries(initial).forEach(([name, data]) => sheets.set(name, new FakeSheet(name, data, failures)));
  const spreadsheet = {
    getSheetByName: name => sheets.get(name) || null,
    insertSheet(name) { const sheet = new FakeSheet(name, [], failures); sheets.set(name, sheet); return sheet; },
    getUrl: () => 'https://docs.google.com/spreadsheets/d/FICTICIO',
    getSpreadsheetTimeZone: () => 'America/Sao_Paulo'
  };
  let waits = 0;
  let releases = 0;
  let uuid = 0;
  const context = {
    Date, JSON, Math, String, Number, Object, Array, Error, RegExp, URL, isFinite, isNaN,
    console: { log() {}, error() {}, warn() {} },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key) || null,
      setProperty: (key, value) => properties.set(key, String(value)),
      deleteProperty: key => properties.delete(key),
      setProperties: values => Object.entries(values).forEach(([key, value]) => properties.set(key, String(value)))
    }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { waits += 1; }, releaseLock: () => { releases += 1; } }) },
    SpreadsheetApp: { openById: () => spreadsheet, flush() {} },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      getUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
      computeDigest: (_algorithm, value) => bytes(crypto.createHash('sha256').update(String(value)).digest()),
      computeHmacSha256Signature: (value, key) => bytes(crypto.createHmac('sha256', String(key)).update(String(value)).digest()),
      base64EncodeWebSafe: value => Buffer.from(value).toString('base64url'),
      base64DecodeWebSafe: value => bytes(Buffer.from(value, 'base64url')),
      newBlob: value => { const buffer = Array.isArray(value) ? Buffer.from(value) : Buffer.from(String(value)); return { getBytes: () => bytes(buffer), getDataAsString: () => buffer.toString('utf8') }; },
      formatDate: (_date, _tz, format) => format === 'u' ? '2' : format === 'yyyy-MM-dd' ? '2026-10-20' : format.includes("yyyy-MM-dd'T'") ? '2026-10-20T12:00:00-03:00' : '20261020-120000',
      parseDate: value => new Date(String(value).replace(' ', 'T') + '-03:00'), sleep() {}
    },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'code.gs' });
  context.getSpreadsheet_ = () => spreadsheet;
  return {
    context, sheets, failures, properties, spreadsheet,
    get waits() { return waits; }, get releases() { return releases; },
    rows: name => copy(sheets.get(name).data),
    config: () => context.getConfig_()
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('salvamento valido usa lock, cria backup e incrementa revisao', () => {
  const h = createHarness();
  const result = h.context.saveConfigDomain_('brand', { brandName: 'Marca Nova', heroTitle: 'Novo', heroSubtitle: '', description: '' }, '1');
  assert.equal(result.revision, '2');
  assert.equal(result.config.brandName, 'Marca Nova');
  assert.equal(h.waits, 1);
  assert.equal(h.releases, 1);
  const backup = h.sheets.get('_ConfigBackups');
  assert.equal(backup.hidden, true);
  assert.equal(backup.data[1][5], 'committed');
});

test('precos progressivos usam revisao backup e persistencia no dominio proprio', () => {
  const h = createHarness();
  const result = h.context.saveConfigDomain_('pricing', {
    progressivePricing: { firstSlicePrice: 19.97, additionalSlicePrice: 15 }
  }, '1');
  assert.equal(result.revision, '2');
  assert.equal(result.config.progressivePricing.firstSlicePrice, 19.97);
  assert.equal(result.config.progressivePricing.additionalSlicePrice, 15);
  assert.equal(h.sheets.get('_ConfigBackups').data[1][3], 'pricing');
  assert.equal(h.sheets.get('_ConfigBackups').data[1][5], 'committed');
});

test('preco progressivo invalido restaura configuracao e revisao', () => {
  const h = createHarness();
  assert.throws(() => h.context.saveConfigDomain_('pricing', {
    progressivePricing: { firstSlicePrice: 10, additionalSlicePrice: 15 }
  }, '1'), error => error.code === 'INVALID_PROGRESSIVE_PRICE');
  assert.equal(h.context.getConfigRevision_(), '1');
  assert.equal(h.config().progressivePricing.firstSlicePrice, 19.97);
});

test('configuracao publica expoe somente precos necessarios ao formulario', () => {
  const h = createHarness();
  const publicConfig = h.context.getPublicConfig_();
  assert.deepEqual(JSON.parse(JSON.stringify(publicConfig.progressivePricing)), {
    firstSlicePrice: 19.97,
    additionalSlicePrice: 15
  });
  assert.equal(Object.hasOwn(publicConfig, 'sizes'), false);
  assert.equal(Object.hasOwn(publicConfig.payments[0], 'paymentLink'), false);
});

test('revisao desatualizada nao sobrescreve salvamento recente', () => {
  const h = createHarness();
  h.context.saveConfigDomain_('brand', { brandName: 'Primeiro', heroTitle: 'Primeiro', heroSubtitle: '', description: '' }, '1');
  assert.throws(
    () => h.context.saveConfigDomain_('brand', { brandName: 'Segundo', heroTitle: 'Segundo' }, '1'),
    error => error.code === 'CONFIG_CONFLICT' && error.currentRevision === '2'
  );
  assert.equal(h.config().brandName, 'Primeiro');
});

test('dois salvamentos concorrentes resultam em um commit e um conflito', async () => {
  const h = createHarness();
  const attempts = await Promise.allSettled([
    Promise.resolve().then(() => h.context.saveConfigDomain_('brand', { brandName: 'Sessão A', heroTitle: 'A' }, '1')),
    Promise.resolve().then(() => h.context.saveConfigDomain_('brand', { brandName: 'Sessão B', heroTitle: 'B' }, '1'))
  ]);
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(item => item.status === 'rejected' && item.reason.code === 'CONFIG_CONFLICT').length, 1);
  assert.equal(h.properties.get('CONFIG_REVISION'), '2');
  assert.equal(h.waits, 2);
  assert.equal(h.releases, 2);
});

test('snapshot anterior contem configuracao completa e pagamentos', () => {
  const h = createHarness();
  h.context.saveConfigDomain_('brand', { brandName: 'Nova', heroTitle: 'Nova', heroSubtitle: '', description: '' }, '1');
  const snapshot = JSON.parse(h.sheets.get('_ConfigBackups').data[1][4]);
  assert.equal(snapshot.sheets.Configuracoes[1][1], 'Marca Antiga');
  assert.equal(snapshot.sheets.Pagamentos[1][4], 'https://pay.example/pix');
});

test('snapshot grande e dividido em blocos recuperaveis', () => {
  const h = createHarness();
  const descriptionRow = h.sheets.get('Configuracoes').data.find(row => row[0] === 'description');
  descriptionRow[1] = 'x'.repeat(90000);
  const saved = h.context.saveConfigDomain_('brand', { brandName: 'Nova', heroTitle: 'Nova', heroSubtitle: '', description: 'curta' }, '1');
  const rows = h.sheets.get('_ConfigBackups').data.slice(1).filter(row => row[0] === saved.backupId);
  assert.ok(rows.length >= 3);
  const snapshot = JSON.parse(rows.sort((a, b) => a[6] - b[6]).map(row => row[4]).join(''));
  assert.equal(snapshot.sheets.Configuracoes.find(row => row[0] === 'description')[1].length, 90000);
});

test('snapshot persistido preserva valores Date ao restaurar', () => {
  const h = createHarness();
  const deadlineRow = h.sheets.get('Configuracoes').data.find(row => row[0] === 'paymentDeadlineTime');
  const originalDate = new Date('2026-10-20T23:59:59.000Z');
  deadlineRow[1] = originalDate;
  const saved = h.context.saveConfigDomain_('brand', { brandName: 'Nova', heroTitle: 'Nova', heroSubtitle: '', description: '' }, '1');
  h.sheets.get('Configuracoes').data.find(row => row[0] === 'paymentDeadlineTime')[1] = '10:00:00';
  h.context.restoreConfigBackup_(saved.backupId, '2');
  const restored = h.sheets.get('Configuracoes').data.find(row => row[0] === 'paymentDeadlineTime')[1];
  assert.equal(restored instanceof Date, true);
  assert.equal(restored.toISOString(), originalDate.toISOString());
});

test('textos administrativos sao neutralizados sem alterar leitura legitima', () => {
  const h = createHarness();
  const result = h.context.saveConfigDomain_('brand', {
    brandName: '=IMPORTXML("https://invalid.example")',
    heroTitle: '+SUM(1,1)',
    heroSubtitle: '@comando',
    description: '-1+2'
  }, '1');
  const rows = h.sheets.get('Configuracoes').data;
  assert.equal(rows.find(row => row[0] === 'brandName')[1].startsWith("'="), true);
  assert.equal(rows.find(row => row[0] === 'heroTitle')[1].startsWith("'+"), true);
  assert.equal(result.config.brandName, '=IMPORTXML("https://invalid.example")');
  assert.equal(result.config.heroTitle, '+SUM(1,1)');
});

test('preco administrativo invalido e rejeitado e configuracao e restaurada', () => {
  const h = createHarness();
  const before = h.rows('Tamanhos');
  assert.throws(() => h.context.saveConfigDomain_('sizes', {
    sizes: [{ id: 'p', name: 'Pequeno', description: 'Serve 8', price: 'nao numerico', active: true }]
  }, '1'), error => error.code === 'INVALID_SIZE_PRICE');
  assert.deepEqual(h.rows('Tamanhos'), before);
  assert.equal(h.properties.get('CONFIG_REVISION'), '1');
});

test('falha parcial restaura todas as abas e mantem revisao', () => {
  const h = createHarness();
  const beforeConfig = h.rows('Configuracoes');
  const beforeAvailability = h.rows('Disponibilidade');
  h.failures.Disponibilidade = 1;
  assert.throws(() => h.context.saveConfigDomain_('availability', {
    availability: { enabled: false, days: {}, deliveryDay: 'monday', paymentDeadlineDay: 'sunday', paymentDeadlineTime: '20:00:00' }
  }, '1'), error => error.code === 'CONFIG_SAVE_FAILED');
  assert.deepEqual(h.rows('Configuracoes'), beforeConfig);
  assert.deepEqual(h.rows('Disponibilidade'), beforeAvailability);
  assert.equal(h.properties.get('CONFIG_REVISION'), '1');
  assert.equal(h.sheets.get('_ConfigBackups').data[1][5], 'recovered');
});

test('falha tambem na recuperacao e informada sem alegar atomicidade', () => {
  const h = createHarness();
  h.failures.Disponibilidade = 2;
  assert.throws(() => h.context.saveConfigDomain_('availability', {
    availability: { enabled: false, days: {}, deliveryDay: 'monday', paymentDeadlineDay: 'sunday', paymentDeadlineTime: '20:00:00' }
  }, '1'), error => error.code === 'CONFIG_RECOVERY_FAILED');
  assert.equal(h.properties.get('CONFIG_REVISION'), '1');
  assert.ok(h.properties.get('CONFIG_RECOVERY_REQUIRED'));
  assert.throws(
    () => h.context.saveConfigDomain_('brand', { brandName: 'Bloqueado' }, '1'),
    error => error.code === 'CONFIG_RECOVERY_REQUIRED'
  );
});

test('link de pagamento existente e preservado quando omitido', () => {
  const h = createHarness();
  const result = h.context.saveConfigDomain_('payments', { payments: [{ id: 'pix', name: 'PIX', type: 'pix', description: 'Atualizado', active: true }] }, '1');
  assert.equal(result.config.payments[0].paymentLink, 'https://pay.example/pix');
});

test('sabor pode ser desativado e reativado sem alterar ID', () => {
  const h = createHarness();
  let result = h.context.saveConfigDomain_('flavors', { flavorItems: [{ id: 'chocolate', name: 'Chocolate', active: false }] }, '1');
  assert.equal(result.config.flavorItems.find(item => item.id === 'chocolate').active, false);
  assert.equal(result.config.flavors.includes('Chocolate'), false);
  assert.equal(h.context.getPublicConfig_().flavors.includes('Chocolate'), false);
  result = h.context.saveConfigDomain_('flavors', { flavorItems: [{ id: 'chocolate', name: 'Chocolate', active: true }] }, '2');
  assert.equal(result.config.flavorItems.find(item => item.id === 'chocolate').active, true);
});

test('tamanho pode ser desativado e reativado sem alterar ID', () => {
  const h = createHarness();
  let result = h.context.saveConfigDomain_('sizes', { sizes: [{ id: 'p', name: 'Pequeno', description: 'Serve 8', price: 89, active: false }] }, '1');
  assert.equal(result.config.sizes.find(item => item.id === 'p').active, false);
  assert.equal(Object.hasOwn(h.context.getPublicConfig_(), 'sizes'), false);
  result = h.context.saveConfigDomain_('sizes', { sizes: [{ id: 'p', name: 'Pequeno', description: 'Serve 8', price: 89, active: true }] }, '2');
  assert.equal(result.config.sizes.find(item => item.id === 'p').active, true);
});

test('item omitido e preservado como inativo, nunca excluido silenciosamente', () => {
  const h = createHarness();
  const result = h.context.saveConfigDomain_('catalog', {
    flavorItems: [{ id: 'chocolate', name: 'Chocolate', active: true }],
    sizes: [{ id: 'p', name: 'Pequeno', description: 'Serve 8', price: 89, active: true }],
    payments: [{ id: 'pix', name: 'PIX', type: 'pix', description: '', active: true }]
  }, '1');
  assert.equal(result.config.flavorItems.find(item => item.id === 'ninho').active, false);
  assert.equal(result.config.sizes.find(item => item.id === 'm').active, false);
  assert.equal(result.config.flavorItems.find(item => item.id === 'ninho').id, 'ninho');
  assert.equal(result.config.sizes.find(item => item.id === 'm').id, 'm');
});

test('snapshot pode ser restaurado e cria nova revisao', () => {
  const h = createHarness();
  const saved = h.context.saveConfigDomain_('brand', { brandName: 'Nova', heroTitle: 'Nova', heroSubtitle: '', description: '' }, '1');
  const restored = h.context.restoreConfigBackup_(saved.backupId, '2');
  assert.equal(restored.revision, '3');
  assert.equal(restored.config.brandName, 'Marca Antiga');
});

// ---- Etapa 9: entrega e retirada ----

const fulfillmentData = (overrides = {}) => ({
  fulfillment: {
    pickupEnabled: true, deliveryEnabled: true, deliveryFee: '8.50',
    pickupAddress: 'Endereço comercial fictício, 100', pickupInstructions: 'Retire das 9h às 12h.',
    deliveryInstructions: 'Entregas a partir das 14h.', ...overrides
  }
});

test('sem configuracao explicita a entrega fica desabilitada e a retirada habilitada', () => {
  const fulfillment = createHarness().config().fulfillment;
  assert.equal(fulfillment.pickupEnabled, true);
  assert.equal(fulfillment.deliveryEnabled, false);
  assert.equal(fulfillment.deliveryFeeCents, null);
});

test('dominio de entrega e retirada usa revisao, backup e centavos', () => {
  const h = createHarness();
  const result = h.context.saveConfigDomain_('fulfillment', fulfillmentData(), '1');
  assert.equal(result.revision, '2');
  assert.equal(result.config.fulfillment.deliveryEnabled, true);
  assert.equal(result.config.fulfillment.deliveryFeeCents, 850);
  assert.equal(result.config.fulfillment.pickupAddress, 'Endereço comercial fictício, 100');
  const backup = h.sheets.get('_ConfigBackups').data[1];
  assert.equal(backup[3], 'fulfillment');
  assert.equal(backup[5], 'committed');
  assert.equal(h.config().brandName, 'Marca Antiga', 'outros domínios não mudam');
});

test('nao permite desabilitar as duas modalidades', () => {
  const h = createHarness();
  assert.throws(() => h.context.saveConfigDomain_('fulfillment', fulfillmentData({ pickupEnabled: false, deliveryEnabled: false }), '1'),
    error => error.code === 'FULFILLMENT_MODE_REQUIRED');
  assert.equal(h.context.getConfigRevision_(), '1');
});

test('entrega exige taxa explicita, aceita zero e recusa valor invalido', () => {
  const h = createHarness();
  assert.throws(() => h.context.saveConfigDomain_('fulfillment', fulfillmentData({ deliveryFee: '' }), '1'),
    error => error.code === 'DELIVERY_FEE_REQUIRED');
  assert.throws(() => h.context.saveConfigDomain_('fulfillment', fulfillmentData({ deliveryFee: '-1' }), '1'),
    error => error.code === 'INVALID_DELIVERY_FEE');
  assert.equal(h.context.getConfigRevision_(), '1');
  const free = h.context.saveConfigDomain_('fulfillment', fulfillmentData({ deliveryFee: '0' }), '1');
  assert.equal(free.config.fulfillment.deliveryEnabled, true);
  assert.equal(free.config.fulfillment.deliveryFeeCents, 0);
});

test('entrega marcada sem taxa na planilha permanece desabilitada', () => {
  const h = createHarness();
  h.sheets.get('Configuracoes').data.push(['deliveryEnabled', true], ['deliveryFee', '']);
  assert.equal(h.config().fulfillment.deliveryEnabled, false);
});

test('textos de entrega sao neutralizados e limitados', () => {
  const h = createHarness();
  h.context.saveConfigDomain_('fulfillment', fulfillmentData({ pickupAddress: '=IMPORTXML("https://evil.example")' }), '1');
  const row = h.rows('Configuracoes').find(item => item[0] === 'pickupAddress');
  assert.equal(row[1], "'=IMPORTXML(\"https://evil.example\")");
  assert.equal(h.config().fulfillment.pickupAddress, '=IMPORTXML("https://evil.example")');
  assert.throws(() => h.context.saveConfigDomain_('fulfillment', fulfillmentData({ deliveryInstructions: 'x'.repeat(501) }), '2'),
    error => error.code === 'FULFILLMENT_TEXT_TOO_LONG');
});

test('configuracao publica expoe somente dados comerciais de recebimento', () => {
  const h = createHarness();
  h.context.saveConfigDomain_('fulfillment', fulfillmentData(), '1');
  const fulfillment = JSON.parse(JSON.stringify(h.context.getPublicConfig_().fulfillment));
  assert.deepEqual(Object.keys(fulfillment).sort(), ['deliveryEnabled', 'deliveryFee', 'deliveryFeeCents', 'deliveryInstructions', 'pickupAddress', 'pickupEnabled', 'pickupInstructions']);
});

test('setupProject pode ser repetido: colunas e chaves sao acrescentadas sem sobrescrever', () => {
  const h = createHarness();
  const headers = h.context.PF ? h.context.PF.headers.Pedidos : vm.runInContext('PF.headers.Pedidos', h.context);
  const legacyRow = ['PF-ANTIGO', 'x', 'Cliente', '349', 'd', '10:00', 'Chocolate', '', '', '', 89, 'PIX', '', 'Concluído', 'site', 1, 'f', 'committed'];
  const orders = new FakeSheet('Pedidos', [headers.slice(0, 18), legacyRow], h.failures);
  h.sheets.set('Pedidos', orders);
  h.sheets.get('Configuracoes').data.push(['deliveryEnabled', true]);
  for (let run = 0; run < 2; run += 1) {
    h.context.ensureSheet_(h.spreadsheet, 'Pedidos', headers);
    h.context.ensureConfigDefaults_(h.spreadsheet);
  }
  assert.equal(orders.data[0].length, 31);
  assert.equal(orders.data[0][18], 'Modalidade de recebimento');
  assert.deepEqual([...orders.data[1]], legacyRow);
  const keys = h.rows('Configuracoes').map(row => row[0]);
  assert.equal(keys.filter(key => key === 'pickupEnabled').length, 1);
  assert.equal(keys.filter(key => key === 'deliveryEnabled').length, 1);
  assert.equal(h.rows('Configuracoes').find(row => row[0] === 'deliveryEnabled')[1], true, 'valor existente preservado');
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
