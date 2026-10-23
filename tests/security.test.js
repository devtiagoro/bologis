const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'code.gs'), 'utf8');

function byteArray(value) {
  return Array.from(Buffer.from(value));
}

function createHarness() {
  const properties = new Map();
  const cache = new Map();
  const cacheTtl = new Map();
  const alerts = [];
  let sleeps = 0;
  let uuid = 0;

  const scriptProperties = {
    getProperty: key => properties.get(key) || null,
    setProperty: (key, value) => properties.set(key, String(value)),
    deleteProperty: key => properties.delete(key),
    setProperties: values => Object.entries(values).forEach(([key, value]) => properties.set(key, String(value)))
  };
  const scriptCache = {
    get: key => cache.get(key) || null,
    put: (key, value, ttl) => {
      cache.set(key, String(value));
      cacheTtl.set(key, ttl);
    },
    remove: key => {
      cache.delete(key);
      cacheTtl.delete(key);
    }
  };

  const context = {
    console: { log() {}, warn() {}, error() {} },
    Date, JSON, Math, String, Number, Object, Array, Error, RegExp, URL,
    PropertiesService: { getScriptProperties: () => scriptProperties },
    CacheService: { getScriptCache: () => scriptCache },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      getUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
      computeDigest: (_algorithm, value) => byteArray(crypto.createHash('sha256').update(String(value)).digest()),
      computeHmacSha256Signature: (value, key) => byteArray(crypto.createHmac('sha256', String(key)).update(String(value)).digest()),
      base64EncodeWebSafe: value => Buffer.from(value).toString('base64url'),
      base64DecodeWebSafe: value => byteArray(Buffer.from(value, 'base64url')),
      newBlob: value => {
        const buffer = Buffer.isBuffer(value) ? value : Array.isArray(value) ? Buffer.from(value) : Buffer.from(String(value));
        return { getBytes: () => byteArray(buffer), getDataAsString: () => buffer.toString('utf8') };
      },
      sleep: () => { sleeps += 1; },
      formatDate: (_date, _timezone, format) => {
        if (format === 'u') return '2';
        if (format === 'yyyy-MM-dd') return '2026-10-20';
        if (String(format).includes("yyyy-MM-dd'T'HH:mm:ss")) return '2026-10-20T12:00:00-03:00';
        return '20261020-120000';
      },
      parseDate: value => new Date(String(value).replace(' ', 'T') + '-03:00')
    },
    SpreadsheetApp: {
      getUi: () => ({
        ButtonSet: { OK: 'OK' },
        alert: (...args) => alerts.push(args)
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: text => ({ text, setMimeType() { return this; } })
    }
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'code.gs' });

  function configure(key = 'correct-admin-key') {
    properties.set('ADMIN_KEY_HASH', context.hashCredential_(key));
    properties.set('AUTH_SIGNING_SECRET', 'test-signing-secret');
    properties.set('AUTH_VERSION', '1');
    return key;
  }

  function post(payload) {
    const response = context.doPost({ postData: { contents: JSON.stringify(payload) }, parameter: {} });
    return JSON.parse(response.text);
  }

  function get(action) {
    return JSON.parse(context.doGet({ parameter: { action } }).text);
  }

  function login(key = 'correct-admin-key') {
    const response = post({ action: 'createAdminSession', adminKey: key });
    assert.equal(response.ok, true);
    return response.session.token;
  }

  return {
    context, properties, cache, cacheTtl, alerts,
    get sleeps() { return sleeps; },
    configure, post, get, login
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('GET administrativo antigo e novo sao rejeitados', () => {
  const h = createHarness();
  h.configure();
  for (const action of ['getOrders', 'getAdminConfig']) {
    const result = h.get(action);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'AUTH_REQUIRED');
  }
});

test('GET publico e alias legado nao retornam configuracao privada', () => {
  const h = createHarness();
  h.configure();
  h.context.getConfig_ = () => ({
    brandName: 'Homologacao', heroTitle: 'Teste', heroSubtitle: '', description: '',
    flavors: ['Ficticio'], sizes: [], payments: [], availability: {},
    spreadsheetUrl: 'https://docs.google.com/private', internalFlag: 'private'
  });
  for (const action of ['getPublicConfig', 'getConfig']) {
    const result = h.get(action);
    assert.equal(result.ok, true);
    assert.equal('spreadsheetUrl' in result.config, false);
    assert.equal('internalFlag' in result.config, false);
  }
});

test('autenticacao correta passa pelo doPost e cria sessao de 30 minutos', () => {
  const h = createHarness();
  h.configure();
  const result = h.post({ action: 'createAdminSession', adminKey: 'correct-admin-key' });
  assert.equal(result.ok, true);
  assert.match(result.session.token, /^[^.]+\.[^.]+$/);
  const ttl = Date.parse(result.session.expiresAt) - Date.now();
  assert.ok(ttl > 29 * 60 * 1000 && ttl <= 30 * 60 * 1000);
});

test('autenticacao incorreta passa pelo doPost com erro generico', () => {
  const h = createHarness();
  h.configure();
  const result = h.post({ action: 'createAdminSession', adminKey: 'wrong' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'AUTH_INVALID');
  assert.equal(result.message, 'Nao foi possivel autorizar o acesso.');
});

test('getAdminConfig passa pelo doPost autenticado', () => {
  const h = createHarness();
  h.configure();
  h.context.getConfig_ = () => ({ spreadsheetUrl: 'ficticia', flavors: [] });
  const result = h.post({ action: 'getAdminConfig', adminToken: h.login() });
  assert.equal(result.ok, true);
  assert.equal(result.config.spreadsheetUrl, 'ficticia');
});

test('getOrders passa pelo doPost autenticado', () => {
  const h = createHarness();
  h.configure();
  h.context.getOrders_ = () => [{ id: 'HML-FAKE-1' }];
  const result = h.post({ action: 'getOrders', adminToken: h.login() });
  assert.equal(result.ok, true);
  assert.equal(result.orders[0].id, 'HML-FAKE-1');
});

test('saveConfig passa pelo doPost autenticado e preserva payload', () => {
  const h = createHarness();
  h.configure();
  let received;
  h.context.saveConfigDomain_ = (domain, data, revision) => {
    received = { domain, data, revision };
    return { config: data, revision: '2', backupId: 'fake' };
  };
  const config = { brandName: 'Somente Teste', payments: [] };
  const result = h.post({ action: 'saveConfigDomain', adminToken: h.login(), domain: 'brand', revision: '1', data: config });
  assert.equal(result.ok, true);
  assert.deepEqual(received, { domain: 'brand', data: config, revision: '1' });
});

test('updateOrderStatus passa pelo doPost autenticado', () => {
  const h = createHarness();
  h.configure();
  let received;
  h.context.updateOrderStatus_ = (orderId, status) => (received = { orderId, status });
  const result = h.post({
    action: 'updateOrderStatus', adminToken: h.login(),
    orderId: 'HML-FAKE-1', status: 'Confirmado'
  });
  assert.equal(result.ok, true);
  assert.deepEqual(received, { orderId: 'HML-FAKE-1', status: 'Confirmado' });
});

test('endAdminSession passa pelo doPost e impede reutilizacao do token', () => {
  const h = createHarness();
  h.configure();
  h.context.getOrders_ = () => [];
  const token = h.login();
  assert.equal(h.post({ action: 'endAdminSession', adminToken: token }).ok, true);
  const reuse = h.post({ action: 'getOrders', adminToken: token });
  assert.equal(reuse.ok, false);
  assert.equal(reuse.code, 'AUTH_REVOKED');
});

test('assinatura adulterada e token expirado sao rejeitados pelo doPost', () => {
  const h = createHarness();
  h.configure();
  const token = h.login();
  const altered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
  assert.equal(h.post({ action: 'getOrders', adminToken: altered }).code, 'AUTH_INVALID');

  const now = Math.floor(Date.now() / 1000);
  h.cache.set('admin-session:expired', '1');
  const expired = h.context.signAdminToken_(
    { v: '1', iat: now - 60, exp: now - 1, n: 'expired' },
    'test-signing-secret'
  );
  assert.equal(h.post({ action: 'getOrders', adminToken: expired }).code, 'AUTH_EXPIRED');
});

test('rotacao troca credenciais, nao persiste chave pura e invalida token anterior', () => {
  const h = createHarness();
  const first = h.context.initializeAdminSecurity();
  const token = h.login(first.adminKey);
  const second = h.context.initializeAdminSecurity();
  assert.notEqual(first.adminKey, second.adminKey);
  assert.equal(second.authVersion, '2');
  assert.equal([...h.properties.values()].includes(second.adminKey), false);
  assert.equal(h.alerts.length, 2);
  assert.equal(h.post({ action: 'getOrders', adminToken: token }).code, 'AUTH_INVALID');
});

test('rotas administrativas sem token bloqueiam antes de dados ou mutacoes', () => {
  const h = createHarness();
  h.configure();
  let calls = 0;
  h.context.getOrders_ = () => { calls += 1; return []; };
  h.context.getConfig_ = () => { calls += 1; return {}; };
  h.context.saveConfigDomain_ = () => { calls += 1; return {}; };
  h.context.updateOrderStatus_ = () => { calls += 1; return {}; };
  for (const payload of [
    { action: 'getOrders' },
    { action: 'getAdminConfig' },
    { action: 'saveConfig', revision: '1', config: {} },
    { action: 'saveConfigDomain', domain: 'brand', revision: '1', data: {} },
    { action: 'getConfigBackups' },
    { action: 'restoreConfigBackup', backupId: 'fake', revision: '1' },
    { action: 'updateOrderStatus', orderId: 'fake', status: 'Confirmado' },
    { action: 'endAdminSession' }
  ]) {
    assert.equal(h.post(payload).code, 'AUTH_REQUIRED');
  }
  assert.equal(calls, 0);
});

test('tentativas repetidas preservam erro generico e aplicam atraso', () => {
  const h = createHarness();
  h.configure();
  for (let index = 0; index < 7; index += 1) {
    const result = h.post({ action: 'createAdminSession', adminKey: 'same-wrong-key' });
    assert.equal(result.code, 'AUTH_INVALID');
  }
  assert.ok(h.sleeps >= 2);
});

test('links de tamanho nao sao expostos no publico e links inseguros sao rejeitados', () => {
  const h = createHarness();
  h.configure();
  h.context.getConfig_ = () => ({
    brandName: 'Teste', heroTitle: 'Teste', heroSubtitle: '', description: '', flavors: [], sizes: [],
    payments: [
      { id: 'safe', name: 'Seguro', paymentLink: 'https://checkout.example/ok', active: true },
      { id: 'bad', name: 'Perigoso', paymentLink: 'javascript:alert(1)', active: true }
    ],
    availability: {}, spreadsheetUrl: 'private'
  });
  const publicConfig = h.get('getPublicConfig').config;
  assert.equal(Object.hasOwn(publicConfig, 'sizes'), false);
  assert.equal(Object.hasOwn(publicConfig.payments[0], 'paymentLink'), false);
  assert.equal(Object.hasOwn(publicConfig.payments[1], 'paymentLink'), false);
  for (const unsafe of ['javascript:alert(1)', 'data:text/html,x', 'http://checkout.example']) {
    assert.throws(() => h.context.validatePaymentUrl_(unsafe, true), error => error.code === 'INVALID_PAYMENT_URL');
  }
});

test('allowlist de pagamentos bloqueia dominios nao autorizados', () => {
  const h = createHarness();
  h.properties.set('PAYMENT_ALLOWED_HOSTS', 'checkout.example,pay.example');
  assert.equal(h.context.validatePaymentUrl_('https://secure.checkout.example/order/1', true), 'https://secure.checkout.example/order/1');
  assert.throws(
    () => h.context.validatePaymentUrl_('https://untrusted.example/order/1', true),
    error => error.code === 'INVALID_PAYMENT_URL'
  );
});

test('erros internos inesperados nao expõem detalhes operacionais', () => {
  const h = createHarness();
  h.context.getPublicConfig_ = () => { throw new Error('SPREADSHEET_ID-secreto-detalhe-interno'); };
  const result = h.get('getPublicConfig');
  assert.equal(result.code, 'INTERNAL_ERROR');
  assert.equal(result.message.includes('SPREADSHEET_ID-secreto'), false);
});

test('createOrder continua publico e passa pelo doPost', () => {
  const h = createHarness();
  h.configure();
  h.context.createOrder_ = body => ({ id: 'HML-FAKE-ORDER', flavor: body.flavor });
  const result = h.post({ action: 'createOrder', flavor: 'Chocolate ficticio', sizeId: 'p' });
  assert.equal(result.ok, true);
  assert.equal(result.orderId, 'HML-FAKE-ORDER');
});

test('frontend compila, nao persiste credencial e inclui estados de reautenticacao', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1]).filter(Boolean);
  assert.ok(scripts.length > 0);
  scripts.forEach(script => new vm.Script(script));
  assert.equal(/localStorage\.setItem\([^\n]*(admin|token|session)/i.test(html), false);
  assert.equal(/localStorage\.(?:getItem|setItem)\([^\n]*spreadsheet/i.test(html), false);
  assert.equal(html.includes('cdnjs.cloudflare.com'), false);
  assert.equal(html.includes('qrcode.min.js'), false);
  assert.match(html, /restorePreservedAdminAccess/);
  assert.match(html, /sess[aã]o remota poder[aá] permanecer v[aá]lida at[eé] expirar/i);
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
