const PF = {
  sheets: {
    config: 'Configuracoes',
    flavors: 'Sabores',
    sizes: 'Tamanhos',
    payments: 'Pagamentos',
    availability: 'Disponibilidade',
    orders: 'Pedidos'
  },
  headers: {
    Configuracoes: ['Chave', 'Valor'],
    Sabores: ['ID', 'Nome', 'Ativo', 'Ordem'],
    Tamanhos: ['ID', 'Nome', 'Descrição', 'Preço', 'Ativo', 'Ordem'],
    Pagamentos: ['ID', 'Nome', 'Tipo', 'Descrição', 'Link/Payload', 'Ativo', 'Ordem'],
    Disponibilidade: ['Dia', 'Código', 'Aberto', 'Ordem'],
    Pedidos: [
      'Pedido ID', 'Criado em', 'Cliente', 'WhatsApp', 'Data desejada', 'Horário',
      'Sabor', 'Tamanho ID', 'Tamanho', 'Descrição/Porções', 'Valor', 'Pagamento',
      'Observações', 'Status', 'Origem'
    ]
  }
};

const PF_AUTH = {
  keyHashProperty: 'ADMIN_KEY_HASH',
  signingSecretProperty: 'AUTH_SIGNING_SECRET',
  versionProperty: 'AUTH_VERSION',
  sessionPrefix: 'admin-session:',
  attemptPrefix: 'admin-attempt:',
  globalAttemptKey: 'admin-attempts:global',
  sessionTtlSeconds: 30 * 60,
  maxAttemptsPerCredential: 5,
  maxGlobalAttemptsPerMinute: 60
};

const PF_ORDER = {
  maxRequestBytes: 256 * 1024,
  maxOrderBytes: 16 * 1024,
  maxNameLength: 120,
  maxWhatsappLength: 24,
  maxNotesLength: 500,
  maxSourceLength: 40,
  maxIdempotencyKeyLength: 128,
  rateGlobalKey: 'order-attempts:global',
  rateKeyPrefix: 'order-attempts:key:',
  maxGlobalAttemptsPerMinute: 80,
  maxAttemptsPerKey: 5,
  timezone: 'America/Sao_Paulo',
  weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  statuses: ['Aguardando pagamento', 'Confirmado', 'Em produção', 'Concluído', 'Cancelado'],
  legacyStatuses: ['Novo', 'Pagamento não confirmado'],
  initialStatus: 'Aguardando pagamento'
};

const PF_CONFIG = {
  revisionProperty: 'CONFIG_REVISION',
  recoveryProperty: 'CONFIG_RECOVERY_REQUIRED',
  backupSheet: '_ConfigBackups',
  backupHeaders: ['Snapshot ID', 'Criado em', 'Revisão', 'Domínio', 'Dados JSON', 'Estado', 'Parte', 'Total'],
  backupRetention: 20,
  backupChunkSize: 40000,
  domains: ['brand', 'flavors', 'sizes', 'catalog', 'payments', 'availability']
};

/** Execute manualmente no editor do Apps Script para criar ou rotacionar a chave. */
function initializeAdminSecurity() {
  const adminKey = randomSecret_();
  const signingSecret = randomSecret_();
  const properties = PropertiesService.getScriptProperties();
  const nextVersion = String(Number(properties.getProperty(PF_AUTH.versionProperty) || 0) + 1);

  properties.setProperties({
    [PF_AUTH.keyHashProperty]: hashCredential_(adminKey),
    [PF_AUTH.signingSecretProperty]: signingSecret,
    [PF_AUTH.versionProperty]: nextVersion
  }, false);

  CacheService.getScriptCache().remove(PF_AUTH.globalAttemptKey);

  const message = [
    'A chave administrativa foi criada/rotacionada.', '', adminKey, '',
    'Copie-a agora e guarde-a em um gerenciador de senhas. Ela nao sera armazenada em texto puro.'
  ].join('\n');

  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert('Seguranca administrativa', message, ui.ButtonSet.OK);
  } catch (_) {
    // Em scripts nao vinculados, a chave ainda e devolvida pela execucao manual.
  }

  return { adminKey, authVersion: nextVersion };
}

function randomSecret_() {
  const entropy = [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid(), String(new Date().getTime())].join(':');
  return base64UrlEncode_(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    entropy,
    Utilities.Charset.UTF_8
  ));
}

function hashCredential_(value) {
  return base64UrlEncode_(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  ));
}

function base64UrlEncode_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function base64UrlDecodeText_(value) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(String(value || ''))).getDataAsString('UTF-8');
}

function constantTimeEqual_(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index % Math.max(a.length, 1)) || 0)
      ^ (b.charCodeAt(index % Math.max(b.length, 1)) || 0);
  }
  return difference === 0;
}

function getAuthProperties_() {
  const properties = PropertiesService.getScriptProperties();
  const keyHash = properties.getProperty(PF_AUTH.keyHashProperty) || '';
  const signingSecret = properties.getProperty(PF_AUTH.signingSecretProperty) || '';
  const version = properties.getProperty(PF_AUTH.versionProperty) || '';
  if (!keyHash || !signingSecret || !version) {
    throw apiError_('AUTH_NOT_CONFIGURED', 'A seguranca administrativa ainda nao foi configurada.');
  }
  return { keyHash, signingSecret, version };
}

function recordFailedAuthAttempt_(adminKey) {
  const cache = CacheService.getScriptCache();
  const fingerprint = hashCredential_(adminKey).slice(0, 24);
  const key = PF_AUTH.attemptPrefix + fingerprint;
  const attempts = Number(cache.get(key) || 0) + 1;
  const globalAttempts = Number(cache.get(PF_AUTH.globalAttemptKey) || 0) + 1;
  cache.put(key, String(attempts), 5 * 60);
  cache.put(PF_AUTH.globalAttemptKey, String(globalAttempts), 60);
  if (attempts > PF_AUTH.maxAttemptsPerCredential || globalAttempts > PF_AUTH.maxGlobalAttemptsPerMinute) {
    Utilities.sleep(350);
  }
}

function signAdminToken_(payload, signingSecret) {
  const encodedPayload = base64UrlEncode_(Utilities.newBlob(JSON.stringify(payload)).getBytes());
  const signature = base64UrlEncode_(Utilities.computeHmacSha256Signature(
    encodedPayload,
    signingSecret,
    Utilities.Charset.UTF_8
  ));
  return encodedPayload + '.' + signature;
}

function createAdminSession_(adminKey) {
  const auth = getAuthProperties_();
  if (!constantTimeEqual_(hashCredential_(adminKey), auth.keyHash)) {
    recordFailedAuthAttempt_(adminKey);
    throw apiError_('AUTH_INVALID', 'Nao foi possivel autorizar o acesso.');
  }

  const now = Math.floor(new Date().getTime() / 1000);
  const nonce = randomSecret_();
  const expiresAt = now + PF_AUTH.sessionTtlSeconds;
  const payload = { v: auth.version, iat: now, exp: expiresAt, n: nonce };
  const token = signAdminToken_(payload, auth.signingSecret);
  CacheService.getScriptCache().put(PF_AUTH.sessionPrefix + nonce, auth.version, PF_AUTH.sessionTtlSeconds);
  return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

function validateAdminSession_(token) {
  if (!token) throw apiError_('AUTH_REQUIRED', 'Acesso administrativo necessario.');
  const parts = String(token).split('.');
  if (parts.length !== 2) throw apiError_('AUTH_INVALID', 'Sessao administrativa invalida.');

  const auth = getAuthProperties_();
  const expectedSignature = base64UrlEncode_(Utilities.computeHmacSha256Signature(
    parts[0], auth.signingSecret, Utilities.Charset.UTF_8
  ));
  if (!constantTimeEqual_(parts[1], expectedSignature)) {
    throw apiError_('AUTH_INVALID', 'Sessao administrativa invalida.');
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeText_(parts[0]));
  } catch (_) {
    throw apiError_('AUTH_INVALID', 'Sessao administrativa invalida.');
  }

  const now = Math.floor(new Date().getTime() / 1000);
  if (!payload.n || !payload.exp || payload.exp <= now) {
    throw apiError_('AUTH_EXPIRED', 'A sessao administrativa expirou.');
  }
  if (!constantTimeEqual_(payload.v, auth.version)) {
    throw apiError_('AUTH_REVOKED', 'A sessao administrativa nao e mais valida.');
  }

  const activeVersion = CacheService.getScriptCache().get(PF_AUTH.sessionPrefix + payload.n);
  if (!activeVersion || !constantTimeEqual_(activeVersion, auth.version)) {
    throw apiError_('AUTH_REVOKED', 'A sessao administrativa nao e mais valida.');
  }
  return payload;
}

function requireAdmin_(body) {
  return validateAdminSession_(body && body.adminToken);
}

function endAdminSession_(token) {
  const payload = validateAdminSession_(token);
  CacheService.getScriptCache().remove(PF_AUTH.sessionPrefix + payload.n);
  return true;
}


function apiError_(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}


function nextDeliveryDate_(date, deliveryDay) {
  const targetDay = PF_ORDER.weekdays.indexOf(normalizeBusinessDay_(deliveryDay, 'sunday')) + 1;
  const currentDay = Number(Utilities.formatDate(date, PF_ORDER.timezone, 'u'));
  let daysAhead = (targetDay - currentDay + 7) % 7;
  if (daysAhead === 0) daysAhead = 7;
  return saoPauloDateWithOffset_(date, daysAhead, '12:00:00');
}

function saoPauloDateWithOffset_(baseDate, dayOffset, time) {
  const base = Utilities.formatDate(baseDate, PF_ORDER.timezone, 'yyyy-MM-dd').split('-').map(Number);
  const utcCalendar = new Date(Date.UTC(base[0], base[1] - 1, base[2] + dayOffset));
  const targetDate = [
    utcCalendar.getUTCFullYear(),
    String(utcCalendar.getUTCMonth() + 1).padStart(2, '0'),
    String(utcCalendar.getUTCDate()).padStart(2, '0')
  ].join('-');
  return Utilities.parseDate(targetDate + ' ' + normalizeTime_(time), PF_ORDER.timezone, 'yyyy-MM-dd HH:mm:ss');
}

function getOrderWindow_(config, now) {
  const availability = config.availability || {};
  const currentDayNumber = Number(Utilities.formatDate(now, PF_ORDER.timezone, 'u'));
  const currentDay = PF_ORDER.weekdays[currentDayNumber - 1];
  const deliveryDate = nextDeliveryDate_(now, availability.deliveryDay);
  const deliveryDayNumber = PF_ORDER.weekdays.indexOf(normalizeBusinessDay_(availability.deliveryDay, 'sunday')) + 1;
  const deadlineDayNumber = PF_ORDER.weekdays.indexOf(normalizeBusinessDay_(availability.paymentDeadlineDay, 'thursday')) + 1;
  const daysBack = (deliveryDayNumber - deadlineDayNumber + 7) % 7;
  const deadline = saoPauloDateWithOffset_(deliveryDate, -daysBack, availability.paymentDeadlineTime || '23:59:59');
  const enabled = availability.enabled !== false;
  const allowedDay = availability.days && availability.days[currentDay] === true;
  const beforeDeadline = now.getTime() <= deadline.getTime();
  const open = enabled && allowedDay && beforeDeadline;
  let code = '';
  let message = '';
  if (!enabled) {
    code = 'ORDERS_CLOSED';
    message = 'Os pedidos estão encerrados no momento.';
  } else if (!allowedDay) {
    code = 'ORDERS_CLOSED_DAY';
    message = 'Hoje não estamos recebendo novas encomendas.';
  } else if (!beforeDeadline) {
    code = 'ORDER_DEADLINE_CLOSED';
    message = 'O prazo desta fornada foi encerrado. Aguarde a abertura da próxima.';
  }
  return {
    open,
    code,
    message,
    currentDay,
    deliveryDate,
    deadline,
    deliveryDateText: Utilities.formatDate(deliveryDate, PF_ORDER.timezone, 'yyyy-MM-dd'),
    deadlineText: Utilities.formatDate(deadline, PF_ORDER.timezone, "yyyy-MM-dd'T'HH:mm:ssXXX"),
    serverNow: Utilities.formatDate(now, PF_ORDER.timezone, "yyyy-MM-dd'T'HH:mm:ssXXX")
  };
}

function normalizeBusinessDay_(value, fallback) {
  const day = String(value || '').trim().toLowerCase();
  return PF_ORDER.weekdays.includes(day) ? day : fallback;
}


function ensureConfigDefaults_(ss) {
  const sheet = ss.getSheetByName(PF.sheets.config);
  const existing = {};
  dataRows_(sheet).forEach(row => { if (row[0]) existing[String(row[0])] = true; });
  const defaults = [
    ['ordersEnabled', true],
    ['deliveryDay', 'sunday'],
    ['paymentDeadlineDay', 'thursday'],
    ['paymentDeadlineTime', '23:59:59']
  ];
  const missing = defaults.filter(row => !existing[row[0]]);
  if (missing.length) sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 2).setValues(missing);
}


function migratePaymentsSheet_(ss) {
  const sheet = ss.getSheetByName(PF.sheets.payments);
  if (!sheet) return;
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
  if (headers.includes('Tipo') && headers.includes('Link/Payload')) return;
  const migrated = [];
  dataRows_(sheet).forEach(row => {
    if (!row[1]) return;
    const isPix = String(row[0]).toLowerCase() === 'pix' || String(row[1]).toLowerCase().includes('pix');
    const id = isPix ? 'pix' : 'card';
    if (migrated.some(item => item[0] === id)) return;
    migrated.push([id, isPix ? 'PIX' : 'Cartão', isPix ? 'pix' : 'card', isPix ? 'Pagamento via PIX' : 'Crédito ou débito', '', isActive_(row[2]), migrated.length + 1]);
  });
  sheet.getRange(1, 1, 1, PF.headers.Pagamentos.length).setValues([PF.headers.Pagamentos]);
  replaceRows_(sheet, migrated);
}


function setupProject() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      'Abra o Apps Script pela própria planilha.'
    );
  }

  PropertiesService
    .getScriptProperties()
    .setProperty('SPREADSHEET_ID', ss.getId());

  ss.setSpreadsheetTimeZone('America/Sao_Paulo');


  ensureSheet_(
    ss,
    PF.sheets.config,
    PF.headers.Configuracoes
  );

  ensureSheet_(
    ss,
    PF.sheets.flavors,
    PF.headers.Sabores
  );

  ensureSheet_(
    ss,
    PF.sheets.sizes,
    PF.headers.Tamanhos
  );

  migratePaymentsSheet_(ss);

  ensureSheet_(
    ss,
    PF.sheets.payments,
    PF.headers.Pagamentos
  );

  ensureSheet_(
    ss,
    PF.sheets.availability,
    PF.headers.Disponibilidade
  );

  ensureSheet_(
    ss,
    PF.sheets.orders,
    PF.headers.Pedidos
  );


  seedDefaults_(ss);

  formatSheets_(ss);

  SpreadsheetApp.flush();

  console.log('Projeto configurado com sucesso.');
}



function doGet(e) {

  try {

    const action = String(
      (e && e.parameter && e.parameter.action)
      || 'ping'
    );


    if (action === 'ping') {

      return json_({
        ok: true,
        service: 'Primeira Fornada API',
        timestamp: new Date().toISOString()
      });

    }


    if (action === 'getConfig' || action === 'getPublicConfig') {

      return json_({
        ok: true,
        config: getPublicConfig_()
      });

    }


    if (action === 'getOrders' || action === 'getAdminConfig') {
      throw apiError_('AUTH_REQUIRED', 'Use uma requisicao POST autenticada para esta operacao.');
    }


    return json_({
      ok: false,
      message: 'Ação GET inválida: ' + action
    });


  } catch (error) {
    return json_(safeApiError_(error));

  }

}



function doPost(e) {

  try {

    validatePostSize_(e, PF_ORDER.maxRequestBytes);

    const body = parseBody_(e);

    const action = String(
      body.action || ''
    );


    if (action === 'createOrder') {

      validateObjectSize_(body, PF_ORDER.maxOrderBytes);

      const order = createOrder_(body);

      return json_({
        ok: true,
        order,
        orderId: order.id,
        duplicate: order.duplicate === true
      });

    }

    if (action === 'createAdminSession') {
      return json_({ ok: true, session: createAdminSession_(body.adminKey || '') });
    }

    if (action === 'endAdminSession') {
      requireAdmin_(body);
      endAdminSession_(body.adminToken);
      return json_({ ok: true });
    }

    if (action === 'getAdminConfig') {
      requireAdmin_(body);
      return json_({ ok: true, config: getConfig_() });
    }

    if (action === 'getOrders') {
      requireAdmin_(body);
      return json_({ ok: true, orders: getOrders_() });
    }


    if (action === 'saveConfig') {

      requireAdmin_(body);
      const legacyResult = saveConfigDomain_('all', body.config || {}, body.revision);
      return json_({ ok: true, config: legacyResult.config, revision: legacyResult.revision });
    }

    if (action === 'saveConfigDomain') {
      requireAdmin_(body);
      const saved = saveConfigDomain_(body.domain, body.data || {}, body.revision);
      return json_({ ok: true, config: saved.config, revision: saved.revision, backupId: saved.backupId });
    }

    if (action === 'getConfigBackups') {
      requireAdmin_(body);
      return json_({ ok: true, backups: listConfigBackups_() });
    }

    if (action === 'restoreConfigBackup') {
      requireAdmin_(body);
      const restored = restoreConfigBackup_(body.backupId, body.revision);
      return json_({ ok: true, config: restored.config, revision: restored.revision });

    }


    if (action === 'updateOrderStatus') {

      requireAdmin_(body);

      return json_({
        ok: true,
        order: updateOrderStatus_(
          body.orderId,
          body.status
        )
      });

    }


    return json_({
      ok: false,
      message: 'Ação POST inválida: ' + action
    });


  } catch (error) {
    return json_(safeApiError_(error));

  }

}

function safeApiError_(error) {
  const isExpected = Boolean(error && error.code);
  return {
    ok: false,
    code: isExpected ? error.code : 'INTERNAL_ERROR',
    message: isExpected
      ? error.message
      : 'Não foi possível processar a solicitação.',
    currentRevision: isExpected && error.currentRevision
      ? error.currentRevision
      : undefined
  };
}



function getConfig_() {

  const ss = getSpreadsheet_();


  const configRows =
    dataRows_(
      ss.getSheetByName(
        PF.sheets.config
      )
    );


  const values = {};


  configRows.forEach(row => {

    if (row[0]) {

      const key = String(row[0]).trim();
      values[key] = key === 'paymentDeadlineTime'
        ? row[1]
        : row[1] == null
          ? ''
          : readableSheetText_(row[1]);

    }

  });



  const flavorItems = dataRows_(ss.getSheetByName(PF.sheets.flavors))
    .filter(row => row[1])
    .sort((a, b) => Number(a[3] || 9999) - Number(b[3] || 9999))
    .map(row => ({
      id: readableSheetText_(row[0]),
      name: readableSheetText_(row[1]),
      active: isActive_(row[2]),
      order: Number(row[3] || 0)
    }));
  const flavors = flavorItems.filter(item => item.active).map(item => item.name);



  const sizes = dataRows_(ss.getSheetByName(PF.sheets.sizes))
    .filter(row => row[1])
    .sort((a, b) => Number(a[5] || 9999) - Number(b[5] || 9999))
    .map(row => ({
      id: readableSheetText_(row[0]),
      name: readableSheetText_(row[1]),
      description: readableSheetText_(row[2]),
      price: Number(row[3] || 0),
      active: isActive_(row[4]),
      order: Number(row[5] || 0)
    }));

  const payments = dataRows_(ss.getSheetByName(PF.sheets.payments))
    .filter(row => row[1])
    .sort((a, b) => Number(a[6] || 9999) - Number(b[6] || 9999))
    .map(row => ({
      id: readableSheetText_(row[0]),
      name: readableSheetText_(row[1]),
      type: readableSheetText_(row[2]),
      description: readableSheetText_(row[3]),
      paymentLink: readableSheetText_(row[4]),
      active: isActive_(row[5])
    }));

  const availabilityRows = dataRows_(ss.getSheetByName(PF.sheets.availability));
  const availabilityDays = {};
  availabilityRows.forEach(row => {
    if (row[1]) availabilityDays[String(row[1])] = isActive_(row[2]);
  });



  return {

    brandName:
      values.brandName
      || 'Primeira Fornada',

    heroTitle:
      values.heroTitle
      || 'Primeira Fornada',

    heroSubtitle:
      values.heroSubtitle
      || '',

    description:
      values.description
      || '',

    flavors,

    flavorItems,

    sizes,

    payments,

    availability: {
      enabled: isConfigTrue_(values.ordersEnabled, true),
      days: {
        monday: availabilityDays.monday === true,
        tuesday: availabilityDays.tuesday === true,
        wednesday: availabilityDays.wednesday === true,
        thursday: availabilityDays.thursday === true,
        friday: availabilityDays.friday === true,
        saturday: availabilityDays.saturday === true,
        sunday: availabilityDays.sunday === true
      },
      deliveryDay: normalizeBusinessDay_(values.deliveryDay, 'sunday'),
      paymentDeadlineDay: normalizeBusinessDay_(values.paymentDeadlineDay, 'thursday'),
      paymentDeadlineTime: normalizeTime_(values.paymentDeadlineTime)
    },

    orderStatuses: PF_ORDER.statuses.slice(),

    spreadsheetUrl: ss.getUrl(),

    revision: getConfigRevision_()

  };

}

function getPublicConfig_() {
  const config = getConfig_();
  const orderWindow = getOrderWindow_(config, currentBusinessDate_());
  return {
    brandName: config.brandName,
    heroTitle: config.heroTitle,
    heroSubtitle: config.heroSubtitle,
    description: config.description,
    flavors: config.flavors,
    sizes: config.sizes.filter(item => item.active !== false).map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price
    })),
    payments: config.payments.filter(item => item.active !== false).map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      description: item.description,
      paymentLink: safePaymentStorage_(item.paymentLink, false),
      active: true
    })),
    availability: config.availability,
    orderWindow: {
      open: orderWindow.open,
      code: orderWindow.code,
      message: orderWindow.message,
      deliveryDate: orderWindow.deliveryDateText,
      deadline: orderWindow.deadlineText,
      serverNow: orderWindow.serverNow
    }
  };
}

function allowedPaymentHosts_() {
  const raw = PropertiesService.getScriptProperties().getProperty('PAYMENT_ALLOWED_HOSTS') || '';
  return raw.split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
}

function validatePaymentUrl_(value, strict) {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^https:\/\/([a-z0-9.-]+)(?::\d{1,5})?(?:[\/?#]|$)/i);
  if (!match) {
    if (strict) throw apiError_('INVALID_PAYMENT_URL', 'Um link de pagamento informado nao e valido.');
    return '';
  }
  const hostname = match[1].toLowerCase();
  const allowedHosts = allowedPaymentHosts_();
  if (allowedHosts.length && !allowedHosts.some(host => hostname === host || hostname.endsWith('.' + host))) {
    if (strict) throw apiError_('INVALID_PAYMENT_URL', 'O dominio do link de pagamento nao esta autorizado.');
    return '';
  }
  return text;
}

function safePaymentStorage_(value, strict) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.__sizeLinks === true && parsed.links && typeof parsed.links === 'object') {
      const links = {};
      Object.keys(parsed.links).forEach(sizeId => {
        const safeUrl = validatePaymentUrl_(parsed.links[sizeId], strict);
        if (safeUrl) links[String(sizeId)] = safeUrl;
      });
      return JSON.stringify({ __sizeLinks: true, links });
    }
  } catch (error) {
    if (error && error.code === 'INVALID_PAYMENT_URL') throw error;
  }
  return validatePaymentUrl_(raw, strict);
}



/* Implementação integral anterior mantida apenas como referência de migração.
function saveConfigLegacy_(config) {

  validateBusinessConfig_(config && config.availability);

  const ss = getSpreadsheet_();


  const configRows = [

    [
      'brandName',
      config.brandName
      || 'Primeira Fornada'
    ],

    [
      'heroTitle',
      config.heroTitle
      || 'Primeira Fornada'
    ],

    [
      'heroSubtitle',
      config.heroSubtitle
      || ''
    ],

    [
      'description',
      config.description
      || ''
    ],

    [
      'ordersEnabled',
      config.availability && config.availability.enabled !== false
    ],

    [
      'deliveryDay',
      config.availability && config.availability.deliveryDay
      || 'sunday'
    ],

    [
      'paymentDeadlineDay',
      config.availability && config.availability.paymentDeadlineDay
      || 'thursday'
    ],

    [
      'paymentDeadlineTime',
      config.availability && config.availability.paymentDeadlineTime
      || '23:59:59'
    ]

  ];

  const managedKeys = configRows.map(row => row[0]);
  const preservedConfigRows = dataRows_(ss.getSheetByName(PF.sheets.config))
    .filter(row => row[0] && !managedKeys.includes(String(row[0])));
  configRows.push(...preservedConfigRows.map(row => [String(row[0]), row[1]]));


  replaceRows_(
    ss.getSheetByName(
      PF.sheets.config
    ),
    configRows
  );



  const flavorRows =
    (config.flavors || [])
    .map(
      (name, index) => [

        slug_(name)
        || 'sabor-' + (index + 1),

        String(name),

        true,

        index + 1

      ]
    );


  replaceRows_(
    ss.getSheetByName(
      PF.sheets.flavors
    ),
    flavorRows
  );



  const sizeRows =
    (config.sizes || [])
    .map(
      (item, index) => [

        item.id
        || 'tam-' + (index + 1),

        item.name || '',

        item.description || '',

        Number(
          item.price || 0
        ),

        true,

        index + 1

      ]
    );


  replaceRows_(
    ss.getSheetByName(
      PF.sheets.sizes
    ),
    sizeRows
  );



  const paymentSheet = ss.getSheetByName(PF.sheets.payments);
  const existingPayments = dataRows_(paymentSheet);
  const existingPaymentLinks = {};
  existingPayments.forEach(row => {
    existingPaymentLinks[String(row[0])] = String(row[4] || '');
  });

  const paymentRows = (config.payments || []).map((item, index) => {
    const payment = typeof item === 'string'
      ? { id: index === 0 ? 'pix' : 'card', name: index === 0 ? 'PIX' : 'Cartão', type: index === 0 ? 'pix' : 'card', description: index === 0 ? 'Pagamento via PIX' : 'Crédito ou débito', active: true, paymentLink: '' }
      : item;
    const id = payment.id || (payment.type === 'pix' ? 'pix' : 'card');
    return [
      id,
      payment.name || (payment.type === 'pix' ? 'PIX' : 'Cartão'),
      payment.type || (id === 'pix' ? 'pix' : 'card'),
      payment.description || (id === 'pix' ? 'Pagamento via PIX' : 'Crédito ou débito'),
      safePaymentStorage_(payment.paymentLink || existingPaymentLinks[id] || '', true),
      payment.active !== false,
      index + 1
    ];
  });


  replaceRows_(
    ss.getSheetByName(
      PF.sheets.payments
    ),
    paymentRows
  );

  const availability = config.availability || {};
  replaceRows_(ss.getSheetByName(PF.sheets.availability), [
    ['Segunda-feira', 'monday', !!availability.days?.monday, 1],
    ['Terça-feira', 'tuesday', !!availability.days?.tuesday, 2],
    ['Quarta-feira', 'wednesday', !!availability.days?.wednesday, 3],
    ['Quinta-feira', 'thursday', !!availability.days?.thursday, 4],
    ['Sexta-feira', 'friday', !!availability.days?.friday, 5],
    ['Sábado', 'saturday', !!availability.days?.saturday, 6],
    ['Domingo', 'sunday', !!availability.days?.sunday, 7]
  ]);

}

*/
function validateBusinessConfig_(availability) {
  if (!availability || typeof availability !== 'object' || Array.isArray(availability)) {
    throw apiError_('INVALID_AVAILABILITY', 'A configuração de disponibilidade não é válida.');
  }
  if (!PF_ORDER.weekdays.includes(String(availability.deliveryDay || ''))) {
    throw apiError_('INVALID_DELIVERY_DAY', 'O dia de entrega configurado não é válido.');
  }
  if (!PF_ORDER.weekdays.includes(String(availability.paymentDeadlineDay || ''))) {
    throw apiError_('INVALID_DEADLINE_DAY', 'O dia do prazo de pagamento não é válido.');
  }
  if (!isValidTime_(availability.paymentDeadlineTime, true)) {
    throw apiError_('INVALID_DEADLINE_TIME', 'O horário-limite configurado não é válido.');
  }
}

function getConfigRevision_() {
  return String(PropertiesService.getScriptProperties().getProperty(PF_CONFIG.revisionProperty) || '1');
}

function setConfigRevision_(revision) {
  PropertiesService.getScriptProperties().setProperty(PF_CONFIG.revisionProperty, String(revision));
}

function nextConfigRevision_(revision) {
  const numeric = Number(revision);
  return String(isFinite(numeric) ? numeric + 1 : new Date().getTime());
}

function configConflictError_(currentRevision) {
  const error = apiError_('CONFIG_CONFLICT', 'As configurações foram alteradas em outra sessão. Seu trabalho foi preservado; recarregue antes de salvar novamente.');
  error.currentRevision = String(currentRevision);
  return error;
}

function saveConfig_(config, revision) {
  return saveConfigDomain_('all', config || {}, revision);
}

function saveConfigDomain_(domain, data, expectedRevision) {
  const normalizedDomain = String(domain || '');
  if (!PF_CONFIG.domains.concat(['all']).includes(normalizedDomain)) {
    throw apiError_('INVALID_CONFIG_DOMAIN', 'O domínio de configuração informado não é válido.');
  }
  if (expectedRevision === undefined || expectedRevision === null || expectedRevision === '') {
    throw apiError_('CONFIG_REVISION_REQUIRED', 'A revisão da configuração é obrigatória.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const recoveryRequired = PropertiesService.getScriptProperties().getProperty(PF_CONFIG.recoveryProperty);
    if (recoveryRequired) {
      throw apiError_('CONFIG_RECOVERY_REQUIRED', 'Uma recuperação administrativa está pendente. Restaure um snapshot antes de realizar novos salvamentos.');
    }
    const currentRevision = getConfigRevision_();
    if (String(expectedRevision) !== currentRevision) throw configConflictError_(currentRevision);

    const ss = getSpreadsheet_();
    const snapshot = captureConfigSnapshot_(ss);
    const backupId = persistConfigBackup_(ss, snapshot, currentRevision, normalizedDomain);
    try {
      applyConfigDomain_(ss, normalizedDomain, data || {});
      SpreadsheetApp.flush();
      const nextRevision = nextConfigRevision_(currentRevision);
      setConfigRevision_(nextRevision);
      markConfigBackupState_(ss, backupId, 'committed');
      const persisted = getConfig_();
      return { config: persisted, revision: nextRevision, backupId };
    } catch (saveError) {
      try {
        restoreConfigSnapshot_(ss, snapshot);
        SpreadsheetApp.flush();
        setConfigRevision_(currentRevision);
        markConfigBackupState_(ss, backupId, 'recovered');
      } catch (recoveryError) {
        markConfigBackupStateSafe_(ss, backupId, 'recovery_failed');
        PropertiesService.getScriptProperties().setProperty(PF_CONFIG.recoveryProperty, backupId);
        const fatal = apiError_('CONFIG_RECOVERY_FAILED', 'O salvamento falhou e a recuperação automática não foi concluída. Não tente salvar novamente antes de revisar a planilha de teste.');
        fatal.cause = recoveryError;
        throw fatal;
      }
      if (saveError && saveError.code) throw saveError;
      const recovered = apiError_('CONFIG_SAVE_FAILED', 'O salvamento falhou. A configuração anterior foi restaurada e a revisão não foi alterada.');
      recovered.cause = saveError;
      throw recovered;
    }
  } finally {
    lock.releaseLock();
  }
}

function applyConfigDomain_(ss, domain, data) {
  if (domain === 'brand' || domain === 'all') writeBrandConfig_(ss, data);
  if (domain === 'flavors' || domain === 'catalog' || domain === 'all') writeFlavorConfig_(ss, data);
  if (domain === 'sizes' || domain === 'catalog' || domain === 'all') writeSizeConfig_(ss, data);
  if (domain === 'catalog' && Array.isArray(data.payments)) writePaymentConfig_(ss, data);
  if (domain === 'payments' || domain === 'all') writePaymentConfig_(ss, data);
  if (domain === 'availability' || domain === 'all') writeAvailabilityConfig_(ss, data);
}

function writeBrandConfig_(ss, data) {
  updateConfigValues_(ss.getSheetByName(PF.sheets.config), {
    brandName: sheetSafeText_(clean_(data.brandName) || 'Primeira Fornada'),
    heroTitle: sheetSafeText_(clean_(data.heroTitle) || clean_(data.brandName) || 'Primeira Fornada'),
    heroSubtitle: sheetSafeText_(clean_(data.heroSubtitle)),
    description: sheetSafeText_(clean_(data.description))
  });
}

function writeAvailabilityConfig_(ss, data) {
  const availability = data.availability || data;
  validateBusinessConfig_(availability);
  updateConfigValues_(ss.getSheetByName(PF.sheets.config), {
    ordersEnabled: availability.enabled !== false,
    deliveryDay: availability.deliveryDay,
    paymentDeadlineDay: availability.paymentDeadlineDay,
    paymentDeadlineTime: normalizeTime_(availability.paymentDeadlineTime)
  });
  replaceRows_(ss.getSheetByName(PF.sheets.availability), [
    ['Segunda-feira', 'monday', !!availability.days?.monday, 1],
    ['Terça-feira', 'tuesday', !!availability.days?.tuesday, 2],
    ['Quarta-feira', 'wednesday', !!availability.days?.wednesday, 3],
    ['Quinta-feira', 'thursday', !!availability.days?.thursday, 4],
    ['Sexta-feira', 'friday', !!availability.days?.friday, 5],
    ['Sábado', 'saturday', !!availability.days?.saturday, 6],
    ['Domingo', 'sunday', !!availability.days?.sunday, 7]
  ]);
}

function updateConfigValues_(sheet, updates) {
  const rows = dataRows_(sheet).map(row => [String(row[0] || ''), row[1]]).filter(row => row[0]);
  const indexes = {};
  rows.forEach((row, index) => { indexes[row[0]] = index; });
  Object.keys(updates).forEach(key => {
    if (indexes[key] === undefined) {
      indexes[key] = rows.length;
      rows.push([key, updates[key]]);
    } else {
      rows[indexes[key]][1] = updates[key];
    }
  });
  replaceRows_(sheet, rows);
}

function writeFlavorConfig_(ss, data) {
  const sheet = ss.getSheetByName(PF.sheets.flavors);
  const existing = dataRows_(sheet);
  const incoming = Array.isArray(data.flavorItems)
    ? data.flavorItems
    : (data.flavors || []).map((name, index) => ({ id: '', name, active: true, order: index + 1 }));
  const existingById = {};
  const existingByName = {};
  existing.forEach(row => {
    existingById[readableSheetText_(row[0])] = row;
    existingByName[readableSheetText_(row[1]).toLowerCase()] = row;
  });
  const used = {};
  const rows = incoming.filter(item => item && clean_(item.name)).map((item, index) => {
    const old = existingById[clean_(item.id)] || existingByName[clean_(item.name).toLowerCase()];
    const id = clean_(item.id) || String(old && old[0] || '') || slug_(item.name) || 'sabor-' + (index + 1);
    if (used[id]) throw apiError_('DUPLICATE_CONFIG_ID', 'Existem sabores com o mesmo identificador.');
    used[id] = true;
    return [sheetSafeText_(id), sheetSafeText_(clean_(item.name)), item.active !== false, Number(item.order || index + 1)];
  });
  existing.forEach(row => {
    const id = readableSheetText_(row[0]);
    if (id && !used[id]) rows.push([sheetSafeText_(id), sheetSafeText_(readableSheetText_(row[1])), false, Number(row[3] || rows.length + 1)]);
  });
  replaceRows_(sheet, rows);
}

function writeSizeConfig_(ss, data) {
  const sheet = ss.getSheetByName(PF.sheets.sizes);
  const existing = dataRows_(sheet);
  const incoming = Array.isArray(data.sizes) ? data.sizes : [];
  const existingById = {};
  existing.forEach(row => { existingById[readableSheetText_(row[0])] = row; });
  const used = {};
  const rows = incoming.filter(item => item && clean_(item.name)).map((item, index) => {
    const id = clean_(item.id) || 'tam-' + Utilities.getUuid().slice(0, 8);
    if (used[id]) throw apiError_('DUPLICATE_CONFIG_ID', 'Existem tamanhos com o mesmo identificador.');
    used[id] = true;
    const old = existingById[id];
    const price = Number(item.price);
    if (!isFinite(price) || price < 0) {
      throw apiError_('INVALID_SIZE_PRICE', 'O preço de um tamanho não é válido.');
    }
    return [
      sheetSafeText_(id),
      sheetSafeText_(clean_(item.name)),
      sheetSafeText_(clean_(item.description)),
      price,
      item.active !== false,
      Number(item.order || index + 1)
    ];
  });
  existing.forEach(row => {
    const id = readableSheetText_(row[0]);
    if (id && !used[id]) rows.push([sheetSafeText_(id), sheetSafeText_(readableSheetText_(row[1])), sheetSafeText_(readableSheetText_(row[2])), row[3], false, Number(row[5] || rows.length + 1)]);
  });
  replaceRows_(sheet, rows);
}

function writePaymentConfig_(ss, data) {
  const sheet = ss.getSheetByName(PF.sheets.payments);
  const existing = dataRows_(sheet);
  const existingById = {};
  existing.forEach(row => { existingById[readableSheetText_(row[0])] = row; });
  const used = {};
  const rows = (data.payments || []).filter(item => item && clean_(item.name)).map((item, index) => {
    const id = clean_(item.id) || 'payment-' + Utilities.getUuid().slice(0, 8);
    if (used[id]) throw apiError_('DUPLICATE_CONFIG_ID', 'Existem pagamentos com o mesmo identificador.');
    used[id] = true;
    const old = existingById[id];
    return [
      sheetSafeText_(id),
      sheetSafeText_(clean_(item.name)),
      sheetSafeText_(clean_(item.type) || readableSheetText_(old && old[2] || 'other')),
      sheetSafeText_(clean_(item.description)),
      sheetSafeText_(safePaymentStorage_(item.paymentLink || readableSheetText_(old && old[4] || ''), true)),
      item.active !== false,
      Number(item.order || index + 1)
    ];
  });
  existing.forEach(row => {
    const id = readableSheetText_(row[0]);
    if (id && !used[id]) rows.push([
      sheetSafeText_(id),
      sheetSafeText_(readableSheetText_(row[1])),
      sheetSafeText_(readableSheetText_(row[2])),
      sheetSafeText_(readableSheetText_(row[3])),
      sheetSafeText_(readableSheetText_(row[4])),
      false,
      Number(row[6] || rows.length + 1)
    ]);
  });
  replaceRows_(sheet, rows);
}

function captureConfigSnapshot_(ss) {
  const sheets = {};
  [PF.sheets.config, PF.sheets.flavors, PF.sheets.sizes, PF.sheets.payments, PF.sheets.availability].forEach(name => {
    const sheet = ss.getSheetByName(name);
    sheets[name] = sheet.getDataRange().getValues();
  });
  return { createdAt: new Date().toISOString(), sheets };
}

function serializeConfigSnapshot_(snapshot) {
  const sheets = {};
  Object.keys(snapshot.sheets || {}).forEach(name => {
    sheets[name] = (snapshot.sheets[name] || []).map(row => row.map(value =>
      value instanceof Date
        ? { __pfSnapshotType: 'date', value: value.toISOString() }
        : value
    ));
  });
  return { createdAt: snapshot.createdAt, sheets };
}

function deserializeConfigSnapshot_(snapshot) {
  const sheets = {};
  Object.keys(snapshot && snapshot.sheets || {}).forEach(name => {
    sheets[name] = (snapshot.sheets[name] || []).map(row => row.map(value =>
      value && typeof value === 'object' && value.__pfSnapshotType === 'date'
        ? new Date(value.value)
        : value
    ));
  });
  return { createdAt: snapshot && snapshot.createdAt || '', sheets };
}

function restoreConfigSnapshot_(ss, snapshot) {
  Object.keys(snapshot.sheets || {}).forEach(name => replaceSheetData_(ss.getSheetByName(name), snapshot.sheets[name]));
}

function replaceSheetData_(sheet, values) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  sheet.getRange(1, 1, lastRow, lastColumn).clearContent();
  if (values && values.length) sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
}

function ensureConfigBackupSheet_(ss) {
  let sheet = ss.getSheetByName(PF_CONFIG.backupSheet);
  if (!sheet) {
    sheet = ss.insertSheet(PF_CONFIG.backupSheet);
    sheet.getRange(1, 1, 1, PF_CONFIG.backupHeaders.length).setValues([PF_CONFIG.backupHeaders]);
    sheet.hideSheet();
  }
  return sheet;
}

function persistConfigBackup_(ss, snapshot, revision, domain) {
  const sheet = ensureConfigBackupSheet_(ss);
  const backupId = 'CFG-' + Utilities.formatDate(new Date(), PF_ORDER.timezone, 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 8);
  const serialized = JSON.stringify(serializeConfigSnapshot_(snapshot));
  const chunks = [];
  for (let offset = 0; offset < serialized.length; offset += PF_CONFIG.backupChunkSize) {
    chunks.push(serialized.slice(offset, offset + PF_CONFIG.backupChunkSize));
  }
  if (!chunks.length) chunks.push('{}');
  const createdAt = new Date();
  const rows = chunks.map((chunk, index) => [
    backupId, createdAt, String(revision), String(domain), sheetSafeText_(chunk), 'prepared', index + 1, chunks.length
  ]);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, PF_CONFIG.backupHeaders.length).setValues(rows);
  trimConfigBackups_(sheet);
  return backupId;
}

function trimConfigBackups_(sheet) {
  const rows = dataRows_(sheet);
  const ids = [];
  rows.forEach(row => {
    const id = String(row[0] || '');
    if (id && !ids.includes(id)) ids.push(id);
  });
  const removeIds = ids.slice(0, Math.max(0, ids.length - PF_CONFIG.backupRetention));
  if (!removeIds.length) return;
  let rowCount = 0;
  rows.forEach(row => { if (removeIds.includes(String(row[0] || ''))) rowCount += 1; });
  if (rowCount) sheet.deleteRows(2, rowCount);
}

function markConfigBackupState_(ss, backupId, state) {
  const sheet = ensureConfigBackupSheet_(ss);
  const rows = dataRows_(sheet);
  rows.forEach((row, index) => {
    if (String(row[0]) === String(backupId)) sheet.getRange(index + 2, 6).setValue(state);
  });
}

function markConfigBackupStateSafe_(ss, backupId, state) {
  try { markConfigBackupState_(ss, backupId, state); } catch (_) {}
}

function listConfigBackups_() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(PF_CONFIG.backupSheet);
  if (!sheet) return [];
  const seen = {};
  return dataRows_(sheet).reverse().filter(row => {
    const id = String(row[0] || '');
    if (!id || seen[id]) return false;
    seen[id] = true;
    return true;
  }).map(row => ({
      id: String(row[0] || ''),
      createdAt: row[1] instanceof Date ? row[1].toISOString() : String(row[1] || ''),
      revision: String(row[2] || ''),
      domain: String(row[3] || ''),
      state: String(row[5] || '')
    }));
}

function restoreConfigBackup_(backupId, expectedRevision) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const currentRevision = getConfigRevision_();
    if (String(expectedRevision || '') !== currentRevision) throw configConflictError_(currentRevision);
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(PF_CONFIG.backupSheet);
    if (!sheet) throw apiError_('BACKUP_NOT_FOUND', 'O snapshot solicitado não foi encontrado.');
    const backupRows = dataRows_(sheet)
      .filter(item => String(item[0]) === String(backupId))
      .sort((left, right) => Number(left[6] || 1) - Number(right[6] || 1));
    if (!backupRows.length) throw apiError_('BACKUP_NOT_FOUND', 'O snapshot solicitado não foi encontrado.');
    const target = deserializeConfigSnapshot_(JSON.parse(
      backupRows.map(row => readableSheetText_(row[4])).join('')
    ));
    const safetySnapshot = captureConfigSnapshot_(ss);
    const safetyBackupId = persistConfigBackup_(ss, safetySnapshot, currentRevision, 'restore-safety');
    try {
      restoreConfigSnapshot_(ss, target);
      SpreadsheetApp.flush();
      const nextRevision = nextConfigRevision_(currentRevision);
      setConfigRevision_(nextRevision);
      PropertiesService.getScriptProperties().deleteProperty(PF_CONFIG.recoveryProperty);
      markConfigBackupState_(ss, safetyBackupId, 'committed');
      return { config: getConfig_(), revision: nextRevision };
    } catch (restoreError) {
      try {
        restoreConfigSnapshot_(ss, safetySnapshot);
        SpreadsheetApp.flush();
        setConfigRevision_(currentRevision);
        markConfigBackupState_(ss, safetyBackupId, 'recovered');
      } catch (recoveryError) {
        markConfigBackupStateSafe_(ss, safetyBackupId, 'recovery_failed');
        throw apiError_('BACKUP_RESTORE_RECOVERY_FAILED', 'A restauração e a recuperação de segurança falharam. Revise a planilha antes de continuar.');
      }
      throw apiError_('BACKUP_RESTORE_FAILED', 'Não foi possível restaurar o snapshot; a configuração anterior foi recuperada.');
    }
  } finally {
    lock.releaseLock();
  }
}



/* Implementação anterior preservada temporariamente no histórico local durante a migração.
function createOrderLegacy_(body) {

  const customerName =
    clean_(
      body.customerName
      || body.name
      || body.cliente
    );


  const whatsapp =
    clean_(
      body.whatsapp
      || body.phone
    );


  const time =
    clean_(body.time);

  const flavor = clean_(body.flavor);
  const sizeId = clean_(body.sizeId);
  const payment = clean_(body.payment);
  const notes = clean_(body.notes || body.observations);

  if (
    !/^\d{2}:\d{2}$/
      .test(time)
  ) {

    throw new Error(
      'Horário inválido.'
    );

  }



  const config =
    getConfig_();

  const now = currentBusinessDate_();
  const timezone = 'America/Sao_Paulo';
  const dayNumber = Number(Utilities.formatDate(now, timezone, 'u'));
  const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const currentDay = dayKeys[dayNumber - 1];

  if (!config.availability.enabled || !config.availability.days[currentDay]) {
    throw apiError_('ORDERS_CLOSED', 'Os pedidos estão encerrados no momento.');
  }



  if (
    !config.flavors
      .includes(flavor)
  ) {

    throw new Error(
      'Sabor indisponível.'
    );

  }



  const paymentOption = config.payments.find(item => item.id === payment || item.name === payment);

  if (!paymentOption) {

    throw new Error(
      'Forma de pagamento indisponível.'
    );

  }



  const size =
    config.sizes.find(
      item =>
        String(item.id)
        === sizeId
    );


  if (!size) {

    throw new Error(
      'Tamanho indisponível.'
    );

  }



  const sheet =
    getSpreadsheet_()
      .getSheetByName(
        PF.sheets.orders
      );


  const orderId =
    makeOrderId_();


  const createdAt = now;
  const deliveryDate = nextDeliverySunday_(createdAt, config.availability.deliveryDay);



  const row = [

    orderId,

    createdAt,

    customerName,

    whatsapp,

    deliveryDate,

    time,

    flavor,

    size.id,

    size.name,

    size.description || '',

    Number(
      size.price || 0
    ),

    paymentOption.name,

    notes,

    'Aguardando pagamento',

    clean_(
      body.source || 'site'
    )

  ];



  const lock =
    LockService.getScriptLock();


  lock.waitLock(10000);


  try {

    sheet.appendRow(row);

  } finally {

    lock.releaseLock();

  }



  return {

    id: orderId,

    createdAt:
      createdAt.toISOString(),

    customerName,

    whatsapp,

    date: Utilities.formatDate(deliveryDate, timezone, 'yyyy-MM-dd'),
    deliveryDate: Utilities.formatDate(deliveryDate, timezone, 'yyyy-MM-dd'),

    time,

    flavor,

    sizeId: size.id,

    size: size.name,

    description:
      size.description || '',

    price:
      Number(
        size.price || 0
      ),

    payment: paymentOption.name,

    notes,

    status: 'Aguardando pagamento'

  };

}



*/
function createOrder_(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw apiError_('INVALID_ORDER', 'Os dados do pedido não são válidos.');
  }

  const customerName = orderText_(body, ['customerName', 'name', 'cliente'], 'nome', PF_ORDER.maxNameLength, true);
  const whatsapp = orderText_(body, ['whatsapp', 'phone'], 'WhatsApp', PF_ORDER.maxWhatsappLength, true);
  const flavor = orderText_(body, ['flavor'], 'sabor', 120, true);
  const sizeId = orderText_(body, ['sizeId'], 'tamanho', 80, true);
  const payment = orderText_(body, ['payment'], 'forma de pagamento', 120, true);
  const time = orderText_(body, ['time'], 'horário', 5, true);
  const notes = orderText_(body, ['notes', 'observations'], 'observações', PF_ORDER.maxNotesLength, false);
  const source = orderText_(body, ['source'], 'origem', PF_ORDER.maxSourceLength, false) || 'site';
  const idempotencyKey = orderText_(body, ['idempotencyKey'], 'chave de reenvio', PF_ORDER.maxIdempotencyKeyLength, true);
  const requestedDate = orderText_(body, ['date'], 'data desejada', 10, false);
  const honeypot = orderText_(body, ['website'], 'campo auxiliar', 200, false);

  if (honeypot) throw apiError_('INVALID_ORDER', 'Não foi possível validar o pedido.');
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    throw apiError_('INVALID_IDEMPOTENCY_KEY', 'Não foi possível identificar esta tentativa de pedido. Atualize a página e tente novamente.');
  }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw apiError_('INVALID_TIME', 'Informe um horário válido.');
  }
  if (!/^\d{10,11}$/.test(whatsapp.replace(/\D/g, ''))) {
    throw apiError_('INVALID_WHATSAPP', 'Informe um WhatsApp válido com DDD.');
  }
  if (requestedDate && !isValidIsoDate_(requestedDate)) {
    throw apiError_('INVALID_DATE', 'Informe uma data válida.');
  }

  const sheet = getSpreadsheet_().getSheetByName(PF.sheets.orders);
  const orderId = makeIdempotentOrderId_(idempotencyKey);
  const duplicateLock = LockService.getScriptLock();
  duplicateLock.waitLock(10000);
  try {
    const existingRow = findOrderRowById_(sheet, orderId);
    if (existingRow) return orderResponseFromRow_(existingRow, PF_ORDER.timezone, true);
  } finally {
    duplicateLock.releaseLock();
  }

  const config = getConfig_();
  const now = currentBusinessDate_();
  const timezone = PF_ORDER.timezone;
  const orderWindow = getOrderWindow_(config, now);
  if (!orderWindow.open) throw apiError_(orderWindow.code, orderWindow.message);
  if (!config.flavors.includes(flavor)) {
    throw apiError_('INVALID_FLAVOR', 'O sabor selecionado não está disponível.');
  }

  const paymentOption = config.payments.find(item =>
    (String(item.id) === payment || String(item.name) === payment) && item.active !== false
  );
  if (!paymentOption) {
    throw apiError_('INVALID_PAYMENT', 'A forma de pagamento selecionada não está disponível.');
  }

  const size = config.sizes.find(item => String(item.id) === sizeId && item.active !== false);
  if (!size) throw apiError_('INVALID_SIZE', 'O tamanho selecionado não está disponível.');
  const numericPrice = Number(size.price);
  if (!isFinite(numericPrice) || numericPrice < 0) {
    throw apiError_('INVALID_CATALOG', 'Não foi possível calcular o valor deste pedido.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const existingRow = findOrderRowById_(sheet, orderId);
    if (existingRow) return orderResponseFromRow_(existingRow, timezone, true);

    enforceOrderRateLimit_(idempotencyKey);
    const deliveryDate = orderWindow.deliveryDate;
    const row = [
      orderId,
      now,
      sheetSafeText_(customerName),
      sheetSafeText_(whatsapp),
      deliveryDate,
      time,
      sheetSafeText_(flavor),
      sheetSafeText_(String(size.id)),
      sheetSafeText_(String(size.name || '')),
      sheetSafeText_(String(size.description || '')),
      numericPrice,
      sheetSafeText_(String(paymentOption.name || '')),
      sheetSafeText_(notes),
      PF_ORDER.initialStatus,
      sheetSafeText_(source)
    ];
    sheet.appendRow(row);
    return orderResponseFromRow_(row, timezone, false);
  } finally {
    lock.releaseLock();
  }
}

function orderText_(body, keys, label, maxLength, required) {
  let value;
  for (let index = 0; index < keys.length; index += 1) {
    if (body[keys[index]] !== undefined && body[keys[index]] !== null) {
      value = body[keys[index]];
      break;
    }
  }
  if (value !== undefined && typeof value !== 'string') {
    throw apiError_('INVALID_ORDER_FIELD', 'O campo ' + label + ' não possui um formato válido.');
  }
  const text = clean_(value);
  if (required && !text) throw apiError_('REQUIRED_ORDER_FIELD', 'Informe ' + label + '.');
  if (text.length > maxLength) {
    throw apiError_('ORDER_FIELD_TOO_LONG', 'O campo ' + label + ' excede o limite permitido.');
  }
  return text;
}

function isValidIsoDate_(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0]
    && date.getUTCMonth() === parts[1] - 1
    && date.getUTCDate() === parts[2];
}

function makeIdempotentOrderId_(key) {
  return 'PF-I-' + hashCredential_(key).replace(/[^A-Za-z0-9]/g, '').slice(0, 26).toUpperCase();
}

function findOrderRowById_(sheet, orderId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const rows = sheet.getRange(2, 1, lastRow - 1, PF.headers.Pedidos.length).getValues();
  for (let index = 0; index < rows.length; index += 1) {
    if (String(rows[index][0] || '') === orderId) return rows[index];
  }
  return null;
}

function sheetSafeText_(value) {
  const text = String(value == null ? '' : value);
  return /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
}

function readableSheetText_(value) {
  const text = String(value == null ? '' : value);
  return /^'[\s]*[=+\-@]/.test(text) ? text.slice(1) : text;
}

function orderResponseFromRow_(row, timezone, duplicate) {
  const createdAt = row[1] instanceof Date ? row[1] : new Date(row[1]);
  const deliveryDate = row[4] instanceof Date ? row[4] : new Date(row[4]);
  const validCreatedAt = !isNaN(createdAt.getTime());
  const validDeliveryDate = !isNaN(deliveryDate.getTime());
  return {
    id: String(row[0] || ''),
    createdAt: validCreatedAt ? createdAt.toISOString() : String(row[1] || ''),
    customerName: readableSheetText_(row[2]),
    whatsapp: readableSheetText_(row[3]),
    date: validDeliveryDate ? Utilities.formatDate(deliveryDate, timezone, 'yyyy-MM-dd') : String(row[4] || ''),
    deliveryDate: validDeliveryDate ? Utilities.formatDate(deliveryDate, timezone, 'yyyy-MM-dd') : String(row[4] || ''),
    time: String(row[5] || ''),
    flavor: readableSheetText_(row[6]),
    sizeId: readableSheetText_(row[7]),
    size: readableSheetText_(row[8]),
    description: readableSheetText_(row[9]),
    price: Number(row[10] || 0),
    payment: readableSheetText_(row[11]),
    notes: readableSheetText_(row[12]),
    status: String(row[13] || ''),
    duplicate: duplicate === true
  };
}

function enforceOrderRateLimit_(idempotencyKey) {
  const cache = CacheService.getScriptCache();
  const key = PF_ORDER.rateKeyPrefix + hashCredential_(idempotencyKey).slice(0, 24);
  const perKey = Number(cache.get(key) || 0) + 1;
  const global = Number(cache.get(PF_ORDER.rateGlobalKey) || 0) + 1;
  cache.put(key, String(perKey), 5 * 60);
  cache.put(PF_ORDER.rateGlobalKey, String(global), 60);
  if (perKey > PF_ORDER.maxAttemptsPerKey || global > PF_ORDER.maxGlobalAttemptsPerMinute) {
    throw apiError_('ORDER_RATE_LIMIT', 'Muitas tentativas foram recebidas. Aguarde um momento e tente novamente.');
  }
}

function getOrders_() {

  const ss =
    getSpreadsheet_();


  const sheet =
    ss.getSheetByName(
      PF.sheets.orders
    );


  const rows =
    dataRows_(sheet);


  const tz =
    ss.getSpreadsheetTimeZone();



  return rows
    .reverse()
    .map(
      row => ({

        id:
          String(
            row[0] || ''
          ),

        createdAt:
          row[1] instanceof Date

          ? row[1].toISOString()

          : String(
              row[1] || ''
            ),

        customerName:
          readableSheetText_(row[2]),

        whatsapp:
          readableSheetText_(row[3]),

        date:
          row[4] instanceof Date

          ? Utilities.formatDate(
              row[4],
              tz,
              'yyyy-MM-dd'
            )

          : String(
              row[4] || ''
            ),

        time:
          String(
            row[5] || ''
          ),

        flavor:
          readableSheetText_(row[6]),

        sizeId:
          readableSheetText_(row[7]),

        size:
          readableSheetText_(row[8]),

        description:
          readableSheetText_(row[9]),

        price:
          Number(
            row[10] || 0
          ),

        payment:
          readableSheetText_(row[11]),

        notes:
          readableSheetText_(row[12]),

        status:
          String(
            row[13]
            || PF_ORDER.initialStatus
          ),

        source:
          readableSheetText_(row[14])

      })
    );

}



function updateOrderStatus_(
  orderId,
  status
) {

  const allowed = PF_ORDER.statuses;


  if (
    !allowed.includes(status)
  ) {

    throw new Error(
      'Status inválido.'
    );

  }



  const sheet =
    getSpreadsheet_()
      .getSheetByName(
        PF.sheets.orders
      );


  const lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {

    throw new Error(
      'Pedido não encontrado.'
    );

  }



  const ids =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getValues();



  const index =
    ids.findIndex(
      row =>
        String(row[0])
        === String(orderId)
    );



  if (index === -1) {

    throw new Error(
      'Pedido não encontrado.'
    );

  }



  const rowNumber =
    index + 2;


  sheet
    .getRange(
      rowNumber,
      14
    )
    .setValue(status);



  return {

    id: String(orderId),

    status

  };

}



function seedDefaults_(ss) {

  if (
    ss
      .getSheetByName(
        PF.sheets.config
      )
      .getLastRow()
      === 1
  ) {

    replaceRows_(

      ss.getSheetByName(
        PF.sheets.config
      ),

      [

        [
          'brandName',
          'Primeira Fornada'
        ],

        [
          'heroTitle',
          'Primeira Fornada'
        ],

        [
          'heroSubtitle',
          'Estamos começando uma nova fase por aqui. 💛'
        ],

        [
          'description',
          'Produção artesanal e limitada, somente por encomenda. Preencha o formulário para reservar o seu bolo.'
        ]

      ]

    );

  }



  if (
    ss
      .getSheetByName(
        PF.sheets.flavors
      )
      .getLastRow()
      === 1
  ) {

    replaceRows_(

      ss.getSheetByName(
        PF.sheets.flavors
      ),

      [

        [
          'ninho-morango',
          'Ninho com morango',
          true,
          1
        ],

        [
          'chocolate',
          'Chocolate',
          true,
          2
        ],

        [
          'prestigio',
          'Prestígio',
          true,
          3
        ],

        [
          'cenoura-brigadeiro',
          'Cenoura com brigadeiro',
          true,
          4
        ]

      ]

    );

  }



  if (
    ss
      .getSheetByName(
        PF.sheets.sizes
      )
      .getLastRow()
      === 1
  ) {

    replaceRows_(

      ss.getSheetByName(
        PF.sheets.sizes
      ),

      [

        [
          'p',
          'Pequeno',
          'Serve aproximadamente 8 pessoas',
          89,
          true,
          1
        ],

        [
          'm',
          'Médio',
          'Serve aproximadamente 15 pessoas',
          129,
          true,
          2
        ],

        [
          'g',
          'Grande',
          'Serve aproximadamente 25 pessoas',
          179,
          true,
          3
        ],

        [
          'gg',
          'Festa',
          'Serve aproximadamente 35 pessoas',
          239,
          true,
          4
        ]

      ]

    );

  }



  if (ss.getSheetByName(PF.sheets.payments).getLastRow() === 1) {

    replaceRows_(

      ss.getSheetByName(
        PF.sheets.payments
      ),

      [

        ['pix', 'PIX', 'pix', 'Pagamento via PIX', '', true, 1],
        ['card', 'Cartão', 'card', 'Crédito ou débito', '', true, 2]

      ]

    );

  }

  const availabilitySheet = ss.getSheetByName(PF.sheets.availability);
  if (availabilitySheet.getLastRow() === 1) {
    replaceRows_(availabilitySheet, [
      ['Segunda-feira', 'monday', true, 1],
      ['Terça-feira', 'tuesday', true, 2],
      ['Quarta-feira', 'wednesday', true, 3],
      ['Quinta-feira', 'thursday', true, 4],
      ['Sexta-feira', 'friday', false, 5],
      ['Sábado', 'saturday', false, 6],
      ['Domingo', 'sunday', false, 7]
    ]);
  }

  ensureConfigDefaults_(ss);

}



function ensureSheet_(
  ss,
  name,
  headers
) {

  let sheet =
    ss.getSheetByName(name);


  if (!sheet) {

    sheet =
      ss.insertSheet(name);

  }


  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setValues([
      headers
    ]);

}



function formatSheets_(ss) {

  Object
    .values(PF.sheets)
    .forEach(
      name => {

        const sheet =
          ss.getSheetByName(name);

        const lastColumn =
          sheet.getLastColumn();

        sheet.setFrozenRows(1);

        sheet
          .getRange(
            1,
            1,
            1,
            lastColumn
          )
          .setFontWeight('bold');

        sheet.autoResizeColumns(
          1,
          lastColumn
        );

      }
    );


  ss
    .getSheetByName(
      PF.sheets.sizes
    )
    .getRange('D2:D')
    .setNumberFormat(
      'R$ #,##0.00'
    );


  ss
    .getSheetByName(
      PF.sheets.orders
    )
    .getRange('B2:B')
    .setNumberFormat(
      'dd/MM/yyyy HH:mm:ss'
    );


  ss
    .getSheetByName(
      PF.sheets.orders
    )
    .getRange('E2:E')
    .setNumberFormat(
      'dd/MM/yyyy'
    );


  ss
    .getSheetByName(
      PF.sheets.orders
    )
    .getRange('K2:K')
    .setNumberFormat(
      'R$ #,##0.00'
    );

}



function getSpreadsheet_() {

  const id =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'SPREADSHEET_ID'
      );


  if (!id) {

    throw new Error(
      'Execute setupProject() antes de publicar o Web App.'
    );

  }


  return SpreadsheetApp
    .openById(id);

}



function dataRows_(sheet) {

  const lastRow =
    sheet.getLastRow();

  const lastColumn =
    sheet.getLastColumn();


  if (lastRow < 2) {

    return [];

  }


  return sheet
    .getRange(
      2,
      1,
      lastRow - 1,
      lastColumn
    )
    .getValues();

}



function replaceRows_(
  sheet,
  rows
) {

  const lastRow =
    sheet.getLastRow();


  if (lastRow > 1) {

    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        sheet.getLastColumn()
      )
      .clearContent();

  }


  if (rows.length) {

    sheet
      .getRange(
        2,
        1,
        rows.length,
        rows[0].length
      )
      .setValues(rows);

  }

}



function parseBody_(e) {

  const raw =
    e &&
    e.postData &&
    e.postData.contents

    ? e.postData.contents

    : '';


  if (!raw) {

    return e &&
      e.parameter

      ? e.parameter

      : {};

  }


  try {

    return JSON.parse(raw);

  } catch (_) {

    return e &&
      e.parameter

      ? e.parameter

      : {};

  }

}

function validatePostSize_(e, maxBytes) {
  const raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
  if (!raw) return;
  const bytes = Utilities.newBlob(raw).getBytes().length;
  if (bytes > maxBytes) {
    throw apiError_('REQUEST_TOO_LARGE', 'A requisição excede o tamanho permitido.');
  }
}

function validateObjectSize_(value, maxBytes) {
  const bytes = Utilities.newBlob(JSON.stringify(value || {})).getBytes().length;
  if (bytes > maxBytes) {
    throw apiError_('REQUEST_TOO_LARGE', 'O pedido excede o tamanho permitido.');
  }
}



function json_(data) {

  return ContentService
    .createTextOutput(
      JSON.stringify(data)
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );

}



function clean_(value) {

  return String(
    value == null
      ? ''
      : value
  ).trim();

}



function isActive_(value) {

  if (value === true) {

    return true;

  }


  const normalized =
    String(
      value || ''
    )
      .trim()
      .toLowerCase();


  return [
    'true',
    '1',
    'sim',
    'yes',
    'ativo'
  ].includes(normalized);

}



function slug_(value) {

  return String(
    value || ''
  )

    .normalize('NFD')

    .replace(
      /[\u0300-\u036f]/g,
      ''
    )

    .toLowerCase()

    .replace(
      /[^a-z0-9]+/g,
      '-'
    )

    .replace(
      /^-|-$/g,
      ''
    );

}



function ymdToDate_(text) {

  const parts =
    String(text)
      .split('-')
      .map(Number);


  return new Date(
    parts[0],
    parts[1] - 1,
    parts[2],
    12,
    0,
    0
  );

}



function makeOrderId_() {

  const stamp =
    Utilities.formatDate(
      new Date(),
      'America/Sao_Paulo',
      'yyyyMMdd-HHmmss'
    );


  const suffix =
    Utilities
      .getUuid()
      .slice(0, 6)
      .toUpperCase();


  return (
    'PF-'
    + stamp
    + '-'
    + suffix
  );

}


function isConfigTrue_(value, fallback) {

  if (value === '' || value == null) return fallback;
  return isActive_(value);

}


function normalizeTime_(value) {

  if (value instanceof Date) {
    return Utilities.formatDate(
      value,
      'America/Sao_Paulo',
      'HH:mm:ss'
    );
  }

  const text = String(value || '').trim();

  if (!text) {
    return '23:59:59';
  }

  return isValidTime_(text, true) ? (text.length === 5 ? text + ':00' : text) : '23:59:59';

}

function isValidTime_(value, allowSeconds) {
  const pattern = allowSeconds
    ? /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/
    : /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  return pattern.test(String(value || '').trim());
}

function currentBusinessDate_() {
  return new Date();
}
