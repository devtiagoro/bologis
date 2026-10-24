const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'code.gs'), 'utf8');
const TYPED_ERROR = 'Exception: Não é possível definir o formato de número das células em uma coluna com tipo.';

function columnNumber(letters) {
  return letters.split('').reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0);
}

// Planilha simulada: como no Sheets, as alterações ficam em fila e as recusas só aparecem no flush().
function createSpreadsheet(options = {}) {
  const sheets = new Map();
  const pending = [];
  const typedColumns = options.typedColumns || {};
  const state = { flushes: 0, failFlushOnce: options.failFlushOnce || null, formats: {} };

  function makeSheet(name, initialRows = []) {
    const rows = initialRows.map(row => row.slice());
    const sheet = {
      rows,
      getName: () => name,
      getLastRow: () => rows.length,
      getLastColumn: () => rows.reduce((max, row) => Math.max(max, row.length), 0),
      setFrozenRows() {}, autoResizeColumns() {}, hideSheet() {},
      getRange(rowOrA1, column, rowCount = 1, columnCount = 1) {
        if (typeof rowOrA1 === 'string') {
          const [, first, last] = rowOrA1.match(/^([A-Z]+)\d+:([A-Z]+)$/);
          const columns = [];
          for (let index = columnNumber(first); index <= columnNumber(last); index += 1) columns.push(index);
          return {
            setNumberFormat(format) {
              pending.push(() => {
                const typed = columns.find(index => (typedColumns[name] || []).includes(index));
                if (typed) throw new Error(TYPED_ERROR);
                columns.forEach(index => { state.formats[name + ':' + index] = format; });
              });
              return this;
            }
          };
        }
        const row = rowOrA1;
        return {
          getValues: () => Array.from({ length: rowCount }, (_, r) =>
            Array.from({ length: columnCount }, (_, c) => (rows[row - 1 + r] || [])[column - 1 + c] ?? '')),
          setValues(values) {
            values.forEach((value, r) => {
              const target = rows[row - 1 + r] || (rows[row - 1 + r] = []);
              value.forEach((cell, c) => { target[column - 1 + c] = cell; });
            });
            return this;
          },
          setValue(value) { (rows[row - 1] || (rows[row - 1] = []))[column - 1] = value; return this; },
          clearContent() {
            for (let r = 0; r < rowCount; r += 1) {
              for (let c = 0; c < columnCount; c += 1) if (rows[row - 1 + r]) rows[row - 1 + r][column - 1 + c] = '';
            }
            while (rows.length > 1 && rows[rows.length - 1].every(cell => cell === '' || cell === undefined)) rows.pop();
            return this;
          },
          setFontWeight() { return this; }
        };
      },
      appendRow: row => rows.push(row.slice())
    };
    sheets.set(name, sheet);
    return sheet;
  }

  Object.entries(options.sheets || {}).forEach(([name, rows]) => makeSheet(name, rows));
  const spreadsheet = {
    getId: () => 'planilha-de-teste',
    setSpreadsheetTimeZone(value) { state.timezone = value; },
    getSheetByName: name => sheets.get(name) || null,
    insertSheet: name => makeSheet(name)
  };
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => spreadsheet,
    flush() {
      state.flushes += 1;
      if (state.failFlushOnce) {
        const message = state.failFlushOnce;
        state.failFlushOnce = null;
        pending.length = 0;
        throw new Error(message);
      }
      while (pending.length) pending.shift()();
    }
  };
  return { spreadsheet, sheets, state, SpreadsheetApp };
}

function createRuntime(sheetOptions = {}) {
  const sheet = createSpreadsheet(sheetOptions);
  const properties = new Map(Object.entries(sheetOptions.properties || {}));
  const logs = [];
  const context = {
    Date, JSON, Math, String, Number, Object, Array, Error, RegExp, isFinite, isNaN,
    console: { log: message => logs.push(String(message)), warn: message => logs.push(String(message)), error() {} },
    SpreadsheetApp: sheet.SpreadsheetApp,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties.get(key) || null,
      setProperty: (key, value) => properties.set(key, String(value))
    }) }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'code.gs' });
  return { ...sheet, context, properties, logs, setup: () => context.setupProject() };
}

const snapshot = rows => JSON.parse(JSON.stringify(rows));

const historicalOrder = ['PF-20260831-113122-AB3E86', '2026-08-31T14:31:22Z', 'Cliente Histórico', '34999990000', '2026-09-06', '00:00', 'Choconinho', '3f', '3 Fatias', '', 49.97, 'PIX', 'Sem nozes', 'Concluído', 'site'];
const checkoutRow = ['PF-I-HIST', 'v1', 'https://checkout.infinitepay.com.br/hist', 'invoice-hist', 5494, '2026-10-20T15:00:00Z', '2026-10-22T23:59:59Z', 'paid_confirmed', '', '{"slug":"invoice-hist","transactionNsu":"tx-hist","history":[{"from":"Aguardando pagamento","to":"Confirmado"}]}', '2026-10-20T15:05:00Z'];

function existingSheets() {
  return {
    Configuracoes: [['Chave', 'Valor'], ['brandName', 'Primeira Fornada'], ['deliveryFee', 8], ['businessWhatsapp', '(34) 99999-0000'], ['firstSlicePrice', 21.5]],
    Pedidos: [['Pedido ID', 'Criado em'], historicalOrder],
    CheckoutCobrancas: [['Pedido ID'], checkoutRow],
    Sabores: [['ID', 'Nome', 'Ativo', 'Ordem'], ['choconinho', 'Choconinho', true, 1]]
  };
}

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('planilha comum: cria abas, cabecalhos, padroes e todos os formatos', () => {
  const runtime = createRuntime();
  runtime.setup();
  assert.equal(runtime.properties.get('SPREADSHEET_ID'), 'planilha-de-teste');
  assert.equal(runtime.state.timezone, 'America/Sao_Paulo');
  for (const name of ['Configuracoes', 'Sabores', 'Tamanhos', 'Pagamentos', 'Disponibilidade', 'Pedidos', 'PedidoItens', 'CheckoutCobrancas']) {
    assert.ok(runtime.sheets.get(name), name);
  }
  assert.equal(runtime.sheets.get('Pedidos').rows[0].length, 32);
  assert.equal(runtime.sheets.get('Pedidos').rows[0][31], 'Arquivado em');
  assert.equal(runtime.sheets.get('CheckoutCobrancas').rows[0][9], 'Referências JSON');
  assert.equal(runtime.state.formats['Pedidos:11'], 'R$ #,##0.00');
  assert.equal(runtime.state.formats['PedidoItens:7'], 'R$ #,##0.00');
  assert.equal(runtime.state.formats['PedidoItens:11'], 'R$ #,##0.00');
  assert.equal(runtime.state.formats['CheckoutCobrancas:7'], 'dd/MM/yyyy HH:mm:ss');
  assert.equal(runtime.logs.at(-1), 'Projeto configurado com sucesso.');
});

test('o comportamento anterior reproduz a excecao no flush final', () => {
  const runtime = createRuntime({ typedColumns: { Pedidos: [11] } });
  // Formatação original, em lote, seguida do flush final do setupProject().
  runtime.context.formatSheets_ = ss => ss.getSheetByName('Pedidos').getRange('K2:K').setNumberFormat('R$ #,##0.00');
  assert.throws(() => runtime.setup(), error => error.message === TYPED_ERROR);
});

test('coluna tipada e preservada e o setupProject conclui', () => {
  const runtime = createRuntime({ typedColumns: { Pedidos: [2, 11], PedidoItens: [8] } });
  runtime.setup();
  assert.equal(runtime.state.formats['Pedidos:11'], undefined, 'Formato da coluna tipada não é alterado.');
  assert.equal(runtime.state.formats['Pedidos:2'], undefined);
  assert.equal(runtime.state.formats['Pedidos:5'], 'dd/MM/yyyy');
  assert.equal(runtime.state.formats['PedidoItens:8'], undefined);
  assert.equal(runtime.state.formats['PedidoItens:7'], 'R$ #,##0.00', 'Colunas vizinhas continuam formatadas.');
  assert.equal(runtime.state.formats['PedidoItens:9'], 'R$ #,##0.00');
  assert.ok(runtime.logs.includes('Formato mantido pela coluna tipada: Pedidos!K2:K'));
  assert.ok(runtime.logs.includes('Formato mantido pela coluna tipada: PedidoItens!H2:H'));
  assert.equal(runtime.logs.at(-1), 'Projeto configurado com sucesso.');
});

test('mensagem em ingles de coluna tipada tambem e reconhecida', () => {
  const runtime = createRuntime();
  assert.equal(runtime.context.isTypedColumnFormatError_(new Error("Exception: You can't set the number format of cells in a typed column.")), true);
  assert.equal(runtime.context.isTypedColumnFormatError_(new Error('Service Spreadsheets failed while accessing document')), false);
  assert.equal(runtime.context.isTypedColumnFormatError_(null), false);
});

test('outros erros de formatacao continuam interrompendo o setupProject', () => {
  const failing = createRuntime();
  failing.context.formatSheets_ = ss => {
    failing.state.failFlushOnce = 'Service Spreadsheets failed while accessing document';
    failing.context.applyNumberFormat_(ss.getSheetByName('Pedidos'), 'K2:K', 'R$ #,##0.00');
  };
  assert.throws(() => failing.setup(), /Service Spreadsheets failed/);
});

test('erros anteriores ao formato nao sao tolerados como coluna tipada', () => {
  const runtime = createRuntime();
  const originalFormat = runtime.context.formatSheets_;
  runtime.context.formatSheets_ = ss => {
    runtime.state.failFlushOnce = TYPED_ERROR;
    ss.getSheetByName('Pedidos').getRange('K2:K').setNumberFormat('R$ #,##0.00');
    originalFormat(ss);
  };
  assert.throws(() => runtime.setup(), error => error.message === TYPED_ERROR, 'O flush anterior ao laço fica fora do tratamento.');
});

test('reexecucao e idempotente', () => {
  const runtime = createRuntime({ typedColumns: { Pedidos: [11] } });
  runtime.setup();
  const first = snapshot(Object.fromEntries([...runtime.sheets].map(([name, sheet]) => [name, sheet.rows])));
  runtime.setup();
  runtime.setup();
  const third = snapshot(Object.fromEntries([...runtime.sheets].map(([name, sheet]) => [name, sheet.rows])));
  assert.deepEqual(third, first);
  assert.equal(runtime.sheets.get('Sabores').rows.length, 5, 'Sabores padrão não são duplicados.');
  assert.equal(runtime.sheets.get('Configuracoes').rows.filter(row => row[0] === 'deliveryDay').length, 1);
});

test('falha apos inicializacao parcial e recuperada pela reexecucao', () => {
  const runtime = createRuntime({ sheets: existingSheets() });
  runtime.context.formatSheets_ = () => {
    runtime.state.failFlushOnce = 'Service Spreadsheets timed out';
    runtime.SpreadsheetApp.flush();
  };
  assert.throws(() => runtime.setup(), /timed out/);
  assert.equal(runtime.properties.get('SPREADSHEET_ID'), 'planilha-de-teste', 'Etapas anteriores já foram gravadas.');
  const clean = createRuntime({ sheets: existingSheets() });
  clean.setup();
  const recovered = createRuntime({ sheets: Object.fromEntries([...runtime.sheets].map(([name, sheet]) => [name, sheet.rows])) });
  recovered.setup();
  assert.deepEqual(
    snapshot(Object.fromEntries([...recovered.sheets].map(([name, sheet]) => [name, sheet.rows]))),
    snapshot(Object.fromEntries([...clean.sheets].map(([name, sheet]) => [name, sheet.rows])))
  );
});

test('dados historicos, configuracoes e CheckoutCobrancas sao preservados', () => {
  const runtime = createRuntime({ sheets: existingSheets(), typedColumns: { Pedidos: [2, 5, 11], CheckoutCobrancas: [6, 7] } });
  runtime.setup();
  runtime.setup();
  assert.deepEqual(snapshot(runtime.sheets.get('Pedidos').rows[1]), historicalOrder);
  assert.equal(runtime.sheets.get('Pedidos').rows.length, 2);
  assert.deepEqual(snapshot(runtime.sheets.get('CheckoutCobrancas').rows[1]), checkoutRow);
  assert.equal(runtime.sheets.get('CheckoutCobrancas').rows.length, 2);
  const config = Object.fromEntries(runtime.sheets.get('Configuracoes').rows.slice(1));
  assert.equal(config.brandName, 'Primeira Fornada');
  assert.equal(config.deliveryFee, 8);
  assert.equal(config.businessWhatsapp, '(34) 99999-0000');
  assert.equal(config.firstSlicePrice, 21.5, 'Preço configurado não é substituído pelo padrão.');
  assert.equal(config.deliveryEnabled, false, 'Padrão ausente é apenas acrescentado.');
  assert.deepEqual(snapshot(runtime.sheets.get('Sabores').rows), [['ID', 'Nome', 'Ativo', 'Ordem'], ['choconinho', 'Choconinho', true, 1]]);
  assert.equal(runtime.state.formats['CheckoutCobrancas:6'], undefined);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed += 1; console.log(`PASS ${name}`); }
    catch (error) { console.error(`FAIL ${name}`); console.error(error.stack || error); process.exitCode = 1; }
  }
  console.log(`\n${passed}/${tests.length} testes aprovados`);
})();
