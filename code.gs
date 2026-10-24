const PF = {
  sheets: {
    config: 'Configuracoes',
    flavors: 'Sabores',
    sizes: 'Tamanhos',
    payments: 'Pagamentos',
    availability: 'Disponibilidade',
    orders: 'Pedidos',
    orderItems: 'PedidoItens',
    checkouts: 'CheckoutCobrancas'
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
      'Observações', 'Status', 'Origem', 'Quantidade total', 'Assinatura do pedido', 'Persistência',
      // Etapa 9: colunas aditivas; pedidos anteriores ficam com estas células vazias.
      'Modalidade de recebimento', 'CEP', 'Logradouro', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF',
      'Referência', 'Subtotal produtos (centavos)', 'Taxa de entrega (centavos)', 'Total final (centavos)',
      'Orientações de recebimento',
      // Etapa 11.4: data/hora do arquivamento registrada pelo servidor; vazio = pedido ativo.
      'Arquivado em'
    ],
    PedidoItens: [
      'Pedido ID', 'Item', 'Sabor', 'Tamanho ID', 'Tamanho', 'Quantidade',
      'Preço unitário', 'Subtotal', 'Preço primeira fatia', 'Preço fatia adicional',
      'Economia', 'Modelo de preço'
    ],
    CheckoutCobrancas: [
      'Pedido ID', 'Versão do valor', 'Checkout URL', 'Cobrança ID', 'Valor esperado (centavos)',
      'Criado em', 'Expira em', 'Estado', 'Último erro', 'Referências JSON', 'Atualizado em'
    ]
  }
};

const PF_ARCHIVE = {
  header: 'Arquivado em',
  // Arquivamento não é status: o pedido mantém o status operacional original.
  statuses: ['Concluído', 'Cancelado']
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
  maxDistinctItems: 12,
  maxQuantityPerItem: 20,
  maxTotalQuantity: 50,
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
  domains: ['brand', 'flavors', 'sizes', 'catalog', 'pricing', 'payments', 'availability', 'fulfillment']
};

const PF_FULFILLMENT = {
  modes: ['delivery', 'pickup'],
  maxDeliveryFeeCents: 100000,
  limits: {
    street: 120, number: 20, complement: 80, neighborhood: 80, city: 80, reference: 160,
    pickupAddress: 300, instructions: 500
  },
  states: ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
};

const PF_PRICING = {
  defaultFirstSliceCents: 1997,
  defaultAdditionalSliceCents: 1500,
  model: 'progressive-v1'
};

const PF_CHECKOUT = {
  apiUrl: 'https://api.checkout.infinitepay.io/links',
  paymentCheckUrl: 'https://api.checkout.infinitepay.io/payment_check',
  apiKeyProperty: 'INFINITEPAY_API_KEY',
  handleProperty: 'INFINITEPAY_HANDLE',
  redirectUrlProperty: 'INFINITEPAY_REDIRECT_URL',
  returnSecretProperty: 'INFINITEPAY_RETURN_SECRET',
  // URL /exec do Web App; quando definida, cada novo checkout recebe um webhook_url assinado por pedido.
  webhookUrlProperty: 'INFINITEPAY_WEBHOOK_URL',
  // A ajuda oficial (atualizada em 20/10/2026) documenta "webhook: { url, events }"; a página de desenvolvedores
  // ainda mostra "webhook_url". O formato aceito é confirmado na homologação; "flat" usa o campo antigo.
  webhookFormatProperty: 'INFINITEPAY_WEBHOOK_FORMAT',
  // Somente pagamentos aprovados: eventos de falha trariam transações que não pertencem ao pagamento final.
  webhookEvents: ['paid'],
  // A documentação oficial publica exemplos com os dois domínios de checkout.
  allowedCheckoutHosts: ['checkout.infinitepay.com.br', 'checkout.infinitepay.io'],
  states: {
    creating: 'creating', active: 'active', returned: 'returned_unverified',
    paid: 'paid_unverified', mismatch: 'payment_amount_mismatch', expired: 'expired', failed: 'failed', unknown: 'unknown',
    confirmed: 'paid_confirmed'
  },
  paidCaptureMethods: ['pix', 'credit_card'],
  advancedOrderStatuses: ['Confirmado', 'Em produção', 'Concluído'],
  // Etapa 10: confirmação automática e conciliação agendada.
  reconcileHandler: 'reconcilePendingPayments',
  reconcileEveryMinutes: 10,
  reconcileMaxChecksPerRun: 15,
  reconcileMaxRuntimeMs: 4 * 60 * 1000,
  reconcileRunningKey: 'payment-reconcile:running',
  reconcileGraceMs: 48 * 60 * 60 * 1000,
  recheckBaseMs: 10 * 60 * 1000,
  recheckPendingCapMs: 6 * 60 * 60 * 1000,
  recheckFailureCapMs: 60 * 60 * 1000,
  publicCheckPrefix: 'payment-check:',
  publicCheckCooldownSeconds: 10,
  maxHistory: 20,
  maxErrorLength: 300,
  maxProviderMessageLength: 200,
  maxAutomaticAttempts: 3,
  // Mensagem gravada pela versão anterior para respostas HTTP fora de 2xx (sem código registrado).
  legacyHttpFailureMessage: 'A InfinitePay não pôde criar o checkout neste momento.'
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
    ['paymentDeadlineTime', '23:59:59'],
    ['firstSlicePrice', PF_PRICING.defaultFirstSliceCents / 100],
    ['additionalSlicePrice', PF_PRICING.defaultAdditionalSliceCents / 100],
    // Entrega começa desligada e sem taxa: só é habilitada após configuração explícita.
    ['pickupEnabled', true],
    ['deliveryEnabled', false]
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

  ensureSheet_(
    ss,
    PF.sheets.orderItems,
    PF.headers.PedidoItens
  );

  ensureSheet_(
    ss,
    PF.sheets.checkouts,
    PF.headers.CheckoutCobrancas
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

    // Notificação da InfinitePay: o corpo não traz "action"; a rota vem da URL assinada do checkout.
    if (e && e.parameter && e.parameter.infinitepay_webhook === '1') {
      validateObjectSize_(body, PF_ORDER.maxOrderBytes);
      return json_(handleInfinitePayWebhook_(e.parameter, body));
    }

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

    if (action === 'registerCheckoutReturn') {
      validateObjectSize_(body, PF_ORDER.maxOrderBytes);
      return json_({ ok: true, checkout: registerCheckoutReturn_(body) });
    }

    if (action === 'verifyCheckoutPayment') {
      validateObjectSize_(body, PF_ORDER.maxOrderBytes);
      return json_({ ok: true, payment: verifyPublicCheckoutPayment_(body) });
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

    if (action === 'checkCheckoutPayment') {
      requireAdmin_(body);
      return json_({ ok: true, checkout: checkCheckoutPayment_(body.orderId) });
    }

    if (action === 'retryCheckout') {
      requireAdmin_(body);
      return json_({ ok: true, checkout: retryOrderCheckout_(body.orderId) });
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


    if (action === 'archiveOrder' || action === 'unarchiveOrder') {
      requireAdmin_(body);
      return json_({
        ok: true,
        order: setOrderArchived_(body.orderId, action === 'archiveOrder', { expectedStatus: body.expectedStatus })
      });
    }


    if (action === 'updateOrderStatus') {

      requireAdmin_(body);

      return json_({
        ok: true,
        order: updateOrderStatus_(
          body.orderId,
          body.status,
          { expectedStatus: body.expectedStatus }
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
      : undefined,
    currentStatus: isExpected && typeof error.currentStatus === 'string'
      ? error.currentStatus
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

    progressivePricing: {
      firstSlicePrice: configuredMoney_(values.firstSlicePrice, PF_PRICING.defaultFirstSliceCents),
      additionalSlicePrice: configuredMoney_(values.additionalSlicePrice, PF_PRICING.defaultAdditionalSliceCents)
    },

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

    businessWhatsapp: String(values.businessWhatsapp || '').replace(/[^\d+()\s-]/g, '').slice(0, 24),

    fulfillment: fulfillmentConfigFromValues_(values),

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
    payments: config.payments.filter(item => item.active !== false).map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      description: item.description,
      active: true
    })),
    progressivePricing: config.progressivePricing,
    availability: config.availability,
    businessWhatsapp: config.businessWhatsapp || '',
    fulfillment: normalizeFulfillmentConfig_(config.fulfillment),
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
  // Listas ausentes nunca são tratadas como vazias: isso desativaria sabores ou tamanhos históricos.
  const hasFlavorList = Array.isArray(data.flavorItems) || Array.isArray(data.flavors);
  if (domain === 'flavors' && !hasFlavorList) {
    throw apiError_('FLAVOR_LIST_REQUIRED', 'A lista de sabores não foi enviada. Recarregue a central e tente novamente.');
  }
  if (domain === 'flavors' || ((domain === 'catalog' || domain === 'all') && hasFlavorList)) writeFlavorConfig_(ss, data);
  if (domain === 'sizes' || ((domain === 'catalog' || domain === 'all') && Array.isArray(data.sizes))) writeSizeConfig_(ss, data);
  if (domain === 'pricing' || (domain === 'all' && data.progressivePricing)) writePricingConfig_(ss, data);
  if (domain === 'catalog' && Array.isArray(data.payments)) writePaymentConfig_(ss, data);
  if (domain === 'payments' || domain === 'all') writePaymentConfig_(ss, data);
  if (domain === 'availability' || domain === 'all') writeAvailabilityConfig_(ss, data);
  if (domain === 'fulfillment' || (domain === 'all' && data.fulfillment)) writeFulfillmentConfig_(ss, data);
}

function fulfillmentConfigFromValues_(values) {
  const feeText = String(values.deliveryFee == null ? '' : values.deliveryFee).trim().replace(',', '.');
  const feeNumber = Number(feeText);
  return normalizeFulfillmentConfig_({
    pickupEnabled: isConfigTrue_(values.pickupEnabled, true),
    deliveryEnabled: isConfigTrue_(values.deliveryEnabled, false),
    deliveryFeeCents: feeText !== '' && isFinite(feeNumber) ? Math.round(feeNumber * 100) : null,
    pickupAddress: values.pickupAddress,
    pickupInstructions: values.pickupInstructions,
    deliveryInstructions: values.deliveryInstructions
  });
}

// Entrega só fica ativa com taxa explicitamente definida; sem nenhuma modalidade válida, mantém a retirada.
function normalizeFulfillmentConfig_(value) {
  const source = value || {};
  const fee = source.deliveryFeeCents === null || source.deliveryFeeCents === undefined || source.deliveryFeeCents === ''
    ? null
    : Number(source.deliveryFeeCents);
  const feeDefined = fee !== null && Number.isInteger(fee) && fee >= 0 && fee <= PF_FULFILLMENT.maxDeliveryFeeCents;
  const deliveryEnabled = source.deliveryEnabled === true && feeDefined;
  return {
    deliveryEnabled,
    pickupEnabled: source.pickupEnabled !== false || !deliveryEnabled,
    deliveryFeeCents: feeDefined ? fee : null,
    deliveryFee: feeDefined ? fee / 100 : null,
    pickupAddress: String(source.pickupAddress || '').slice(0, PF_FULFILLMENT.limits.pickupAddress),
    pickupInstructions: String(source.pickupInstructions || '').slice(0, PF_FULFILLMENT.limits.instructions),
    deliveryInstructions: String(source.deliveryInstructions || '').slice(0, PF_FULFILLMENT.limits.instructions)
  };
}

function writeFulfillmentConfig_(ss, data) {
  const fulfillment = data.fulfillment || data;
  const deliveryEnabled = fulfillment.deliveryEnabled === true;
  const pickupEnabled = fulfillment.pickupEnabled === true;
  if (!deliveryEnabled && !pickupEnabled) {
    throw apiError_('FULFILLMENT_MODE_REQUIRED', 'Mantenha ao menos uma modalidade de recebimento habilitada.');
  }
  const rawFee = fulfillment.deliveryFee;
  let feeCents = null;
  if (rawFee !== null && rawFee !== undefined && String(rawFee).trim() !== '') {
    const numeric = Number(String(rawFee).replace(',', '.'));
    if (!isFinite(numeric) || numeric < 0 || Math.round(numeric * 100) > PF_FULFILLMENT.maxDeliveryFeeCents) {
      throw apiError_('INVALID_DELIVERY_FEE', 'Informe uma taxa de entrega válida.');
    }
    feeCents = Math.round(numeric * 100);
  }
  if (deliveryEnabled && feeCents === null) {
    throw apiError_('DELIVERY_FEE_REQUIRED', 'Defina a taxa de entrega antes de habilitar a entrega. Use 0 somente se a entrega for gratuita.');
  }
  const text = (value, limit, label) => {
    const cleaned = clean_(value);
    if (cleaned.length > limit) throw apiError_('FULFILLMENT_TEXT_TOO_LONG', 'O campo ' + label + ' excede o limite permitido.');
    return sheetSafeText_(cleaned);
  };
  updateConfigValues_(ss.getSheetByName(PF.sheets.config), {
    pickupEnabled,
    deliveryEnabled,
    deliveryFee: feeCents === null ? '' : feeCents / 100,
    pickupAddress: text(fulfillment.pickupAddress, PF_FULFILLMENT.limits.pickupAddress, 'endereço de retirada'),
    pickupInstructions: text(fulfillment.pickupInstructions, PF_FULFILLMENT.limits.instructions, 'instruções de retirada'),
    deliveryInstructions: text(fulfillment.deliveryInstructions, PF_FULFILLMENT.limits.instructions, 'orientações de entrega')
  });
}

// Lê a escolha do cliente sem consultar disponibilidade: o resultado entra na assinatura de idempotência.
function parseFulfillmentRequest_(body) {
  if (body.fulfillment === undefined || body.fulfillment === null) return { provided: false, mode: '', address: null };
  const raw = body.fulfillment;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw apiError_('INVALID_FULFILLMENT', 'A modalidade de recebimento não é válida.');
  }
  const mode = orderText_(raw, ['mode'], 'como deseja receber', 20, true);
  if (!PF_FULFILLMENT.modes.includes(mode)) {
    throw apiError_('INVALID_FULFILLMENT', 'A modalidade de recebimento não é válida.');
  }
  if (mode === 'pickup') return { provided: true, mode, address: null };
  const address = raw.address;
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    throw apiError_('DELIVERY_ADDRESS_REQUIRED', 'Informe o endereço de entrega.');
  }
  const limits = PF_FULFILLMENT.limits;
  const cep = orderText_(address, ['cep'], 'o CEP', 9, true).replace(/\D/g, '');
  if (!/^\d{8}$/.test(cep)) throw apiError_('INVALID_CEP', 'Informe um CEP válido com 8 dígitos.');
  const state = orderText_(address, ['state'], 'a UF', 2, true).toUpperCase();
  if (!PF_FULFILLMENT.states.includes(state)) throw apiError_('INVALID_STATE', 'Informe uma UF válida.');
  return {
    provided: true,
    mode,
    address: {
      cep,
      street: orderText_(address, ['street'], 'a rua ou avenida', limits.street, true),
      number: orderText_(address, ['number'], 'o número', limits.number, true),
      complement: orderText_(address, ['complement'], 'o complemento', limits.complement, false),
      neighborhood: orderText_(address, ['neighborhood'], 'o bairro', limits.neighborhood, true),
      city: orderText_(address, ['city'], 'a cidade', limits.city, true),
      state,
      reference: orderText_(address, ['reference'], 'a referência', limits.reference, false)
    }
  };
}

// Aplica a configuração vigente: disponibilidade e taxa vêm somente do servidor.
function resolveFulfillment_(request, fulfillmentConfig) {
  const settings = normalizeFulfillmentConfig_(fulfillmentConfig);
  if (!request.provided) {
    if (!settings.pickupEnabled) {
      throw apiError_('FULFILLMENT_REQUIRED', 'Atualize a página e escolha como deseja receber a encomenda.');
    }
    return { mode: '', address: null, feeCents: 0, instructions: '' };
  }
  if (request.mode === 'pickup') {
    if (!settings.pickupEnabled) throw apiError_('FULFILLMENT_UNAVAILABLE', 'A retirada não está disponível no momento.');
    return {
      mode: 'pickup', address: null, feeCents: 0,
      instructions: [settings.pickupAddress, settings.pickupInstructions].filter(Boolean).join(' — ')
    };
  }
  if (!settings.deliveryEnabled) throw apiError_('FULFILLMENT_UNAVAILABLE', 'A entrega não está disponível no momento.');
  return { mode: 'delivery', address: request.address, feeCents: settings.deliveryFeeCents, instructions: settings.deliveryInstructions };
}

function writeBrandConfig_(ss, data) {
  updateConfigValues_(ss.getSheetByName(PF.sheets.config), {
    brandName: sheetSafeText_(clean_(data.brandName) || 'Primeira Fornada'),
    heroTitle: sheetSafeText_(clean_(data.heroTitle) || clean_(data.brandName) || 'Primeira Fornada'),
    heroSubtitle: sheetSafeText_(clean_(data.heroSubtitle)),
    description: sheetSafeText_(clean_(data.description))
  });
}

function writePricingConfig_(ss, data) {
  const pricing = data.progressivePricing || data;
  const firstSliceCents = moneyToCents_(pricing.firstSlicePrice, 'preço da primeira fatia');
  const additionalSliceCents = moneyToCents_(pricing.additionalSlicePrice, 'preço da fatia adicional');
  if (firstSliceCents < 1 || additionalSliceCents > firstSliceCents) {
    throw apiError_('INVALID_PROGRESSIVE_PRICE', 'O preço adicional deve ser menor ou igual ao preço da primeira fatia.');
  }
  updateConfigValues_(ss.getSheetByName(PF.sheets.config), {
    firstSlicePrice: firstSliceCents / 100,
    additionalSlicePrice: additionalSliceCents / 100
  });
}

function moneyToCents_(value, label) {
  const numeric = Number(value);
  if (!isFinite(numeric) || numeric < 0 || numeric > 100000) {
    throw apiError_('INVALID_PROGRESSIVE_PRICE', 'O ' + label + ' não é válido.');
  }
  return Math.round(numeric * 100);
}

function configuredMoney_(value, fallbackCents) {
  const numeric = Number(value);
  return isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) / 100 : fallbackCents / 100;
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

function getInfinitePayConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const apiKey = String(properties.getProperty(PF_CHECKOUT.apiKeyProperty) || '').trim();
  const redirectUrl = validateRedirectUrl_(properties.getProperty(PF_CHECKOUT.redirectUrlProperty) || '');
  return {
    configured: /^inchk_[A-Za-z0-9_-]{8,}$/.test(apiKey) && Boolean(redirectUrl),
    apiKey,
    handle: String(properties.getProperty(PF_CHECKOUT.handleProperty) || '').trim().replace(/^\$/, ''),
    redirectUrl,
    webhookUrl: validateWebhookUrl_(properties.getProperty(PF_CHECKOUT.webhookUrlProperty) || ''),
    webhookFormat: String(properties.getProperty(PF_CHECKOUT.webhookFormatProperty) || '').trim() === 'flat' ? 'flat' : 'object'
  };
}

function validateRedirectUrl_(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /^https:\/\/[^\s]+$/i.test(text) ? text : '';
}

function getCheckoutReturnSecret_() {
  const properties = PropertiesService.getScriptProperties();
  let secret = properties.getProperty(PF_CHECKOUT.returnSecretProperty) || '';
  if (!secret) {
    secret = randomSecret_();
    properties.setProperty(PF_CHECKOUT.returnSecretProperty, secret);
  }
  return secret;
}

function checkoutValueVersion_(order) {
  const identity = {
    orderId: String(order.id || ''),
    totalCents: Math.round(Number(order.total || order.price || 0) * 100),
    items: (order.items || []).map(item => ({
      flavor: String(item.flavor || ''), quantity: Number(item.quantity || 0),
      subtotalCents: Math.round(Number(item.subtotal || 0) * 100)
    }))
  };
  // Modalidade e taxa mudam o valor cobrado; pedidos sem modalidade mantêm a versão já registrada.
  if (order.fulfillment && order.fulfillment.mode) {
    identity.fulfillment = { mode: order.fulfillment.mode, deliveryFeeCents: Number(order.deliveryFeeCents || 0) };
  }
  return hashCredential_(JSON.stringify(identity)).slice(0, 32);
}

function checkoutReturnToken_(orderId, valueVersion) {
  return base64UrlEncode_(Utilities.computeHmacSha256Signature(
    String(orderId) + '|' + String(valueVersion),
    getCheckoutReturnSecret_(),
    Utilities.Charset.UTF_8
  ));
}

function checkoutRedirectUrl_(baseUrl, orderId, valueVersion) {
  const separator = baseUrl.indexOf('?') === -1 ? '?' : '&';
  return baseUrl + separator
    + 'payment_return=1&checkout_token=' + encodeURIComponent(checkoutReturnToken_(orderId, valueVersion));
}

function checkoutItemsFromOrder_(order) {
  const result = [];
  (order.items || []).forEach(item => {
    const quantity = Number(item.quantity || 0);
    const firstCents = Math.round(Number(item.firstSlicePrice || item.unitPrice || 0) * 100);
    const additionalCents = Math.round(Number(item.additionalSlicePrice || item.unitPrice || 0) * 100);
    const flavor = String(item.flavor || 'Encomenda').slice(0, 120);
    if (quantity > 0 && firstCents > 0) {
      result.push({ quantity: 1, price: firstCents, description: flavor + ' — primeira fatia' });
    }
    if (quantity > 1 && additionalCents >= 0) {
      result.push({ quantity: quantity - 1, price: additionalCents, description: flavor + ' — fatias adicionais' });
    }
  });
  const deliveryFeeCents = Number(order.deliveryFeeCents || 0);
  if (deliveryFeeCents > 0) result.push({ quantity: 1, price: deliveryFeeCents, description: 'Taxa de entrega' });
  const expected = Math.round(Number(order.total || order.price || 0) * 100);
  const calculated = result.reduce((sum, item) => sum + item.quantity * item.price, 0);
  if (!result.length || expected < 1 || calculated !== expected) {
    throw apiError_('CHECKOUT_TOTAL_MISMATCH', 'O pedido foi registrado, mas o total do checkout não pôde ser validado.');
  }
  return result;
}

function normalizeInfinitePayPhone_(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^55\d{10,11}$/.test(digits)) return '+' + digits;
  if (/^\d{10,11}$/.test(digits)) return '+55' + digits;
  return '';
}

function safeInfinitePayCheckoutUrl_(value) {
  const text = String(value || '').trim();
  const match = text.match(/^https:\/\/([a-z0-9.-]+)(?::\d{1,5})?(?:[\/?#]|$)/i);
  if (!match) return '';
  const host = match[1].toLowerCase();
  return PF_CHECKOUT.allowedCheckoutHosts.includes(host) ? text : '';
}

function checkoutRecordFromRow_(row) {
  return {
    orderId: String(row[0] || ''), valueVersion: String(row[1] || ''),
    url: readableSheetText_(row[2]), chargeId: readableSheetText_(row[3]),
    expectedAmountCents: Number(row[4] || 0),
    createdAt: row[5] instanceof Date ? row[5].toISOString() : String(row[5] || ''),
    expiresAt: row[6] instanceof Date ? row[6].toISOString() : String(row[6] || ''),
    state: String(row[7] || ''), error: readableSheetText_(row[8]),
    references: parseCheckoutReferences_(row[9]),
    updatedAt: row[10] instanceof Date ? row[10].toISOString() : String(row[10] || '')
  };
}

function parseCheckoutReferences_(value) {
  try {
    const parsed = JSON.parse(readableSheetText_(value) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function checkoutPublicView_(record) {
  if (!record) return { state: 'not_created', available: false, canRetry: false };
  const url = safeInfinitePayCheckoutUrl_(record.url);
  return {
    state: record.state || 'unknown', available: Boolean(url) && ['active', 'returned_unverified', 'paid_unverified'].includes(record.state),
    url, chargeId: record.chargeId || '', expectedAmountCents: record.expectedAmountCents,
    expiresAt: record.expiresAt || '',
    canRetry: checkoutRetryAllowed_(record, false)
  };
}

// Visão administrativa: inclui o diagnóstico sanitizado da última falha.
function checkoutAdminView_(record) {
  const view = checkoutPublicView_(record);
  const references = record && record.references || {};
  const lastError = references.lastError || null;
  view.canManualRetry = !record || checkoutRetryAllowed_(record, true);
  view.reviewReason = String(references.reviewReason || '');
  view.confirmedAt = String(references.confirmedAt || '');
  view.attempts = Number(references.attempts || (record ? 1 : 0));
  view.diagnostic = lastError
    ? {
      category: String(lastError.category || ''), httpStatus: Number(lastError.httpStatus || 0),
      providerMessage: String(lastError.providerMessage || ''), correlationId: String(lastError.correlationId || ''),
      at: String(lastError.at || ''), retryable: lastError.retryable === true
    }
    : (record && record.error ? { category: 'legacy', httpStatus: 0, providerMessage: record.error, correlationId: '', at: record.updatedAt || '', retryable: false } : null);
  return view;
}

function checkoutFailureRetryable_(record, manual) {
  const lastError = record && record.references && record.references.lastError;
  if (lastError) return lastError.retryable === true;
  // Registros da versão anterior não guardavam o código HTTP: só a administração decide após conferir a InfinitePay.
  return manual === true && String(record && record.error || '') === PF_CHECKOUT.legacyHttpFailureMessage;
}

function checkoutRetryAllowed_(record, manual) {
  if (!record || record.state !== PF_CHECKOUT.states.failed) return false;
  if (!checkoutFailureRetryable_(record, manual)) return false;
  if (manual) return true;
  return Number(record.references && record.references.attempts || 1) < PF_CHECKOUT.maxAutomaticAttempts;
}

function escapeRegExp_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// personalData: valores do próprio pedido (nome, endereço) que nunca podem chegar aos registros.
function sanitizeProviderText_(value, personalData) {
  let text = String(value == null ? '' : value);
  (personalData || []).map(item => String(item || '').trim()).filter(item => item.length >= 3)
    .sort((left, right) => right.length - left.length)
    .forEach(item => { text = text.replace(new RegExp(escapeRegExp_(item), 'gi'), '[dado pessoal]'); });
  return text
    .replace(/inchk_[A-Za-z0-9_-]+/g, '[chave]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[número]')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PF_CHECKOUT.maxProviderMessageLength);
}

function providerMessage_(data, text, personalData) {
  if (data && typeof data === 'object') {
    const candidate = data.message || data.error || data.error_message || data.errors;
    if (candidate) return sanitizeProviderText_(typeof candidate === 'string' ? candidate : JSON.stringify(candidate), personalData);
  }
  return sanitizeProviderText_(text, personalData);
}

function providerCorrelationId_(response) {
  let headers = {};
  try { headers = response.getAllHeaders ? response.getAllHeaders() : (response.getHeaders ? response.getHeaders() : {}); } catch (_) {}
  const names = ['x-request-id', 'x-correlation-id', 'request-id', 'x-amzn-requestid', 'x-amz-cf-id', 'cf-ray'];
  const found = Object.keys(headers || {}).find(name => names.includes(String(name).toLowerCase()));
  const value = found ? headers[found] : '';
  return String(Array.isArray(value) ? value[0] : value || '').replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 100);
}

function checkoutHttpCategory_(status) {
  if (status === 400 || status === 422) return { category: 'invalid_request', definitive: true };
  if (status === 401 || status === 403) return { category: 'auth', definitive: true };
  if (status === 404) return { category: 'endpoint_not_found', definitive: true };
  if (status === 429) return { category: 'rate_limited', definitive: true };
  if (status === 408) return { category: 'timeout', definitive: false };
  if (status >= 500) return { category: 'provider_error', definitive: false };
  if (status >= 400) return { category: 'client_error', definitive: status !== 409 };
  return { category: 'unexpected_status', definitive: false };
}

// definitive=true significa que a InfinitePay comprovadamente não criou a cobrança.
function checkoutFailure_(category, definitive, httpStatus, providerMessage, correlationId) {
  const error = apiError_('INFINITEPAY_CHECKOUT_FAILED', 'A InfinitePay não gerou o checkout.');
  error.definitive = definitive;
  error.diagnostic = {
    category, httpStatus: Number(httpStatus || 0), providerMessage: providerMessage || '',
    correlationId: correlationId || '', retryable: definitive && category !== 'total_mismatch'
  };
  return error;
}

function checkoutDiagnosticFromError_(error) {
  if (error && error.diagnostic) return error.diagnostic;
  if (error && error.code === 'CHECKOUT_TOTAL_MISMATCH') {
    return { category: 'total_mismatch', httpStatus: 0, providerMessage: '', correlationId: '', retryable: false };
  }
  return { category: 'internal', httpStatus: 0, providerMessage: sanitizeProviderText_(error && error.message), correlationId: '', retryable: false };
}

function checkoutErrorSummary_(diagnostic) {
  return [
    diagnostic.httpStatus ? 'HTTP ' + diagnostic.httpStatus : '',
    diagnostic.category,
    diagnostic.providerMessage,
    diagnostic.correlationId ? 'correlação ' + diagnostic.correlationId : ''
  ].filter(Boolean).join(' · ').slice(0, PF_CHECKOUT.maxErrorLength);
}

function checkoutDeadlineForOrder_(order, orderWindow) {
  return String(order && order.deliveryDate || '') === String(orderWindow && orderWindow.deliveryDateText || '')
    ? orderWindow.deadlineText
    : '';
}

function findCheckoutRecord_(sheet, orderId, valueVersion) {
  if (!sheet || sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, PF.headers.CheckoutCobrancas.length).getValues();
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (String(rows[index][0] || '') === String(orderId)
      && (!valueVersion || String(rows[index][1] || '') === String(valueVersion))) {
      return { row: rows[index], rowNumber: index + 2, record: checkoutRecordFromRow_(rows[index]) };
    }
  }
  return null;
}

function updateCheckoutRecord_(sheet, rowNumber, values) {
  Object.keys(values).forEach(key => {
    const indexes = { url: 3, chargeId: 4, expectedAmountCents: 5, createdAt: 6, expiresAt: 7, state: 8, error: 9, references: 10, updatedAt: 11 };
    const column = indexes[key];
    if (!column) return;
    const value = key === 'references' ? JSON.stringify(values[key] || {}) : values[key];
    sheet.getRange(rowNumber, column).setValue(typeof value === 'string' ? sheetSafeText_(value) : value);
  });
}

function checkoutIsExpired_(record, now) {
  const expires = new Date(record && record.expiresAt || '');
  return !isNaN(expires.getTime()) && expires.getTime() <= now.getTime();
}

function createInfinitePayCheckout_(order, expiresAt, valueVersion, integration) {
  const payload = {
    order_nsu: String(order.id),
    redirect_url: checkoutRedirectUrl_(integration.redirectUrl, order.id, valueVersion),
    items: checkoutItemsFromOrder_(order),
    customer: {
      name: String(order.customerName || '').slice(0, 120),
      phone_number: normalizeInfinitePayPhone_(order.whatsapp)
    },
    options: {
      single_payment: true,
      valid_until: String(expiresAt),
      payment_methods_enabled: ['credit_card', 'pix'],
      // A logística é administrada pelo BOLOGIS: o checkout não pede o endereço novamente.
      require_delivery_address: false
    }
  };
  if (!payload.customer.phone_number) delete payload.customer.phone_number;
  const webhookUrl = checkoutWebhookUrl_(integration.webhookUrl, order.id, valueVersion);
  if (webhookUrl && integration.webhookFormat === 'flat') payload.webhook_url = webhookUrl;
  else if (webhookUrl) payload.webhook = { url: webhookUrl, events: PF_CHECKOUT.webhookEvents.slice() };
  const deliveryAddress = order.fulfillment && order.fulfillment.mode === 'delivery' ? order.fulfillment.address : null;
  if (deliveryAddress) {
    // Campos de endereço documentados pela InfinitePay; retirada nunca envia endereço.
    payload.address = {
      cep: deliveryAddress.cep, street: deliveryAddress.street, number: deliveryAddress.number,
      neighborhood: deliveryAddress.neighborhood, city: deliveryAddress.city, state: deliveryAddress.state
    };
    if (deliveryAddress.complement) payload.address.complement = deliveryAddress.complement;
  }
  const personalData = [payload.customer.name].concat(payload.address ? Object.keys(payload.address).map(key => payload.address[key]) : []);
  // A referência de desenvolvedores exige a InfiniteTag (handle) no corpo da criação do link.
  if (integration.handle) payload.handle = integration.handle;
  let webhook = webhookUrl ? 'sent' : 'disabled';
  let response = postInfinitePayLink_(payload, integration);
  // 400/422 comprova que nenhum link foi criado. Se o campo de webhook for recusado, o checkout é
  // criado sem notificação: o retorno do cliente e a conciliação continuam fornecendo as referências.
  if (webhookUrl && [400, 422].includes(Number(response.getResponseCode()))) {
    delete payload.webhook;
    delete payload.webhook_url;
    webhook = 'rejected';
    console.warn('InfinitePay recusou a criação com webhook (HTTP ' + Number(response.getResponseCode()) + '); nova tentativa sem webhook.');
    response = postInfinitePayLink_(payload, integration);
  }
  const status = Number(response.getResponseCode());
  let text = '';
  try { text = String(response.getContentText() || ''); } catch (_) {}
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  const correlationId = providerCorrelationId_(response);
  if (status < 200 || status >= 300) {
    const classification = checkoutHttpCategory_(status);
    throw checkoutFailure_(classification.category, classification.definitive, status, providerMessage_(data, text, personalData), correlationId);
  }
  // Com 2xx a cobrança pode ter sido criada mesmo sem URL utilizável: nunca recriar automaticamente.
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw checkoutFailure_('invalid_json', false, status, '', correlationId);
  }
  const rawUrl = data.url || data.checkout_url || data.link || '';
  const url = safeInfinitePayCheckoutUrl_(rawUrl);
  if (!url) {
    throw checkoutFailure_(rawUrl ? 'invalid_url' : 'missing_url', false, status, rawUrl ? sanitizeProviderText_(String(rawUrl).split('?')[0]) : '', correlationId);
  }
  return { url, chargeId: String(data.id || data.slug || data.invoice_slug || ''), payload, webhook };
}

function postInfinitePayLink_(payload, integration) {
  try {
    return UrlFetchApp.fetch(PF_CHECKOUT.apiUrl, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'X-Api-Key': integration.apiKey }, payload: JSON.stringify(payload)
    });
  } catch (networkError) {
    // Sem resposta não é possível saber se a cobrança foi criada: estado ambíguo.
    const timedOut = /timeout|timed out|tempo limite|excedeu/i.test(String(networkError && networkError.message || ''));
    throw checkoutFailure_(timedOut ? 'timeout' : 'network', false, 0, '', '');
  }
}

function ensureCheckoutForOrder_(order, expiresAt, options) {
  const manual = Boolean(options && options.manual);
  const integration = getInfinitePayConfig_();
  if (!integration.configured) return { state: 'not_configured', available: false, canRetry: false };
  if (['Cancelado', 'Confirmado', 'Concluído'].includes(String(order.status || ''))) {
    return { state: 'blocked_order_status', available: false, canRetry: false };
  }
  const expectedAmountCents = Math.round(Number(order.total || order.price || 0) * 100);
  const valueVersion = checkoutValueVersion_(order);
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(PF.sheets.checkouts);
  if (!sheet) return { state: 'not_configured', available: false, canRetry: false };
  const now = currentBusinessDate_();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let rowNumber;
  let references = {};
  try {
    const existing = findCheckoutRecord_(sheet, order.id, valueVersion);
    if (existing) {
      if (checkoutIsExpired_(existing.record, now)
        && [PF_CHECKOUT.states.active, PF_CHECKOUT.states.returned].includes(existing.record.state)) {
        updateCheckoutRecord_(sheet, existing.rowNumber, { state: PF_CHECKOUT.states.expired, updatedAt: now });
        existing.record.state = PF_CHECKOUT.states.expired;
      }
      // Só repete quando a falha anterior comprova que nenhuma cobrança foi criada.
      if (!checkoutRetryAllowed_(existing.record, manual)) return checkoutPublicView_(existing.record);
    }
    const expiry = new Date(expiresAt);
    if (isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime()) {
      return existing ? checkoutPublicView_(existing.record) : { state: PF_CHECKOUT.states.expired, available: false, canRetry: false };
    }
    if (existing) {
      // Reaproveita o mesmo registro: o histórico da cobrança nunca é apagado.
      rowNumber = existing.rowNumber;
      references = Object.assign({}, existing.record.references || {});
      references.attempts = Number(references.attempts || 1) + 1;
      updateCheckoutRecord_(sheet, rowNumber, { expiresAt: expiry, state: PF_CHECKOUT.states.creating, references, updatedAt: now });
    } else {
      references = { orderNsu: order.id, attempts: 1 };
      sheet.appendRow([
        order.id, valueVersion, '', '', expectedAmountCents, now, expiry,
        PF_CHECKOUT.states.creating, '', JSON.stringify(references), now
      ]);
      rowNumber = sheet.getLastRow();
    }
  } finally {
    lock.releaseLock();
  }

  try {
    const created = createInfinitePayCheckout_(order, expiresAt, valueVersion, integration);
    const successReferences = Object.assign({}, references, { orderNsu: order.id, webhook: created.webhook });
    delete successReferences.lastError;
    const commitLock = LockService.getScriptLock();
    commitLock.waitLock(10000);
    try {
      updateCheckoutRecord_(sheet, rowNumber, {
        url: created.url, chargeId: created.chargeId, state: PF_CHECKOUT.states.active,
        error: '', references: successReferences, updatedAt: currentBusinessDate_()
      });
    } finally {
      commitLock.releaseLock();
    }
    return checkoutPublicView_({
      url: created.url, chargeId: created.chargeId, expectedAmountCents,
      expiresAt, state: PF_CHECKOUT.states.active, references: successReferences
    });
  } catch (error) {
    const diagnostic = checkoutDiagnosticFromError_(error);
    const noChargeCreated = Boolean(error && error.definitive) || diagnostic.category === 'total_mismatch';
    const failureState = noChargeCreated ? PF_CHECKOUT.states.failed : PF_CHECKOUT.states.unknown;
    const failureReferences = Object.assign({}, references, {
      orderNsu: order.id,
      lastError: Object.assign({}, diagnostic, { at: currentBusinessDate_().toISOString() })
    });
    // Registro operacional sem credenciais nem dados pessoais.
    console.warn('Checkout InfinitePay não gerado: ' + checkoutErrorSummary_(diagnostic));
    const failureLock = LockService.getScriptLock();
    failureLock.waitLock(10000);
    try {
      updateCheckoutRecord_(sheet, rowNumber, {
        state: failureState,
        error: checkoutErrorSummary_(diagnostic),
        references: failureReferences,
        updatedAt: currentBusinessDate_()
      });
    } finally {
      failureLock.releaseLock();
    }
    return checkoutPublicView_({ state: failureState, references: failureReferences, expectedAmountCents, expiresAt });
  }
}

function retryOrderCheckout_(orderId) {
  const id = clean_(orderId);
  if (!id) throw apiError_('ORDER_ID_REQUIRED', 'Informe o pedido para gerar o checkout.');
  const ss = getSpreadsheet_();
  const orderRecord = findOrderRecordById_(ss.getSheetByName(PF.sheets.orders), id);
  if (!orderRecord) throw apiError_('ORDER_NOT_FOUND', 'O pedido informado não foi encontrado.');
  const order = orderResponseFromRow_(orderRecord.row, PF_ORDER.timezone, false, getOrderItemsById_(ss.getSheetByName(PF.sheets.orderItems), id));
  if (order.status !== PF_ORDER.initialStatus) {
    throw apiError_('CHECKOUT_RETRY_BLOCKED', 'Somente pedidos aguardando pagamento podem receber um checkout.');
  }
  const checkoutSheet = ss.getSheetByName(PF.sheets.checkouts);
  const existing = findCheckoutRecord_(checkoutSheet, id, '');
  if (existing && !checkoutRetryAllowed_(existing.record, true)) {
    throw apiError_('CHECKOUT_RETRY_NOT_ALLOWED', 'Este pedido já tem uma cobrança ativa ou em conciliação. Confira na InfinitePay antes de qualquer nova tentativa.');
  }
  const deadline = checkoutDeadlineForOrder_(order, getOrderWindow_(getConfig_(), currentBusinessDate_()));
  if (!deadline) throw apiError_('CHECKOUT_RETRY_EXPIRED', 'O prazo de pagamento da fornada deste pedido já terminou.');
  ensureCheckoutForOrder_(order, deadline, { manual: true });
  const updated = findCheckoutRecord_(checkoutSheet, id, '');
  return checkoutAdminView_(updated && updated.record);
}

function safeInfinitePayReferenceUrl_(value) {
  const text = String(value || '').trim();
  const match = text.match(/^https:\/\/([a-z0-9.-]+)(?:[\/?#]|$)/i);
  if (!match) return '';
  const host = match[1].toLowerCase();
  return host === 'infinitepay.io' || host.endsWith('.infinitepay.io')
    || host === 'infinitepay.com.br' || host.endsWith('.infinitepay.com.br') ? text : '';
}

// Etapa 10: o retorno do cliente e o webhook só entregam referências. Nenhum dos dois comprova pagamento;
// a confirmação depende exclusivamente da consulta autenticada ao payment_check (verifyCheckoutPayment_).
function authorizeCheckoutToken_(orderId, token) {
  const checkout = findCheckoutRecord_(getSpreadsheet_().getSheetByName(PF.sheets.checkouts), orderId, '');
  if (!checkout || !constantTimeEqual_(token, checkoutReturnToken_(orderId, checkout.record.valueVersion))) {
    throw apiError_('CHECKOUT_RETURN_INVALID', 'Não foi possível validar o retorno do checkout.');
  }
  return checkout;
}

function recordCheckoutReferences_(orderId, incoming, source) {
  const sheet = getSpreadsheet_().getSheetByName(PF.sheets.checkouts);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const found = findCheckoutRecord_(sheet, orderId, '');
    if (!found) throw apiError_('CHECKOUT_NOT_FOUND', 'Este pedido ainda não possui checkout registrado.');
    const now = currentBusinessDate_();
    const previous = found.record.references || {};
    if ((previous.slug && incoming.slug && previous.slug !== incoming.slug)
      || (previous.transactionNsu && incoming.transactionNsu && previous.transactionNsu !== incoming.transactionNsu)) {
      // Mantém as referências originais e registra a tentativa divergente para a conferência administrativa.
      updateCheckoutRecord_(sheet, found.rowNumber, {
        references: Object.assign({}, previous, { lastConflict: { source, at: now.toISOString() } }), updatedAt: now
      });
      throw apiError_('CHECKOUT_RETURN_CONFLICT', 'O retorno não corresponde às referências já registradas para este pedido.');
    }
    const references = Object.assign({}, previous, {
      orderNsu: orderId,
      slug: previous.slug || incoming.slug || '',
      transactionNsu: previous.transactionNsu || incoming.transactionNsu || '',
      captureMethod: incoming.captureMethod || previous.captureMethod || '',
      receiptUrl: incoming.receiptUrl || previous.receiptUrl || ''
    });
    references[source === 'webhook' ? 'webhookAt' : 'returnedAt'] = now.toISOString();
    // Referências repetidas nunca rebaixam uma cobrança já conferida.
    const settled = [PF_CHECKOUT.states.confirmed, PF_CHECKOUT.states.paid, PF_CHECKOUT.states.mismatch].includes(found.record.state);
    const state = settled ? found.record.state : PF_CHECKOUT.states.returned;
    updateCheckoutRecord_(sheet, found.rowNumber, {
      chargeId: references.slug || found.record.chargeId, references, state, updatedAt: now
    });
    return state;
  } finally {
    lock.releaseLock();
  }
}

function registerCheckoutReturn_(body) {
  const orderId = orderText_(body, ['orderId', 'order_nsu'], 'pedido', 80, true);
  const token = orderText_(body, ['checkoutToken'], 'token de retorno', 256, true);
  const orderRecord = findOrderRecordById_(getSpreadsheet_().getSheetByName(PF.sheets.orders), orderId);
  if (!orderRecord) throw apiError_('ORDER_NOT_FOUND', 'O pedido informado não foi encontrado.');
  authorizeCheckoutToken_(orderId, token);
  const state = recordCheckoutReferences_(orderId, {
    slug: orderText_(body, ['slug'], 'código da cobrança', 160, false),
    transactionNsu: orderText_(body, ['transactionNsu', 'transaction_nsu'], 'transação', 160, false),
    captureMethod: orderText_(body, ['captureMethod', 'capture_method'], 'meio de pagamento', 40, false),
    receiptUrl: safeInfinitePayReferenceUrl_(body.receiptUrl || body.receipt_url)
  }, 'return');
  return { orderId, state, subjectToManualReview: true };
}

function checkoutWebhookToken_(orderId, valueVersion) {
  return checkoutReturnToken_(orderId, String(valueVersion) + '|webhook');
}

function checkoutWebhookUrl_(baseUrl, orderId, valueVersion) {
  if (!baseUrl) return '';
  const separator = baseUrl.indexOf('?') === -1 ? '?' : '&';
  return baseUrl + separator + 'infinitepay_webhook=1&order=' + encodeURIComponent(orderId)
    + '&token=' + encodeURIComponent(checkoutWebhookToken_(orderId, valueVersion));
}

// Somente o endpoint /exec de um Web App do Apps Script recebe notificações.
function validateWebhookUrl_(value) {
  const text = String(value || '').trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(text) ? text : '';
}

// A notificação não é assinada pela InfinitePay: o token da URL filtra chamadas anônimas e o
// pagamento só é aceito depois do payment_check. O Apps Script sempre responde HTTP 200.
// Corpo da notificação: campos no nível superior (página de desenvolvedores) ou em "data" (formato por eventos).
function webhookNotificationFields_(body) {
  const root = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const data = root.data && typeof root.data === 'object' && !Array.isArray(root.data) ? root.data : {};
  const pick = key => root[key] !== undefined && root[key] !== null ? root[key] : data[key];
  const text = value => typeof value === 'string' ? value : (typeof value === 'number' ? String(value) : '');
  return {
    event: text(pick('event') || pick('type')).toLowerCase(),
    order_nsu: text(pick('order_nsu')),
    invoice_slug: text(pick('invoice_slug')),
    slug: text(pick('slug')),
    transaction_nsu: text(pick('transaction_nsu')),
    capture_method: text(pick('capture_method')),
    receipt_url: text(pick('receipt_url'))
  };
}

function handleInfinitePayWebhook_(params, body) {
  try {
    const orderId = orderText_(params || {}, ['order'], 'pedido', 80, true);
    const token = orderText_(params || {}, ['token'], 'token', 256, true);
    const payload = webhookNotificationFields_(body);
    // O token já vincula a URL a este pedido; quando presente, order_nsu precisa coincidir.
    if (payload.order_nsu && payload.order_nsu !== orderId) throw apiError_('WEBHOOK_ORDER_MISMATCH', 'Notificação de outro pedido.');
    const checkout = findCheckoutRecord_(getSpreadsheet_().getSheetByName(PF.sheets.checkouts), orderId, '');
    if (!checkout || !constantTimeEqual_(token, checkoutWebhookToken_(orderId, checkout.record.valueVersion))) {
      throw apiError_('WEBHOOK_INVALID', 'Notificação não reconhecida.');
    }
    // Eventos diferentes de "paid" não fornecem referências do pagamento aprovado.
    if (payload.event && payload.event !== 'paid') return { ok: true, outcome: 'ignored_event' };
    recordCheckoutReferences_(orderId, {
      slug: orderText_({ slug: payload.invoice_slug || payload.slug }, ['slug'], 'código da cobrança', 160, false),
      transactionNsu: orderText_(payload, ['transaction_nsu'], 'transação', 160, false),
      captureMethod: orderText_(payload, ['capture_method'], 'meio de pagamento', 40, false),
      receiptUrl: safeInfinitePayReferenceUrl_(payload.receipt_url)
    }, 'webhook');
    const result = verifyCheckoutPayment_(orderId, { source: 'webhook' });
    return { ok: true, outcome: result.outcome };
  } catch (error) {
    console.warn('Webhook InfinitePay recusado: ' + sanitizeProviderText_(error && (error.code || 'erro')));
    return { ok: false, code: 'WEBHOOK_REJECTED' };
  }
}

function queryInfinitePayPayment_(integration, orderId, query) {
  let response;
  try {
    response = UrlFetchApp.fetch(PF_CHECKOUT.paymentCheckUrl, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'X-Api-Key': integration.apiKey },
      payload: JSON.stringify({ handle: integration.handle, order_nsu: orderId, transaction_nsu: query.transactionNsu, slug: query.slug })
    });
  } catch (networkError) {
    const timedOut = /timeout|timed out|tempo limite|excedeu/i.test(String(networkError && networkError.message || ''));
    return { ok: false, category: timedOut ? 'timeout' : 'network', httpStatus: 0 };
  }
  const status = Number(response.getResponseCode());
  let data = null;
  try { data = JSON.parse(response.getContentText() || ''); } catch (_) {}
  if (status < 200 || status >= 300) return { ok: false, category: checkoutHttpCategory_(status).category, httpStatus: status };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, category: 'invalid_json', httpStatus: status };
  return { ok: true, data, httpStatus: status };
}

// Campos opcionais devolvidos pela InfinitePay precisam coincidir com a consulta feita para este pedido.
function evaluatePaymentCheck_(data, orderId, query, record) {
  const amount = Number(data.amount);
  const echoes = [['order_nsu', orderId], ['transaction_nsu', query.transactionNsu], ['slug', query.slug], ['invoice_slug', query.slug]];
  const method = String(data.capture_method || '');
  return {
    paid: data.success !== false && data.paid === true,
    // amount é o valor da cobrança; paid_amount inclui juros de parcelamento do cartão.
    amountMatches: Number.isInteger(amount) && record.expectedAmountCents > 0 && amount === record.expectedAmountCents,
    transactionMatches: echoes.every(([key, expected]) => data[key] === undefined || data[key] === null || data[key] === ''
      || String(data[key]) === String(expected)),
    methodValid: !method || PF_CHECKOUT.paidCaptureMethods.includes(method),
    amount: Number.isFinite(amount) ? amount : 0,
    paidAmount: Number(data.paid_amount || 0),
    installments: Number(data.installments || 0),
    captureMethod: method
  };
}

function nextCheckDelayMs_(attempt, capMs) {
  return Math.min(capMs, PF_CHECKOUT.recheckBaseMs * Math.pow(2, Math.max(0, Number(attempt || 1) - 1)));
}

function appendPaymentHistory_(references, entry) {
  references.history = (Array.isArray(references.history) ? references.history : [])
    .concat([entry]).slice(-PF_CHECKOUT.maxHistory);
}

/**
 * Confere o pagamento na InfinitePay e confirma o pedido somente quando:
 * pagamento aprovado, transação e valor do pedido coincidem, a cobrança persistida não mudou
 * e o pedido continua "Aguardando pagamento". Idempotente e protegido por LockService.
 */
function verifyCheckoutPayment_(orderId, options) {
  const source = options && options.source || 'admin';
  const integration = getInfinitePayConfig_();
  if (!integration.configured || !integration.handle) {
    throw apiError_('INFINITEPAY_CHECK_NOT_CONFIGURED', 'Configure a API Key, a InfiniteTag e a URL de retorno nas propriedades do script.');
  }
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(PF.sheets.checkouts);
  const found = findCheckoutRecord_(sheet, orderId, '');
  if (!found) throw apiError_('CHECKOUT_NOT_FOUND', 'Este pedido ainda não possui checkout registrado.');
  const refs = found.record.references || {};
  if (found.record.state === PF_CHECKOUT.states.confirmed) return { outcome: 'already_confirmed', record: found.record };
  if (!refs.slug || !refs.transactionNsu) return { outcome: 'reference_pending', record: found.record };
  const query = { slug: refs.slug, transactionNsu: refs.transactionNsu };
  // A consulta externa acontece fora do lock; a decisão é tomada sobre dados relidos dentro dele.
  const check = queryInfinitePayPayment_(integration, orderId, query);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const current = findCheckoutRecord_(sheet, orderId, '');
    if (current.record.state === PF_CHECKOUT.states.confirmed) return { outcome: 'already_confirmed', record: current.record };
    const references = Object.assign({}, current.record.references || {});
    if (references.slug !== query.slug || references.transactionNsu !== query.transactionNsu) {
      return { outcome: 'reference_changed', record: current.record };
    }
    const now = currentBusinessDate_();
    references.lastCheckedAt = now.toISOString();
    references.lastCheckSource = source;
    if (!check.ok) {
      references.checkFailures = Number(references.checkFailures || 0) + 1;
      references.lastCheckError = { category: check.category, httpStatus: check.httpStatus, at: now.toISOString() };
      references.nextCheckAt = new Date(now.getTime() + nextCheckDelayMs_(references.checkFailures, PF_CHECKOUT.recheckFailureCapMs)).toISOString();
      updateCheckoutRecord_(sheet, current.rowNumber, { references, updatedAt: now });
      console.warn('Consulta InfinitePay indisponível: ' + check.category + (check.httpStatus ? ' HTTP ' + check.httpStatus : ''));
      return { outcome: 'provider_unavailable', record: Object.assign({}, current.record, { references }) };
    }
    delete references.lastCheckError;
    references.checkFailures = 0;
    const evaluation = evaluatePaymentCheck_(check.data, orderId, query, current.record);
    references.providerPaid = evaluation.paid;
    references.providerAmount = evaluation.amount;
    references.providerPaidAmount = evaluation.paidAmount;
    references.installments = evaluation.installments;
    references.amountMatches = evaluation.amountMatches;
    if (evaluation.captureMethod) references.providerCaptureMethod = evaluation.captureMethod;

    let state = current.record.state === PF_CHECKOUT.states.active ? PF_CHECKOUT.states.returned : current.record.state;
    let outcome = 'pending';
    let orderStatus = '';
    delete references.reviewReason;
    if (!evaluation.paid) {
      state = PF_CHECKOUT.states.returned;
      references.pendingChecks = Number(references.pendingChecks || 0) + 1;
      references.nextCheckAt = new Date(now.getTime() + nextCheckDelayMs_(references.pendingChecks, PF_CHECKOUT.recheckPendingCapMs)).toISOString();
    } else if (!evaluation.amountMatches) {
      state = PF_CHECKOUT.states.mismatch;
      outcome = 'amount_mismatch';
      references.reviewReason = 'amount_mismatch';
    } else {
      const orderSheet = ss.getSheetByName(PF.sheets.orders);
      const orderRecord = findOrderRecordById_(orderSheet, orderId);
      const order = orderRecord && orderResponseFromRow_(orderRecord.row, ss.getSpreadsheetTimeZone(), false,
        getOrderItemsById_(ss.getSheetByName(PF.sheets.orderItems), orderId));
      orderStatus = order ? order.status : '';
      const chargeMatchesOrder = Boolean(order)
        && Math.round(Number(order.total || 0) * 100) === current.record.expectedAmountCents
        && checkoutValueVersion_(order) === current.record.valueVersion;
      state = PF_CHECKOUT.states.paid;
      outcome = 'review_required';
      if (!evaluation.transactionMatches) references.reviewReason = 'transaction_mismatch';
      else if (!evaluation.methodValid) references.reviewReason = 'capture_method_unknown';
      else if (!chargeMatchesOrder) references.reviewReason = order ? 'order_changed' : 'order_not_found';
      else if (orderStatus === PF_ORDER.initialStatus) {
        orderSheet.getRange(orderRecord.rowNumber, 14).setValue('Confirmado');
        appendPaymentHistory_(references, { from: orderStatus, to: 'Confirmado', at: now.toISOString(), source, by: 'payment_check' });
        orderStatus = 'Confirmado';
        state = PF_CHECKOUT.states.confirmed;
        outcome = 'confirmed';
        references.confirmedAt = now.toISOString();
      } else if (PF_CHECKOUT.advancedOrderStatuses.includes(orderStatus)) {
        // Pedido já confirmado ou avançado manualmente: registra o pagamento sem tocar no status.
        state = PF_CHECKOUT.states.confirmed;
        outcome = 'already_advanced';
        references.confirmedAt = now.toISOString();
      } else {
        references.reviewReason = orderStatus === 'Cancelado' ? 'order_cancelled' : 'order_status_not_eligible';
      }
    }
    if (outcome !== 'pending') delete references.nextCheckAt;
    updateCheckoutRecord_(sheet, current.rowNumber, { state, references, updatedAt: now });
    return { outcome, orderStatus, record: Object.assign({}, current.record, { state, references }) };
  } finally {
    lock.releaseLock();
  }
}

function checkCheckoutPayment_(orderId) {
  const id = clean_(orderId);
  if (!id) throw apiError_('ORDER_ID_REQUIRED', 'Informe o pedido para conferir o pagamento.');
  const result = verifyCheckoutPayment_(id, { source: 'admin' });
  if (result.outcome === 'reference_pending') {
    throw apiError_('CHECKOUT_REFERENCE_PENDING', 'A transação ainda não retornou referências suficientes para consulta.');
  }
  if (result.outcome === 'provider_unavailable') {
    throw apiError_('INFINITEPAY_CHECK_FAILED', 'Não foi possível consultar a situação na InfinitePay.');
  }
  const refs = result.record.references || {};
  return Object.assign(checkoutAdminView_(result.record), {
    providerPaid: refs.providerPaid === true, paidAmountCents: Number(refs.providerPaidAmount || 0),
    amountMatches: refs.amountMatches === true, outcome: result.outcome,
    autoConfirmed: result.outcome === 'confirmed', orderStatus: result.orderStatus || '',
    subjectToManualReview: result.outcome !== 'confirmed' && result.outcome !== 'already_advanced' && result.outcome !== 'already_confirmed',
    checkedAt: refs.lastCheckedAt || ''
  });
}

// Resumo sem dados pessoais para a tela de obrigado.
function publicOrderSummary_(order) {
  return {
    id: order.id, status: order.status, totalQuantity: order.totalQuantity,
    items: (order.items || []).map(item => ({
      flavor: item.flavor, quantity: Number(item.quantity || 0), subtotal: Number(item.subtotal || 0),
      sizeId: item.sizeId || '', size: item.size || '', pricingModel: item.pricingModel || ''
    })),
    subtotal: order.subtotal, deliveryFee: order.deliveryFee, total: order.total,
    deliveryDate: order.deliveryDate, fulfillment: { mode: order.fulfillment && order.fulfillment.mode || '' }
  };
}

function publicPaymentStatus_(orderId) {
  const ss = getSpreadsheet_();
  const checkout = findCheckoutRecord_(ss.getSheetByName(PF.sheets.checkouts), orderId, '');
  const orderRecord = findOrderRecordById_(ss.getSheetByName(PF.sheets.orders), orderId);
  const order = orderRecord && orderResponseFromRow_(orderRecord.row, ss.getSpreadsheetTimeZone(), false,
    getOrderItemsById_(ss.getSheetByName(PF.sheets.orderItems), orderId));
  const record = checkout && checkout.record;
  // Só o estado gravado pelo servidor após o payment_check libera a tela de obrigado.
  // A cobrança é a fonte de verdade: mover o pedido para outra coluna não oculta um pagamento confirmado.
  const confirmed = Boolean(order && record) && record.state === PF_CHECKOUT.states.confirmed
    && order.status !== 'Cancelado';
  const refs = record && record.references || {};
  return {
    orderId,
    paymentState: confirmed ? 'confirmed' : 'verifying',
    reviewRequired: !confirmed && Boolean(refs.reviewReason),
    checkedAt: refs.lastCheckedAt || '',
    order: confirmed ? publicOrderSummary_(order) : null
  };
}

function verifyPublicCheckoutPayment_(body) {
  const orderId = orderText_(body, ['orderId', 'order_nsu'], 'pedido', 80, true);
  const token = orderText_(body, ['checkoutToken'], 'token de retorno', 256, true);
  authorizeCheckoutToken_(orderId, token);
  // Intervalo mínimo entre consultas à InfinitePay disparadas pelo navegador.
  const cache = CacheService.getScriptCache();
  const key = PF_CHECKOUT.publicCheckPrefix + hashCredential_(orderId).slice(0, 24);
  if (!cache.get(key)) {
    cache.put(key, '1', PF_CHECKOUT.publicCheckCooldownSeconds);
    try {
      verifyCheckoutPayment_(orderId, { source: 'customer' });
    } catch (error) {
      console.warn('Verificação pública não concluída: ' + sanitizeProviderText_(error && (error.code || 'erro')));
    }
  }
  return publicPaymentStatus_(orderId);
}

function pendingPaymentCandidates_(now) {
  const ss = getSpreadsheet_();
  const checkouts = getCheckoutsMap_(ss.getSheetByName(PF.sheets.checkouts));
  const statusByOrder = {};
  dataRows_(ss.getSheetByName(PF.sheets.orders)).forEach(row => { statusByOrder[String(row[0] || '')] = String(row[13] || ''); });
  return Object.keys(checkouts).map(orderId => checkouts[orderId]).filter(record => {
    const refs = record.references || {};
    if (record.state !== PF_CHECKOUT.states.returned || !refs.slug || !refs.transactionNsu) return false;
    // Etapa 11.1: o status operacional é livre; um pedido adiantado manualmente continua sendo conferido.
    if (statusByOrder[record.orderId] === undefined) return false;
    const nextCheck = new Date(refs.nextCheckAt || 0);
    if (!isNaN(nextCheck.getTime()) && nextCheck.getTime() > now.getTime()) return false;
    const expires = new Date(record.expiresAt || '');
    return isNaN(expires.getTime()) || expires.getTime() + PF_CHECKOUT.reconcileGraceMs > now.getTime();
  }).sort((left, right) => String(left.references.lastCheckedAt || '').localeCompare(String(right.references.lastCheckedAt || '')))
    .map(record => record.orderId);
}

/** Gatilho de tempo (instalado por installPaymentReconciliationTrigger): confere pagamentos pendentes. */
function reconcilePendingPayments() {
  const summary = { checked: 0, confirmed: 0, pending: 0, review: 0, failures: 0, skipped: '' };
  const cache = CacheService.getScriptCache();
  if (cache.get(PF_CHECKOUT.reconcileRunningKey)) return Object.assign(summary, { skipped: 'already_running' });
  cache.put(PF_CHECKOUT.reconcileRunningKey, '1', 6 * 60);
  const startedAt = Date.now();
  try {
    const integration = getInfinitePayConfig_();
    if (!integration.configured || !integration.handle) return Object.assign(summary, { skipped: 'not_configured' });
    const candidates = pendingPaymentCandidates_(currentBusinessDate_()).slice(0, PF_CHECKOUT.reconcileMaxChecksPerRun);
    for (let index = 0; index < candidates.length; index += 1) {
      if (Date.now() - startedAt > PF_CHECKOUT.reconcileMaxRuntimeMs) break;
      try {
        const result = verifyCheckoutPayment_(candidates[index], { source: 'reconciliation' });
        summary.checked += 1;
        if (result.outcome === 'confirmed') summary.confirmed += 1;
        else if (result.outcome === 'pending') summary.pending += 1;
        else if (result.outcome === 'provider_unavailable') summary.failures += 1;
        else summary.review += 1;
      } catch (error) {
        summary.failures += 1;
        console.warn('Conciliação não concluída: ' + sanitizeProviderText_(error && (error.code || 'erro')));
      }
    }
    return summary;
  } finally {
    cache.remove(PF_CHECKOUT.reconcileRunningKey);
    console.log('Conciliação InfinitePay: ' + JSON.stringify(summary));
  }
}

/** Execute manualmente somente após a homologação. Nunca cria um segundo gatilho. */
function installPaymentReconciliationTrigger() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const existing = ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === PF_CHECKOUT.reconcileHandler);
    existing.slice(1).forEach(trigger => ScriptApp.deleteTrigger(trigger));
    if (existing.length) return { installed: false, triggers: 1, removedDuplicates: existing.length - 1 };
    ScriptApp.newTrigger(PF_CHECKOUT.reconcileHandler).timeBased().everyMinutes(PF_CHECKOUT.reconcileEveryMinutes).create();
    return { installed: true, triggers: 1, removedDuplicates: 0 };
  } finally {
    lock.releaseLock();
  }
}

function removePaymentReconciliationTrigger() {
  const existing = ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === PF_CHECKOUT.reconcileHandler);
  existing.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  return { removed: existing.length };
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
  const order = createOrderRecord_(body);
  try {
    const orderWindow = getOrderWindow_(getConfig_(), currentBusinessDate_());
    order.checkout = ensureCheckoutForOrder_(order, checkoutDeadlineForOrder_(order, orderWindow));
  } catch (error) {
    // Falha antes de qualquer chamada à InfinitePay: nenhuma cobrança existe, o reenvio é seguro.
    console.warn('Checkout InfinitePay não iniciado: ' + sanitizeProviderText_(error && (error.code || error.message)));
    order.checkout = { state: 'failed', available: false, canRetry: true };
  }
  return order;
}

function createOrderRecord_(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw apiError_('INVALID_ORDER', 'Os dados do pedido não são válidos.');
  }

  const customerName = orderText_(body, ['customerName', 'name', 'cliente'], 'nome', PF_ORDER.maxNameLength, true);
  const whatsapp = orderText_(body, ['whatsapp', 'phone'], 'WhatsApp', PF_ORDER.maxWhatsappLength, true);
  const payment = orderText_(body, ['payment'], 'forma de pagamento', 120, false) || 'InfinitePay';
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

  const config = getConfig_();
  const now = currentBusinessDate_();
  const timezone = PF_ORDER.timezone;
  const orderWindow = getOrderWindow_(config, now);
  const itemIdentity = normalizeOrderItemIdentity_(body.items);
  const fulfillmentRequest = parseFulfillmentRequest_(body);
  const fingerprint = orderFingerprint_({
    customerName, whatsapp, requestedDate, time, payment,
    notes, source, items: itemIdentity,
    fulfillment: fulfillmentRequest.provided ? { mode: fulfillmentRequest.mode, address: fulfillmentRequest.address } : null
  });
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(PF.sheets.orders);
  const itemSheet = ss.getSheetByName(PF.sheets.orderItems);
  if (!itemSheet) throw apiError_('ORDER_ITEMS_NOT_CONFIGURED', 'Execute setupProject() para preparar o registro de itens.');
  const orderId = makeIdempotentOrderId_(idempotencyKey);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const existing = findOrderRecordById_(sheet, orderId);
    if (existing) {
      const existingFingerprint = String(existing.row[16] || '');
      if (existingFingerprint && !constantTimeEqual_(existingFingerprint, fingerprint)) {
        throw apiError_('IDEMPOTENCY_CONFLICT', 'Esta tentativa já foi usada com dados diferentes. Atualize a página e envie novamente.');
      }
      const existingItems = getOrderItemsById_(itemSheet, orderId);
      if (String(existing.row[17] || '') === 'pending') {
        const expectedCount = Number(existing.row[15] || 0);
        const persistedCount = existingItems.reduce((sum, item) => sum + item.quantity, 0);
        if (expectedCount !== persistedCount || !existingItems.length) {
          removeOrderPersistence_(sheet, itemSheet, existing.rowNumber, orderId);
        } else {
          sheet.getRange(existing.rowNumber, 18).setValue('committed');
          existing.row[17] = 'committed';
          return orderResponseFromRow_(existing.row, timezone, true, existingItems);
        }
      } else {
        return orderResponseFromRow_(existing.row, timezone, true, existingItems);
      }
    }

    if (!orderWindow.open) throw apiError_(orderWindow.code, orderWindow.message);
    const items = priceOrderItems_(itemIdentity, config);
    const integratedPayment = payment === 'InfinitePay' || payment === 'infinitepay';
    const paymentOption = integratedPayment
      ? { id: 'infinitepay', name: 'InfinitePay — PIX ou cartão', active: true }
      : config.payments.find(item =>
        (String(item.id) === payment || String(item.name) === payment) && item.active !== false
      );
    if (!paymentOption) {
      throw apiError_('INVALID_PAYMENT', 'A forma de pagamento selecionada não está disponível.');
    }
    const fulfillment = resolveFulfillment_(fulfillmentRequest, config.fulfillment);
    const productsCents = items.reduce((sum, item) => sum + item.subtotalCents, 0);
    const totalCents = productsCents + fulfillment.feeCents;
    const total = totalCents / 100;
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const address = fulfillment.address || {};
    enforceOrderRateLimit_(idempotencyKey);
    const deliveryDate = orderWindow.deliveryDate;
    const flavorSummary = items.map(item => item.flavor + ' × ' + item.quantity).join('; ');
    const sizeSummary = totalQuantity + (totalQuantity === 1 ? ' fatia' : ' fatias');
    const row = [
      orderId,
      now,
      sheetSafeText_(customerName),
      sheetSafeText_(whatsapp),
      deliveryDate,
      time,
      sheetSafeText_(flavorSummary),
      '',
      sheetSafeText_(sizeSummary),
      sheetSafeText_(totalQuantity + (totalQuantity === 1 ? ' fatia' : ' fatias') + ' · ' + items.length + (items.length === 1 ? ' sabor' : ' sabores')),
      total,
      sheetSafeText_(String(paymentOption.name || '')),
      sheetSafeText_(notes),
      PF_ORDER.initialStatus,
      sheetSafeText_(source),
      totalQuantity,
      fingerprint,
      'pending',
      fulfillment.mode,
      sheetSafeText_(address.cep || ''),
      sheetSafeText_(address.street || ''),
      sheetSafeText_(address.number || ''),
      sheetSafeText_(address.complement || ''),
      sheetSafeText_(address.neighborhood || ''),
      sheetSafeText_(address.city || ''),
      sheetSafeText_(address.state || ''),
      sheetSafeText_(address.reference || ''),
      productsCents,
      fulfillment.feeCents,
      totalCents,
      sheetSafeText_(fulfillment.instructions)
    ];
    let headerRowNumber = 0;
    let itemStartRow = 0;
    try {
      sheet.appendRow(row);
      headerRowNumber = sheet.getLastRow();
      itemStartRow = itemSheet.getLastRow() + 1;
      const itemRows = items.map((item, index) => [
        orderId, index + 1, sheetSafeText_(item.flavor), '',
        'Fatia', item.quantity, item.firstSlicePrice, item.subtotal,
        item.firstSlicePrice, item.additionalSlicePrice, item.savings, item.pricingModel
      ]);
      itemSheet.getRange(itemStartRow, 1, itemRows.length, PF.headers.PedidoItens.length).setValues(itemRows);
      sheet.getRange(headerRowNumber, 18).setValue('committed');
      row[17] = 'committed';
      return orderResponseFromRow_(row, timezone, false, items);
    } catch (persistenceError) {
      try {
        if (itemStartRow && itemSheet.getLastRow() >= itemStartRow) {
          itemSheet.deleteRows(itemStartRow, itemSheet.getLastRow() - itemStartRow + 1);
        }
        if (headerRowNumber && sheet.getLastRow() >= headerRowNumber) sheet.deleteRow(headerRowNumber);
      } catch (_) {
        throw apiError_('ORDER_RECOVERY_FAILED', 'O pedido não foi concluído e requer conferência administrativa antes de um novo envio.');
      }
      throw apiError_('ORDER_PERSISTENCE_FAILED', 'O pedido não foi concluído. Nenhum item foi confirmado; tente novamente.');
    }
  } finally {
    lock.releaseLock();
  }
}

function normalizeOrderItems_(rawItems, config) {
  return priceOrderItems_(normalizeOrderItemIdentity_(rawItems), config);
}

function normalizeOrderItemIdentity_(rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length) {
    throw apiError_('ORDER_ITEMS_REQUIRED', 'Adicione pelo menos um sabor à encomenda.');
  }
  const groups = {};
  rawItems.forEach(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw apiError_('INVALID_ORDER_ITEM', 'Um item da encomenda não possui formato válido.');
    }
    if (typeof raw.flavor !== 'string') {
      throw apiError_('INVALID_ORDER_ITEM', 'O sabor deve ser informado em cada item.');
    }
    const flavor = clean_(raw.flavor);
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > PF_ORDER.maxQuantityPerItem) {
      throw apiError_('INVALID_ITEM_QUANTITY', 'A quantidade de cada item deve ser um número inteiro entre 1 e ' + PF_ORDER.maxQuantityPerItem + '.');
    }
    const key = flavor;
    if (!groups[key]) {
      groups[key] = { flavor, quantity: 0 };
    }
    groups[key].quantity += quantity;
    if (groups[key].quantity > PF_ORDER.maxQuantityPerItem) {
      throw apiError_('INVALID_ITEM_QUANTITY', 'A quantidade agrupada de um item excede o limite de ' + PF_ORDER.maxQuantityPerItem + '.');
    }
  });
  const items = Object.keys(groups).map(key => groups[key]);
  if (items.length > PF_ORDER.maxDistinctItems) {
    throw apiError_('TOO_MANY_ORDER_ITEMS', 'A encomenda excede o limite de sabores diferentes.');
  }
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  if (totalQuantity > PF_ORDER.maxTotalQuantity) {
    throw apiError_('ORDER_QUANTITY_LIMIT', 'A encomenda excede o limite total de ' + PF_ORDER.maxTotalQuantity + ' fatias.');
  }
  return items;
}

function priceOrderItems_(identityItems, config) {
  const pricing = config.progressivePricing || {};
  const firstSliceCents = moneyToCents_(
    pricing.firstSlicePrice == null ? PF_PRICING.defaultFirstSliceCents / 100 : pricing.firstSlicePrice,
    'preço da primeira fatia'
  );
  const additionalSliceCents = moneyToCents_(
    pricing.additionalSlicePrice == null ? PF_PRICING.defaultAdditionalSliceCents / 100 : pricing.additionalSlicePrice,
    'preço da fatia adicional'
  );
  if (firstSliceCents < 1 || additionalSliceCents > firstSliceCents) {
    throw apiError_('INVALID_CATALOG', 'A configuração de preços progressivos não é válida.');
  }
  return identityItems.map(identityItem => {
    const item = { flavor: identityItem.flavor, quantity: identityItem.quantity };
    if (!config.flavors.includes(item.flavor)) {
      throw apiError_('INVALID_FLAVOR', 'Um sabor selecionado não está disponível.');
    }
    item.sizeId = '';
    item.size = 'Fatia';
    item.description = item.quantity === 1 ? '1 fatia' : item.quantity + ' fatias';
    item.firstSlicePrice = firstSliceCents / 100;
    item.additionalSlicePrice = additionalSliceCents / 100;
    item.unitPrice = item.firstSlicePrice;
    item.subtotalCents = firstSliceCents + (item.quantity - 1) * additionalSliceCents;
    item.subtotal = item.subtotalCents / 100;
    item.savingsCents = item.quantity * firstSliceCents - item.subtotalCents;
    item.savings = item.savingsCents / 100;
    item.pricingModel = PF_PRICING.model;
    return item;
  });
}

function orderFingerprint_(order) {
  const canonical = {
    customerName: order.customerName,
    whatsapp: order.whatsapp.replace(/\D/g, ''),
    requestedDate: order.requestedDate,
    time: order.time,
    payment: String(order.payment || ''),
    notes: order.notes,
    source: order.source,
    items: order.items.map(item => ({ flavor: item.flavor, quantity: item.quantity }))
      .sort((left, right) => left.flavor.localeCompare(right.flavor))
  };
  // Só entra quando informado, para manter a assinatura de pedidos enviados antes da Etapa 9.
  if (order.fulfillment) canonical.fulfillment = order.fulfillment;
  return hashCredential_(JSON.stringify(canonical));
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

function findOrderRecordById_(sheet, orderId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const rows = sheet.getRange(2, 1, lastRow - 1, orderSheetWidth_(sheet)).getValues();
  for (let index = 0; index < rows.length; index += 1) {
    if (String(rows[index][0] || '') === orderId) return { row: rows[index], rowNumber: index + 2 };
  }
  return null;
}

// Planilhas anteriores à Etapa 11.4 podem ter menos colunas que o cabeçalho atual.
function orderSheetWidth_(sheet) {
  const width = PF.headers.Pedidos.length;
  return typeof sheet.getMaxColumns === 'function' ? Math.max(1, Math.min(width, sheet.getMaxColumns())) : width;
}

function findOrderRowById_(sheet, orderId) {
  const record = findOrderRecordById_(sheet, orderId);
  return record && record.row;
}

function getOrderItemsMap_(sheet) {
  const itemsByOrder = {};
  if (!sheet || sheet.getLastRow() < 2) return itemsByOrder;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, PF.headers.PedidoItens.length).getValues()
    .sort((left, right) => Number(left[1] || 0) - Number(right[1] || 0))
    .forEach(row => {
      const orderId = String(row[0] || '');
      if (!orderId) return;
      if (!itemsByOrder[orderId]) itemsByOrder[orderId] = [];
      itemsByOrder[orderId].push({
      flavor: readableSheetText_(row[2]),
      sizeId: readableSheetText_(row[3]),
      size: readableSheetText_(row[4]),
      quantity: Number(row[5] || 0),
      unitPrice: Number(row[6] || 0),
      subtotal: Number(row[7] || 0),
      firstSlicePrice: Number(row[8] || 0),
      additionalSlicePrice: Number(row[9] || 0),
      savings: Number(row[10] || 0),
      pricingModel: readableSheetText_(row[11]) || 'legacy-size'
      });
    });
  return itemsByOrder;
}

function getOrderItemsById_(sheet, orderId) {
  return getOrderItemsMap_(sheet)[String(orderId)] || [];
}

function removeOrderPersistence_(orderSheet, itemSheet, orderRowNumber, orderId) {
  for (let rowNumber = itemSheet.getLastRow(); rowNumber >= 2; rowNumber -= 1) {
    const value = itemSheet.getRange(rowNumber, 1).getValues()[0][0];
    if (String(value || '') === String(orderId)) itemSheet.deleteRow(rowNumber);
  }
  orderSheet.deleteRow(orderRowNumber);
}

function sheetSafeText_(value) {
  const text = String(value == null ? '' : value);
  return /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
}

function readableSheetText_(value) {
  const text = String(value == null ? '' : value);
  return /^'[\s]*[=+\-@]/.test(text) ? text.slice(1) : text;
}

function orderResponseFromRow_(row, timezone, duplicate, persistedItems) {
  const createdAt = row[1] instanceof Date ? row[1] : new Date(row[1]);
  const deliveryDate = row[4] instanceof Date ? row[4] : new Date(row[4]);
  const validCreatedAt = !isNaN(createdAt.getTime());
  const validDeliveryDate = !isNaN(deliveryDate.getTime());
  const legacyItem = {
    flavor: readableSheetText_(row[6]),
    sizeId: readableSheetText_(row[7]),
    size: readableSheetText_(row[8]),
    description: readableSheetText_(row[9]),
    quantity: 1,
    unitPrice: Number(row[10] || 0),
    subtotal: Number(row[10] || 0),
    firstSlicePrice: 0,
    additionalSlicePrice: 0,
    savings: 0,
    pricingModel: 'legacy-order'
  };
  const items = Array.isArray(persistedItems) && persistedItems.length ? persistedItems : (legacyItem.flavor ? [legacyItem] : []);
  const totalQuantity = Number(row[15] || 0) || items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const total = Number(row[10] || 0);
  const fulfillment = orderFulfillmentFromRow_(row, total);
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
    price: total,
    total,
    totalQuantity,
    itemCount: items.length,
    items,
    payment: readableSheetText_(row[11]),
    notes: readableSheetText_(row[12]),
    status: String(row[13] || ''),
    fulfillment: fulfillment.details,
    subtotal: fulfillment.productsCents / 100,
    deliveryFee: fulfillment.feeCents / 100,
    deliveryFeeCents: fulfillment.feeCents,
    archivedAt: archivedAtText_(row[PF.headers.Pedidos.indexOf(PF_ARCHIVE.header)]),
    duplicate: duplicate === true
  };
}

// Colunas 19 a 31 (Etapa 9). Ausentes em pedidos antigos: subtotal = total e taxa zero.
function orderFulfillmentFromRow_(row, total) {
  const mode = PF_FULFILLMENT.modes.includes(String(row[18] || '')) ? String(row[18]) : '';
  const totalCentsCell = row[29];
  const hasCents = totalCentsCell !== '' && totalCentsCell !== null && totalCentsCell !== undefined && isFinite(Number(totalCentsCell));
  const totalCents = hasCents ? Number(totalCentsCell) : Math.round(total * 100);
  const feeCents = hasCents ? Number(row[28] || 0) : 0;
  const productsCents = hasCents ? Number(row[27] || 0) : totalCents;
  const address = mode === 'delivery'
    ? {
      cep: readableSheetText_(row[19]), street: readableSheetText_(row[20]), number: readableSheetText_(row[21]),
      complement: readableSheetText_(row[22]), neighborhood: readableSheetText_(row[23]), city: readableSheetText_(row[24]),
      state: readableSheetText_(row[25]), reference: readableSheetText_(row[26])
    }
    : null;
  return {
    productsCents, feeCents, totalCents,
    details: { mode, address, instructions: readableSheetText_(row[30]) }
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
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(PF.sheets.orders);
  const itemSheet = ss.getSheetByName(PF.sheets.orderItems);
  const itemsByOrder = getOrderItemsMap_(itemSheet);
  const checkoutsByOrder = getCheckoutsMap_(ss.getSheetByName(PF.sheets.checkouts));
  const tz = ss.getSpreadsheetTimeZone();
  return dataRows_(sheet).reverse().map(row => {
    const order = orderResponseFromRow_(row, tz, false, itemsByOrder[String(row[0] || '')] || []);
    order.source = readableSheetText_(row[14]);
    order.checkout = checkoutAdminView_(checkoutsByOrder[String(row[0] || '')]);
    delete order.duplicate;
    return order;
  });
}

function getCheckoutsMap_(sheet) {
  const byOrder = {};
  if (!sheet || sheet.getLastRow() < 2) return byOrder;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, PF.headers.CheckoutCobrancas.length).getValues()
    .forEach(row => {
      const record = checkoutRecordFromRow_(row);
      if (record.orderId) byOrder[record.orderId] = record;
    });
  return byOrder;
}



// O lock impede que uma alteração manual e a confirmação automática se sobreponham.
function updateOrderStatus_(orderId, status, options) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return writeOrderStatus_(orderId, status, options || {});
  } finally {
    lock.releaseLock();
  }
}

function statusConflictError_(currentStatus) {
  const error = apiError_('STATUS_CONFLICT', 'O pedido foi atualizado por outra operação. Os pedidos foram recarregados com o status mais recente.');
  error.currentStatus = currentStatus;
  return error;
}

/**
 * Etapa 11.1: movimentação livre entre os status canônicos (pular, voltar, reabrir e reativar).
 * Altera somente a coluna "Status" de Pedidos; a cobrança e seu histórico ficam intactos.
 */
function writeOrderStatus_(orderId, status, options) {
  const settings = options || {};
  if (!PF_ORDER.statuses.includes(status)) throw apiError_('INVALID_STATUS', 'Status inválido.');
  const id = String(orderId == null ? '' : orderId);
  const sheet = getSpreadsheet_().getSheetByName(PF.sheets.orders);
  const record = id ? findOrderRecordById_(sheet, id) : null;
  if (!record) throw apiError_('ORDER_NOT_FOUND', 'Pedido não encontrado.');

  // Relido dentro do lock: webhook, conciliação ou outra aba podem ter alterado o pedido.
  const currentStatus = String(record.row[13] || '');
  if (typeof settings.expectedStatus !== 'string' || settings.expectedStatus !== currentStatus) {
    throw statusConflictError_(currentStatus);
  }
  if (currentStatus === status) return { id, status: currentStatus, previousStatus: currentStatus, unchanged: true };
  if (archivedAtText_(record.row[PF.headers.Pedidos.indexOf(PF_ARCHIVE.header)])) {
    throw apiError_('ORDER_ARCHIVED', 'Desarquive o pedido antes de alterar o status.');
  }

  const cell = sheet.getRange(record.rowNumber, 14);
  cell.setValue(status);
  // Só responde sucesso depois de confirmar que o valor ficou gravado na planilha.
  if (typeof SpreadsheetApp.flush === 'function') SpreadsheetApp.flush();
  const persisted = String(cell.getValues()[0][0] || '');
  if (persisted !== status) throw apiError_('STATUS_WRITE_FAILED', 'Não foi possível confirmar a gravação do status na planilha.');
  return { id, status: persisted, previousStatus: currentStatus, unchanged: false };
}



function archivedAtText_(value) {
  if (value instanceof Date) return isNaN(value.getTime()) ? '' : value.toISOString();
  return String(value == null ? '' : value).trim();
}

// Cria a coluna "Arquivado em" no primeiro uso, sem tocar nas demais colunas ou linhas.
function ensureOrderArchiveColumn_(sheet) {
  const column = PF.headers.Pedidos.indexOf(PF_ARCHIVE.header) + 1;
  if (typeof sheet.getMaxColumns === 'function' && sheet.getMaxColumns() < column) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), column - sheet.getMaxColumns());
  }
  const header = sheet.getRange(1, column);
  if (!String((header.getValues()[0] || [])[0] || '')) header.setValue(PF_ARCHIVE.header);
  return column;
}

/**
 * Etapa 11.4: arquiva ou desarquiva sem excluir linhas nem alterar status, valores ou cobrança.
 * Idempotente; relê o pedido dentro do mesmo lock usado por status, webhook e conciliação.
 */
function setOrderArchived_(orderId, archive, options) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const settings = options || {};
    const id = String(orderId == null ? '' : orderId);
    const sheet = getSpreadsheet_().getSheetByName(PF.sheets.orders);
    const record = id ? findOrderRecordById_(sheet, id) : null;
    if (!record) throw apiError_('ORDER_NOT_FOUND', 'Pedido não encontrado.');
    const currentStatus = String(record.row[13] || '');
    if (typeof settings.expectedStatus !== 'string' || settings.expectedStatus !== currentStatus) {
      throw statusConflictError_(currentStatus);
    }
    const currentArchivedAt = archivedAtText_(record.row[PF.headers.Pedidos.indexOf(PF_ARCHIVE.header)]);
    if (Boolean(currentArchivedAt) === archive) {
      return { id, status: currentStatus, archivedAt: currentArchivedAt, unchanged: true };
    }
    if (archive && !PF_ARCHIVE.statuses.includes(currentStatus)) {
      throw apiError_('ORDER_NOT_ARCHIVABLE', 'Somente pedidos concluídos ou cancelados podem ser arquivados.');
    }
    const cell = sheet.getRange(record.rowNumber, ensureOrderArchiveColumn_(sheet));
    cell.setValue(archive ? currentBusinessDate_() : '');
    if (typeof SpreadsheetApp.flush === 'function') SpreadsheetApp.flush();
    const persisted = archivedAtText_(cell.getValues()[0][0]);
    if (Boolean(persisted) !== archive) {
      throw apiError_('ARCHIVE_WRITE_FAILED', 'Não foi possível confirmar a gravação do arquivamento na planilha.');
    }
    return { id, status: currentStatus, archivedAt: persisted, unchanged: false };
  } finally {
    lock.releaseLock();
  }
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



const PF_SETUP_NUMBER_FORMATS = [
  { sheet: 'sizes', range: 'D2:D', format: 'R$ #,##0.00' },
  { sheet: 'orders', range: 'B2:B', format: 'dd/MM/yyyy HH:mm:ss' },
  { sheet: 'orders', range: 'E2:E', format: 'dd/MM/yyyy' },
  { sheet: 'orders', range: 'K2:K', format: 'R$ #,##0.00' },
  // Uma coluna por chamada: uma coluna tipada não impede a formatação das vizinhas.
  { sheet: 'orderItems', range: 'G2:G', format: 'R$ #,##0.00' },
  { sheet: 'orderItems', range: 'H2:H', format: 'R$ #,##0.00' },
  { sheet: 'orderItems', range: 'I2:I', format: 'R$ #,##0.00' },
  { sheet: 'orderItems', range: 'J2:J', format: 'R$ #,##0.00' },
  { sheet: 'orderItems', range: 'K2:K', format: 'R$ #,##0.00' },
  { sheet: 'checkouts', range: 'F2:F', format: 'dd/MM/yyyy HH:mm:ss' },
  { sheet: 'checkouts', range: 'G2:G', format: 'dd/MM/yyyy HH:mm:ss' }
];

// Colunas de uma tabela do Sheets com tipo definido (data, moeda...) já controlam o próprio formato
// e recusam setNumberFormat. Só esse erro é tolerado; qualquer outro interrompe o setupProject().
function isTypedColumnFormatError_(error) {
  return /coluna com tipo|coluna tipada|typed column/i.test(String(error && error.message || ''));
}

function applyNumberFormat_(sheet, a1Range, format) {
  try {
    sheet.getRange(a1Range).setNumberFormat(format);
    // As alterações são enviadas em lote: o flush faz a recusa surgir aqui, ligada a este intervalo.
    SpreadsheetApp.flush();
    return true;
  } catch (error) {
    if (!isTypedColumnFormatError_(error)) throw error;
    console.warn('Formato mantido pela coluna tipada: ' + sheet.getName() + '!' + a1Range);
    return false;
  }
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


  // Envia antes as etapas anteriores: erros delas nunca são confundidos com os de formato.
  SpreadsheetApp.flush();
  PF_SETUP_NUMBER_FORMATS.forEach(item => {
    applyNumberFormat_(ss.getSheetByName(PF.sheets[item.sheet]), item.range, item.format);
  });

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
