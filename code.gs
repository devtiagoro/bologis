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


function apiError_(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}


function nextDeliverySunday_(date) {
  const result = new Date(date.getTime());
  const currentDay = Number(Utilities.formatDate(result, 'America/Sao_Paulo', 'u')) % 7;
  let days = (0 - currentDay + 7) % 7;
  if (days === 0) days = 7;
  result.setDate(result.getDate() + days);
  result.setHours(12, 0, 0, 0);
  return result;
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
  console.log('SPREADSHEET_ID: ' + ss.getId());
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


    if (action === 'getConfig') {

      return json_({
        ok: true,
        config: getConfig_()
      });

    }


    if (action === 'getOrders') {

      return json_({
        ok: true,
        orders: getOrders_()
      });

    }


    return json_({
      ok: false,
      message: 'Ação GET inválida: ' + action
    });


  } catch (error) {

    return json_({
      ok: false,
      code: error.code || '',
      message: error.message || String(error)
    });

  }

}



function doPost(e) {

  try {

    const body = parseBody_(e);

    const action = String(
      body.action || ''
    );


    if (action === 'createOrder') {

      const order = createOrder_(body);

      return json_({
        ok: true,
        order,
        orderId: order.id
      });

    }


    if (action === 'saveConfig') {

      saveConfig_(
        body.config || {}
      );

      return json_({
        ok: true,
        config: getConfig_()
      });

    }


    if (action === 'updateOrderStatus') {

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

    return json_({
      ok: false,
      code: error.code || '',
      message: error.message || String(error)
    });

  }

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
          : String(row[1]);

    }

  });



  const flavors =
    dataRows_(
      ss.getSheetByName(
        PF.sheets.flavors
      )
    )

    .filter(
      row =>
        row[1] &&
        isActive_(row[2])
    )

    .sort(
      (a, b) =>
        Number(a[3] || 9999)
        -
        Number(b[3] || 9999)
    )

    .map(
      row => String(row[1])
    );



  const sizes = dataRows_(ss.getSheetByName(PF.sheets.sizes))
    .filter(row => row[1] && isActive_(row[4]))
    .sort((a, b) => Number(a[5] || 9999) - Number(b[5] || 9999))
    .map(row => ({
      id: String(row[0] || ''),
      name: String(row[1] || ''),
      description: String(row[2] || ''),
      price: Number(row[3] || 0)
    }));

  const payments = dataRows_(ss.getSheetByName(PF.sheets.payments))
    .filter(row => row[1])
    .sort((a, b) => Number(a[6] || 9999) - Number(b[6] || 9999))
    .map(row => ({
      id: String(row[0] || ''),
      name: String(row[1] || ''),
      type: String(row[2] || ''),
      description: String(row[3] || ''),
      paymentLink: String(row[4] || ''),
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
      deliveryDay: values.deliveryDay || 'sunday',
      paymentDeadlineDay: values.paymentDeadlineDay || 'thursday',
      paymentDeadlineTime: normalizeTime_(values.paymentDeadlineTime)
    },

    spreadsheetUrl: ss.getUrl()

  };

}



function saveConfig_(config) {

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
      payment.paymentLink || existingPaymentLinks[id] || '',
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



function createOrder_(body) {

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

  const now = new Date();
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
          String(
            row[2] || ''
          ),

        whatsapp:
          String(
            row[3] || ''
          ),

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
          String(
            row[6] || ''
          ),

        sizeId:
          String(
            row[7] || ''
          ),

        size:
          String(
            row[8] || ''
          ),

        description:
          String(
            row[9] || ''
          ),

        price:
          Number(
            row[10] || 0
          ),

        payment:
          String(
            row[11] || ''
          ),

        notes:
          String(
            row[12] || ''
          ),

        status:
          String(
            row[13]
            || 'Aguardando pagamento'
          ),

        source:
          String(
            row[14] || ''
          )

      })
    );

}



function updateOrderStatus_(
  orderId,
  status
) {

  const allowed = [

    'Aguardando pagamento',
    'Confirmado',

    'Em produção',

    'Concluído',

    'Cancelado'

  ];


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

  return text;

}