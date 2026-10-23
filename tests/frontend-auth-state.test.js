const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).filter(Boolean);
let source = inlineScripts.at(-1);

source = source.replace(
  /\s+initializeApp\(\);\s+\}\)\(\);\s*$/,
  `
      window.__authTest = {
        setUnlocked(value) { adminWasUnlocked = value; },
        setToken(value) { adminSessionToken = value; },
        lockAdminAccess,
        restorePreservedAdminAccess,
        endAdminAccess,
        attachIdempotencyKey,
        isOrdersOpenToday,
        nextDeliveryDate,
        applyPublicAvailability,
        renderStatusOptions,
        saveConfigRemote,
        showConfigSaveError,
        markConfigDirty,
        setConfig(value) { config = normalizeConfig(value); appState.config = config; },
        state() {
          return { adminSessionToken, preserveAdminStateOnReauth, adminWasUnlocked };
        }
      };
    })();`
);

assert.match(source, /window\.__authTest/, 'Nao foi possivel instrumentar o script da pagina.');

function classList() {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    toggle: (name, force) => {
      if (force === true) values.add(name);
      else if (force === false) values.delete(name);
      else if (values.has(name)) values.delete(name);
      else values.add(name);
      return values.has(name);
    },
    contains: name => values.has(name)
  };
}

function createElement(id = '') {
  return {
    id,
    value: '', textContent: '', innerHTML: '', className: '', type: 'text',
    checked: false, disabled: false, dataset: {}, style: {}, classList: classList(),
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
    appendChild() {}, remove() {}, focus() {}, click() {},
    querySelectorAll() { return []; }, querySelector() { return null; }, closest() { return null; }
  };
}

function createRuntime(fetchImpl) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    createElement: tag => createElement(tag),
    body: createElement('body')
  };
  const storage = new Map();
  const localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  const immediateTimeout = callback => { callback(); return 1; };
  const window = {
    location: { search: '', href: 'http://127.0.0.1:4173/' },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    confirm: () => true,
    setTimeout: immediateTimeout,
    clearTimeout() {}, scrollTo() {}, open() {}
  };
  const context = {
    window, document, localStorage, fetch: fetchImpl,
    navigator: { clipboard: { writeText: async () => {} } },
    URL, URLSearchParams, Intl, Date, JSON, Math, String, Number, Object, Array,
    Error, RegExp, Promise, console,
    setTimeout: immediateTimeout, clearTimeout() {},
    FormData: class { entries() { return []; } },
    QRCode: function QRCode() {}
  };
  window.document = document;
  window.localStorage = localStorage;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'index.inline.js' });
  return { window, elements, get: id => document.getElementById(id) };
}

async function testDraftPreservation() {
  const runtime = createRuntime(async () => { throw new Error('unused'); });
  runtime.get('adminBrandName').value = 'Rascunho ficticio preservado';
  runtime.window.__authTest.setUnlocked(true);
  runtime.window.__authTest.lockAdminAccess('Sessao expirada', true);

  assert.equal(runtime.get('adminBrandName').value, 'Rascunho ficticio preservado');
  assert.equal(runtime.get('adminView').classList.contains('hidden'), true);
  assert.equal(runtime.get('adminAuthView').classList.contains('hidden'), false);
  assert.equal(runtime.window.__authTest.state().preserveAdminStateOnReauth, true);

  assert.equal(runtime.window.__authTest.restorePreservedAdminAccess(), true);
  assert.equal(runtime.get('adminBrandName').value, 'Rascunho ficticio preservado');
  assert.equal(runtime.get('adminView').classList.contains('hidden'), false);
  assert.equal(runtime.get('adminAuthView').classList.contains('hidden'), true);
}

async function testFailedRemoteLogout() {
  const runtime = createRuntime(async () => { throw new Error('network unavailable'); });
  runtime.window.__authTest.setUnlocked(true);
  runtime.window.__authTest.setToken('token-ficticio');
  await runtime.window.__authTest.endAdminAccess();

  assert.equal(runtime.window.__authTest.state().adminSessionToken, '');
  assert.equal(runtime.get('adminView').classList.contains('hidden'), true);
  assert.match(runtime.get('adminAuthMessage').textContent, /N.o foi poss.vel confirmar a revoga..o no servidor/i);
  assert.match(runtime.get('adminAuthMessage').textContent, /poder. permanecer v.lida at. expirar/i);
}

async function testConfirmedRemoteLogout() {
  const runtime = createRuntime(async () => ({
    ok: true,
    json: async () => ({ ok: true })
  }));
  runtime.window.__authTest.setUnlocked(true);
  runtime.window.__authTest.setToken('token-ficticio');
  await runtime.window.__authTest.endAdminAccess();

  assert.equal(runtime.window.__authTest.state().adminSessionToken, '');
  assert.match(runtime.get('adminAuthMessage').textContent, /revogada no servidor/i);
}

async function testSafeRetryKey() {
  const runtime = createRuntime(async () => { throw new Error('network unavailable'); });
  const order = { customerName: 'Cliente Ficticio', sizeId: 'p', notes: '' };
  const firstAttempt = runtime.window.__authTest.attachIdempotencyKey(order);
  const retryAfterFailure = runtime.window.__authTest.attachIdempotencyKey({ ...order });
  assert.equal(firstAttempt.idempotencyKey, retryAfterFailure.idempotencyKey);

  runtime.window.crypto.randomUUID = () => '00000000-0000-4000-8000-000000000002';
  const changedOrder = runtime.window.__authTest.attachIdempotencyKey({ ...order, notes: 'Nova tentativa' });
  assert.notEqual(changedOrder.idempotencyKey, firstAttempt.idempotencyKey);
}

async function testServerBusinessWindow() {
  const runtime = createRuntime(async () => { throw new Error('unused'); });
  runtime.window.__authTest.setConfig({
    availability: { enabled: true, days: { tuesday: true }, deliveryDay: 'sunday' },
    orderWindow: {
      open: false,
      message: 'O prazo desta fornada foi encerrado.',
      deliveryDate: '2026-11-01'
    }
  });
  assert.equal(runtime.window.__authTest.isOrdersOpenToday(new Date('2026-10-20T12:00:00Z')), false);
  const delivery = runtime.window.__authTest.nextDeliveryDate(new Date('2026-10-20T12:00:00Z'));
  assert.equal(`${delivery.getFullYear()}-${String(delivery.getMonth() + 1).padStart(2, '0')}-${String(delivery.getDate()).padStart(2, '0')}`, '2026-11-01');
  runtime.window.__authTest.applyPublicAvailability();
  assert.equal(runtime.get('availabilityMessage').textContent, 'O prazo desta fornada foi encerrado.');
  assert.match(runtime.get('deliveryDateBox').innerHTML, /01\/11\/2026/);
}

async function testCanonicalAndLegacyStatuses() {
  const runtime = createRuntime(async () => { throw new Error('unused'); });
  const canonical = runtime.window.__authTest.renderStatusOptions('Confirmado');
  assert.match(canonical, /Confirmado/);
  assert.doesNotMatch(canonical, /Pagamento não confirmado/);
  const legacy = runtime.window.__authTest.renderStatusOptions('Novo');
  assert.match(legacy, /Novo \(legado\)/);
  assert.match(legacy, /disabled/);
}

async function testConfigConflictPreservesDraft() {
  const runtime = createRuntime(async () => ({
    ok: true,
    json: async () => ({
      ok: false,
      code: 'CONFIG_CONFLICT',
      message: 'Conflito ficticio',
      currentRevision: '2'
    })
  }));
  runtime.window.__authTest.setConfig({ revision: '1' });
  runtime.get('adminBrandName').value = 'Rascunho local não salvo';
  runtime.window.__authTest.markConfigDirty('brand');
  let captured;
  try { await runtime.window.__authTest.saveConfigRemote('brand'); }
  catch (error) { captured = error; runtime.window.__authTest.showConfigSaveError('brand', error); }
  assert.equal(captured.code, 'CONFIG_CONFLICT');
  assert.equal(runtime.get('adminBrandName').value, 'Rascunho local não salvo');
  assert.match(runtime.get('brandSaveMessage').textContent, /campos foram mantidos/i);
}

async function testDuplicateAdminSaveIsBlocked() {
  let release;
  const pendingResponse = new Promise(resolve => { release = resolve; });
  const runtime = createRuntime(() => pendingResponse);
  runtime.window.__authTest.setConfig({ revision: '1' });
  const first = runtime.window.__authTest.saveConfigRemote('brand');
  await assert.rejects(
    runtime.window.__authTest.saveConfigRemote('brand'),
    error => error.code === 'CONFIG_SAVE_IN_PROGRESS'
  );
  release({ ok: true, json: async () => ({ ok: false, code: 'CONFIG_CONFLICT', message: 'fim do teste' }) });
  await assert.rejects(first, error => error.code === 'CONFIG_CONFLICT');
}

(async () => {
  const tests = [
    ['rascunho administrativo sobrevive a reautenticacao', testDraftPreservation],
    ['falha de rede no logout diferencia remocao local de revogacao remota', testFailedRemoteLogout],
    ['logout confirmado informa revogacao no servidor', testConfirmedRemoteLogout],
    ['reenvio do mesmo formulario reutiliza a chave de idempotencia', testSafeRetryKey],
    ['formulario usa janela e data calculadas pelo servidor', testServerBusinessWindow],
    ['interface oferece status canonicos e preserva status legado', testCanonicalAndLegacyStatuses],
    ['conflito de revisao preserva o rascunho administrativo', testConfigConflictPreservesDraft],
    ['segundo salvamento administrativo e bloqueado enquanto outro esta em curso', testDuplicateAdminSaveIsBlocked]
  ];
  let failed = 0;
  for (const [name, fn] of tests) {
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
