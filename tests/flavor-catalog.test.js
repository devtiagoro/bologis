// Etapa 12: catálogo visual. Drive, cache e planilha são simulados; nenhum upload real é realizado.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'code.gs'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const bytes = value => Array.from(Buffer.from(value));
const LEGACY_HEADERS = ['ID', 'Nome', 'Ativo', 'Ordem'];
const HEADERS = ['ID', 'Nome', 'Ativo', 'Ordem', 'Subtítulo', 'Descrição', 'Badge', 'Imagem ID', 'Texto alternativo'];

// ---- Imagens sintéticas com estrutura real (assinatura, dimensões e término) ----
function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}
function pngChunk(type, data) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function png(width = 80, height = 72) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height, 0x7f);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', header), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))
  ]);
}
function jpeg(width = 120, height = 90) {
  const app0 = Buffer.from([0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xFF, 0xC0, 0x00, 0x11, 0x08, height >> 8, height & 0xFF, width >> 8, width & 0xFF, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
  const sos = Buffer.from([0xFF, 0xDA, 0x00, 0x0C, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00]);
  return Buffer.concat([Buffer.from([0xFF, 0xD8]), app0, sof, sos, Buffer.alloc(64, 0x55), Buffer.from([0xFF, 0xD9])]);
}
function webp(width = 200, height = 150) {
  const vp8x = Buffer.alloc(10);
  vp8x.writeUIntLE(width - 1, 4, 3); vp8x.writeUIntLE(height - 1, 7, 3);
  const chunkHeader = Buffer.concat([Buffer.from('VP8X', 'ascii'), Buffer.from([10, 0, 0, 0])]);
  const filler = Buffer.concat([Buffer.from('ALPH', 'ascii'), Buffer.from([40, 0, 0, 0]), Buffer.alloc(40)]);
  const payload = Buffer.concat([Buffer.from('WEBP', 'ascii'), chunkHeader, vp8x, filler]);
  const size = Buffer.alloc(4); size.writeUInt32LE(payload.length);
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), size, payload]);
}
const b64 = buffer => Buffer.from(buffer).toString('base64');
const upload = (buffer, mimeType = 'image/png', fileName = 'Foto do bolo.png') => ({ action: 'replace', fileName, mimeType, data: b64(buffer) });

// ---- Planilha, Drive e cache simulados ----
class FakeSheet {
  constructor(name, data, failures) { this.name = name; this.data = copy(data || []); this.hidden = false; this.failures = failures; }
  getLastRow() { return this.data.length; }
  getLastColumn() { return Math.max(1, ...this.data.map(row => row.length)); }
  getDataRange() { return this.getRange(1, 1, Math.max(this.getLastRow(), 1), this.getLastColumn()); }
  getRange(row, column, rowCount = 1, columnCount = 1) {
    const sheet = this;
    return {
      getValues() {
        return Array.from({ length: rowCount }, (_, y) => Array.from({ length: columnCount }, (_, x) => sheet.data[row - 1 + y]?.[column - 1 + x] ?? ''));
      },
      setValues(values) {
        sheet.maybeFail();
        values.forEach((sourceRow, y) => {
          const target = row - 1 + y;
          if (!sheet.data[target]) sheet.data[target] = [];
          sourceRow.forEach((value, x) => { sheet.data[target][column - 1 + x] = value; });
        });
      },
      clearContent() {
        for (let y = 0; y < rowCount; y += 1) for (let x = 0; x < columnCount; x += 1) if (sheet.data[row - 1 + y]) sheet.data[row - 1 + y][column - 1 + x] = '';
        while (sheet.data.length && sheet.data.at(-1).every(value => value === '')) sheet.data.pop();
      },
      setValue(value) { if (!sheet.data[row - 1]) sheet.data[row - 1] = []; sheet.data[row - 1][column - 1] = value; }
    };
  }
  maybeFail() {
    const remaining = Number(this.failures[this.name] || 0);
    if (remaining > 0) { this.failures[this.name] = remaining - 1; throw new Error(`Falha ficticia em ${this.name}`); }
  }
  appendRow(row) { this.data.push(row.slice()); }
  deleteRows(start, count) { this.data.splice(start - 1, count); }
  hideSheet() { this.hidden = true; }
}

function createDrive(options = {}) {
  const folders = new Map();
  const files = new Map();
  const stats = { foldersCreated: 0, filesCreated: 0, reads: 0 };
  let seq = 0;
  const makeFolder = name => {
    const id = `folder-ficticia-${String(++seq).padStart(6, '0')}`;
    const folder = {
      id, name, trashed: false, shared: false, description: '',
      getId: () => id, isTrashed: () => folder.trashed, setDescription(value) { folder.description = value; },
      createFile(blob) {
        const fileId = `arquivo-ficticio-${String(++seq).padStart(8, '0')}`;
        const file = {
          id: fileId, name: blob.getName(), mimeType: blob.getContentType(), content: blob.getBytes(), parent: id,
          trashed: false, sharing: null, description: '',
          getId: () => fileId, setDescription(value) { file.description = value; },
          setSharing(access, permission) {
            if (options.blockSharing) throw new Error('Compartilhamento bloqueado pela política fictícia.');
            file.sharing = [access, permission];
          },
          setTrashed(value) { file.trashed = value; },
          getBlob: () => { stats.reads += 1; return { getBytes: () => file.content.slice() }; }
        };
        files.set(fileId, file);
        stats.filesCreated += 1;
        return file;
      }
    };
    folders.set(id, folder);
    stats.foldersCreated += 1;
    return folder;
  };
  const DriveApp = {
    Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' },
    createFolder: makeFolder,
    getFolderById(id) { if (!folders.has(id)) throw new Error('Pasta inexistente'); return folders.get(id); },
    getFileById(id) { if (!files.has(id)) throw new Error('Arquivo inexistente'); return files.get(id); }
  };
  return { DriveApp, folders, files, stats };
}

function createHarness(options = {}) {
  const failures = {};
  const properties = new Map([['CONFIG_REVISION', '1'], ['SPREADSHEET_ID', 'planilha-ficticia']]);
  const sheets = new Map();
  const initial = {
    Configuracoes: [['Chave', 'Valor'], ['brandName', 'Primeira Fornada'], ['ordersEnabled', true], ['deliveryDay', 'sunday'], ['paymentDeadlineDay', 'thursday'], ['paymentDeadlineTime', '23:59:59']],
    // Planilha anterior à Etapa 12: somente as quatro colunas históricas.
    Sabores: options.sabores || [LEGACY_HEADERS, ['chocolate', 'Chocolate', true, 1], ['ninho', 'Ninho com morango', true, 2], ['cenoura', 'Cenoura', false, 3]],
    Tamanhos: [['ID', 'Nome', 'Descrição', 'Preço', 'Ativo', 'Ordem']],
    Pagamentos: [['ID', 'Nome', 'Tipo', 'Descrição', 'Link/Payload', 'Ativo', 'Ordem'], ['pix', 'PIX', 'pix', 'Pagamento PIX', '', true, 1]],
    Disponibilidade: [['Dia', 'Código', 'Aberto', 'Ordem'], ['Segunda-feira', 'monday', true, 1]]
  };
  Object.entries(initial).forEach(([name, data]) => sheets.set(name, new FakeSheet(name, data, failures)));
  const spreadsheet = {
    getSheetByName: name => sheets.get(name) || null,
    insertSheet(name) { const sheet = new FakeSheet(name, [], failures); sheets.set(name, sheet); return sheet; },
    getUrl: () => 'https://docs.google.com/spreadsheets/d/FICTICIO'
  };
  const drive = createDrive(options);
  const cache = new Map();
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
    CacheService: { getScriptCache: () => ({
      get: key => cache.get(key) || null,
      getAll: keys => Object.fromEntries(keys.filter(key => cache.has(key)).map(key => [key, cache.get(key)])),
      put: (key, value) => cache.set(key, String(value)),
      putAll: values => Object.entries(values).forEach(([key, value]) => cache.set(key, String(value))),
      remove: key => cache.delete(key)
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { openById: () => spreadsheet, flush() {} },
    DriveApp: drive.DriveApp,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      getUuid: () => `${String(++uuid).padStart(8, '0')}-0000-4000-8000-000000000000`,
      computeDigest: (_algorithm, value) => bytes(crypto.createHash('sha256').update(String(value)).digest()),
      computeHmacSha256Signature: (value, key) => bytes(crypto.createHmac('sha256', String(key)).update(String(value)).digest()),
      base64EncodeWebSafe: value => Buffer.from(value).toString('base64url'),
      base64DecodeWebSafe: value => bytes(Buffer.from(value, 'base64url')),
      // Como no Apps Script, os bytes decodificados chegam com sinal (-128..127).
      base64Decode: value => Array.from(new Int8Array(Buffer.from(String(value), 'base64'))),
      base64Encode: value => Buffer.from(Uint8Array.from(value, byte => byte & 0xFF)).toString('base64'),
      newBlob: (value, contentType, name) => {
        const buffer = Array.isArray(value) ? Buffer.from(Uint8Array.from(value, byte => byte & 0xFF)) : Buffer.from(String(value));
        return { getBytes: () => Array.from(buffer), getDataAsString: () => buffer.toString('utf8'), getContentType: () => contentType, getName: () => name };
      },
      formatDate: (_date, _tz, format) => format === 'u' ? '2' : format === 'yyyy-MM-dd' ? '2026-10-20' : format.includes("yyyy-MM-dd'T'") ? '2026-10-20T12:00:00-03:00' : '20261020-120000',
      parseDate: value => new Date(String(value).replace(' ', 'T') + '-03:00'), sleep() {}
    },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'code.gs' });
  context.getSpreadsheet_ = () => spreadsheet;
  const h = {
    context, sheets, failures, properties, drive, cache,
    rows: name => copy(sheets.get(name).data),
    revision: () => properties.get('CONFIG_REVISION'),
    save: (flavor, image, revision = h.revision()) => context.saveFlavor_(flavor, image, revision),
    flavor: id => context.getConfig_().flavorItems.find(item => item.id === id),
    registry: () => copy(sheets.get('_ImagensSabores')?.data || []).slice(1),
    configureAuth(key = 'chave-administrativa-ficticia') {
      properties.set('ADMIN_KEY_HASH', context.hashCredential_(key));
      properties.set('AUTH_SIGNING_SECRET', 'segredo-ficticio');
      properties.set('AUTH_VERSION', '1');
      return key;
    },
    post: payload => JSON.parse(context.doPost({ postData: { contents: JSON.stringify(payload) }, parameter: {} }).text),
    get: parameter => JSON.parse(context.doGet({ parameter }).text)
  };
  return h;
}

const expectCode = code => error => { assert.equal(error.code, code, `Esperado ${code}, recebido ${error.code}: ${error.message}`); return true; };

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('upload valido cria a foto na pasta do BOLOGIS, com nome interno seguro e leitura publica', () => {
  const h = createHarness();
  const result = h.save({ id: 'chocolate', name: 'Chocolate', subtitle: 'Massa de cacau', imageAlt: 'Fatia de bolo de chocolate' }, upload(png(), 'image/png', '../../etc/passwd<script>.png'));
  const flavor = h.flavor('chocolate');
  assert.match(flavor.imageId, /^arquivo-ficticio-/);
  assert.equal(result.revision, '2');
  assert.equal(result.imagePublic, true);
  const file = h.drive.files.get(flavor.imageId);
  assert.equal(file.parent, h.properties.get('FLAVOR_IMAGE_FOLDER_ID'), 'Foto fica na pasta exclusiva registrada nas propriedades.');
  assert.match(file.name, /^sabor-chocolate-20261020-120000-[0-9a-f]{8}\.png$/, 'Nome interno não reaproveita o nome enviado.');
  assert.equal(file.mimeType, 'image/png');
  assert.deepEqual(file.sharing, ['ANYONE_WITH_LINK', 'VIEW']);
  const folder = h.drive.folders.get(file.parent);
  assert.equal(folder.shared, false, 'A pasta em si não é compartilhada.');
  const registry = h.registry();
  assert.equal(registry.length, 1);
  assert.deepEqual(registry[0].slice(0, 8), [flavor.imageId, 'chocolate', 'active', 'image/png', png().length, 80, 72, true]);
  assert.equal(h.sheets.get('_ImagensSabores').hidden, true);
  const backups = h.rows('_ConfigBackups').slice(1);
  assert.equal(backups.at(-1)[3], 'flavor');
  assert.equal(backups.at(-1)[5], 'committed');
});

test('JPEG e WebP reais sao aceitos com dimensoes lidas do conteudo', () => {
  const h = createHarness();
  h.save({ id: 'chocolate', name: 'Chocolate' }, upload(jpeg(320, 240), 'image/jpeg', 'foto.JPEG'));
  h.save({ id: 'ninho', name: 'Ninho com morango' }, upload(webp(640, 480), 'image/webp', 'foto.webp'));
  const registry = h.registry();
  assert.deepEqual(registry.map(row => [row[3], row[5], row[6]]), [['image/jpeg', 320, 240], ['image/webp', 640, 480]]);
  assert.match(h.drive.files.get(registry[0][0]).name, /\.jpg$/);
});

test('upload reutiliza a mesma pasta e so recria se ela tiver sido excluida', () => {
  const h = createHarness();
  h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png()));
  h.save({ id: 'ninho', name: 'Ninho com morango' }, upload(png()));
  assert.equal(h.drive.stats.foldersCreated, 1);
  h.drive.folders.get(h.properties.get('FLAVOR_IMAGE_FOLDER_ID')).trashed = true;
  h.save({ id: 'ninho', name: 'Ninho com morango' }, upload(png()));
  assert.equal(h.drive.stats.foldersCreated, 2);
});

test('arquivos invalidos sao recusados: SVG, executavel, extensao divergente e conteudo truncado', () => {
  const h = createHarness();
  const before = h.rows('Sabores');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="100" height="100"/></svg>');
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, upload(svg, 'image/svg+xml', 'foto.svg')), expectCode('INVALID_IMAGE_TYPE'));
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, upload(svg, 'image/png', 'foto.png')), expectCode('INVALID_IMAGE_CONTENT'));
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0x90)]);
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, upload(exe, 'image/png', 'foto.png')), expectCode('INVALID_IMAGE_CONTENT'));
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png(), 'image/png', 'foto.php')), expectCode('INVALID_IMAGE_TYPE'));
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png(), 'image/png', 'foto')), expectCode('INVALID_IMAGE_TYPE'));
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png().subarray(0, 60), 'image/png', 'foto.png')), expectCode('INVALID_IMAGE_CONTENT'));
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png(10, 10), 'image/png', 'foto.png')), expectCode('INVALID_IMAGE_DIMENSIONS'));
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, { action: 'replace', fileName: 'a.png', mimeType: 'image/png', data: 'não é base64!' }), expectCode('INVALID_IMAGE_DATA'));
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, { action: 'url', url: 'https://exemplo.invalido/x.png' }), expectCode('INVALID_IMAGE_ACTION'));
  assert.deepEqual(h.rows('Sabores'), before);
  assert.equal(h.drive.stats.filesCreated, 0);
  assert.equal(h.revision(), '1', 'Nenhuma revisão nem backup para uploads recusados.');
  assert.equal(h.sheets.has('_ConfigBackups'), false);
});

test('MIME falsificado pelo navegador e recusado pela assinatura real', () => {
  const h = createHarness();
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png(), 'image/jpeg', 'foto.jpg')), expectCode('IMAGE_TYPE_MISMATCH'));
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, upload(jpeg(), 'image/webp', 'foto.webp')), expectCode('IMAGE_TYPE_MISMATCH'));
  assert.equal(h.drive.stats.filesCreated, 0);
});

test('imagem acima de 2 MB e recusada antes de chegar ao Drive', () => {
  const h = createHarness();
  const big = Buffer.concat([png().subarray(0, 33), Buffer.alloc(2 * 1024 * 1024, 1), png().subarray(-12)]);
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, upload(big)), expectCode('IMAGE_TOO_LARGE'));
  assert.equal(h.drive.stats.filesCreated, 0);
});

test('usuario sem autenticacao nao envia, substitui nem remove fotos', () => {
  const h = createHarness();
  h.configureAuth();
  const before = h.rows('Sabores');
  for (const image of [upload(png()), { action: 'remove' }]) {
    const anonymous = h.post({ action: 'saveFlavor', revision: '1', flavor: { id: 'chocolate', name: 'Chocolate' }, image });
    assert.equal(anonymous.ok, false);
    assert.equal(anonymous.code, 'AUTH_REQUIRED');
    const forged = h.post({ action: 'saveFlavor', adminToken: 'token.forjado', revision: '1', flavor: { id: 'chocolate', name: 'Chocolate' }, image });
    assert.equal(forged.ok, false);
    assert.match(forged.code, /^AUTH_/);
  }
  assert.equal(h.post({ action: 'getFlavorImage', flavorId: 'chocolate' }).code, 'AUTH_REQUIRED');
  assert.deepEqual(h.rows('Sabores'), before);
  assert.equal(h.drive.stats.filesCreated, 0);
});

test('administrador autenticado salva sabor com foto pelo doPost', () => {
  const h = createHarness();
  const key = h.configureAuth();
  const session = h.post({ action: 'createAdminSession', adminKey: key });
  const saved = h.post({ action: 'saveFlavor', adminToken: session.session.token, revision: '1', flavor: { name: 'Pistache', subtitle: 'Novo' }, image: upload(webp(), 'image/webp', 'pistache.webp') });
  assert.equal(saved.ok, true, saved.message);
  assert.equal(saved.flavorId, 'pistache');
  assert.equal(saved.revision, '2');
  assert.equal(saved.imagePublic, true);
  assert.match(saved.config.flavorItems.find(item => item.id === 'pistache').imageId, /^arquivo-ficticio-/);
});

test('corpo grande so e aceito para saveFlavor; demais acoes mantem o limite de 256 KB', () => {
  const h = createHarness();
  h.configureAuth();
  const padding = 'x'.repeat(400 * 1024);
  const order = h.post({ action: 'createOrder', notes: padding });
  assert.equal(order.code, 'REQUEST_TOO_LARGE');
  const photo = h.post({ action: 'saveFlavor', revision: '1', flavor: { id: 'chocolate', name: 'Chocolate' }, image: { action: 'replace', data: padding } });
  assert.equal(photo.code, 'AUTH_REQUIRED', 'Upload de até ~2,7 MB passa pelo limite e cai na autenticação.');
  const huge = h.post({ action: 'saveFlavor', revision: '1', image: { data: 'x'.repeat(3 * 1024 * 1024) } });
  assert.equal(huge.code, 'REQUEST_TOO_LARGE');
});

test('substituicao grava a nova foto e aposenta a anterior sem apaga-la', () => {
  const h = createHarness();
  h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png()));
  const first = h.flavor('chocolate').imageId;
  h.save({ id: 'chocolate', name: 'Chocolate' }, upload(jpeg(), 'image/jpeg', 'nova.jpg'));
  const second = h.flavor('chocolate').imageId;
  assert.notEqual(second, first);
  assert.equal(h.drive.files.get(first).trashed, false, 'Arquivo antigo permanece: backups ainda o referenciam.');
  assert.deepEqual(h.registry().map(row => [row[0], row[2]]), [[first, 'retired'], [second, 'active']]);
});

test('remocao limpa a referencia, mantem o sabor e aposenta o arquivo', () => {
  const h = createHarness();
  h.save({ id: 'ninho', name: 'Ninho com morango' }, upload(png()));
  const fileId = h.flavor('ninho').imageId;
  h.save({ id: 'ninho', name: 'Ninho com morango' }, { action: 'remove' });
  assert.equal(h.flavor('ninho').imageId, '');
  assert.equal(h.flavor('ninho').active, true);
  assert.equal(h.drive.files.get(fileId).trashed, false);
  assert.equal(h.registry()[0][2], 'retired');
  assert.ok(h.context.getPublicConfig_().flavors.includes('Ninho com morango'), 'Sabor sem foto continua no formulário.');
});

test('cadastro sem imagem cria ID estavel e o sabor aparece no formulario', () => {
  const h = createHarness();
  const result = h.save({ name: 'Doce de leite', subtitle: 'Com nozes', description: 'Massa amanteigada.', badge: 'Novo', order: 4 }, { action: 'keep' });
  assert.equal(result.flavorId, 'doce-de-leite');
  const flavor = h.flavor('doce-de-leite');
  assert.deepEqual([flavor.name, flavor.subtitle, flavor.badge, flavor.imageId, flavor.order, flavor.active], ['Doce de leite', 'Com nozes', 'Novo', '', 4, true]);
  assert.equal(h.drive.stats.foldersCreated, 0, 'Sem foto, o Drive nem é acessado.');
  assert.throws(() => h.save({ name: 'Doce de Leite ' }, {}), expectCode('DUPLICATE_FLAVOR_NAME'));
});

test('ID gerado nao colide com sabor existente e IDs desconhecidos sao recusados', () => {
  const h = createHarness({ sabores: [LEGACY_HEADERS, ['pistache', 'Pistache antigo', false, 1]] });
  const result = h.save({ name: 'Pistache' }, {});
  assert.equal(result.flavorId, 'pistache-2');
  assert.throws(() => h.save({ id: 'id-inventado', name: 'Outro' }, {}), expectCode('FLAVOR_NOT_FOUND'));
});

test('edicao de sabor antigo preserva ID, linhas historicas e ordem das colunas', () => {
  const h = createHarness();
  h.save({ id: 'chocolate', name: 'Chocolate Belga', subtitle: 'Receita da casa', description: 'Cacau 70%.', badge: 'Mais pedido', imageAlt: 'Bolo', active: true, order: 1 }, {});
  const rows = h.rows('Sabores');
  assert.deepEqual(rows[0], HEADERS, 'Cabeçalhos acrescentados à direita, sem reordenar.');
  assert.deepEqual(rows[1], ['chocolate', 'Chocolate Belga', true, 1, 'Receita da casa', 'Cacau 70%.', 'Mais pedido', '', 'Bolo']);
  assert.deepEqual(rows[2].slice(0, 4), ['ninho', 'Ninho com morango', true, 2]);
  assert.deepEqual(rows[3].slice(0, 4), ['cenoura', 'Cenoura', false, 3], 'Sabor inativo antigo não desaparece.');
  // O ID não muda ao renomear: pedidos antigos guardam o nome da época e o sabor continua identificável.
  assert.equal(h.flavor('chocolate').name, 'Chocolate Belga');
});

test('metadados persistem e o formulario recebe apenas sabores ativos com ID da foto', () => {
  const h = createHarness();
  h.save({ id: 'chocolate', name: 'Chocolate', subtitle: '=HYPERLINK("http://x")', description: '+cmd', badge: '@badge', imageAlt: '-alt' }, upload(png()));
  const row = h.rows('Sabores')[1];
  assert.equal(row[4], `'=HYPERLINK("http://x")`, 'Proteção contra fórmulas também nas colunas novas.');
  assert.equal(row[5], "'+cmd");
  const publicConfig = h.context.getPublicConfig_();
  assert.deepEqual(publicConfig.flavors, ['Chocolate', 'Ninho com morango']);
  const card = publicConfig.flavorCatalog.find(item => item.id === 'chocolate');
  assert.equal(card.subtitle, '=HYPERLINK("http://x")');
  assert.equal(card.badge, '@badge');
  assert.match(card.imageId, /^arquivo-ficticio-/);
  assert.equal(publicConfig.flavorCatalog.some(item => item.id === 'cenoura'), false);
  assert.equal(JSON.stringify(publicConfig).includes('FOLDER'), false);
  assert.equal(JSON.stringify(publicConfig).includes('docs.google.com'), false);
});

test('campos acima do limite e tipos invalidos sao recusados sem alterar a aba', () => {
  const h = createHarness();
  const before = h.rows('Sabores');
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate', description: 'x'.repeat(601) }, {}), expectCode('INVALID_FLAVOR_FIELD'));
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate', badge: { html: '<b>' } }, {}), expectCode('INVALID_FLAVOR_FIELD'));
  assert.throws(() => h.save({ id: 'chocolate', name: '   ' }, {}), expectCode('FLAVOR_NAME_REQUIRED'));
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate', subtitle: 'x'.repeat(121) }, upload(png())), expectCode('INVALID_FLAVOR_FIELD'));
  assert.equal(h.drive.stats.filesCreated, 0, 'Texto inválido é recusado antes de gravar a foto no Drive.');
  assert.deepEqual(h.rows('Sabores'), before);
  assert.equal(h.revision(), '1');
});

test('salvamento em lote de versao anterior preserva subtitulo, descricao e foto', () => {
  const h = createHarness();
  h.save({ id: 'chocolate', name: 'Chocolate', subtitle: 'Sub', description: 'Desc', badge: 'Novo', imageAlt: 'Alt' }, upload(png()));
  const imageId = h.flavor('chocolate').imageId;
  // Central antiga ainda em cache envia só id/nome/ativo/ordem.
  h.context.saveConfigDomain_('flavors', { flavorItems: [{ id: 'chocolate', name: 'Chocolate', active: false, order: 1 }, { id: 'ninho', name: 'Ninho com morango', active: true, order: 2 }] }, h.revision());
  const flavor = h.flavor('chocolate');
  assert.deepEqual([flavor.subtitle, flavor.description, flavor.badge, flavor.imageAlt, flavor.imageId, flavor.active], ['Sub', 'Desc', 'Novo', 'Alt', imageId, false]);
  assert.equal(h.flavor('cenoura').active, false, 'Sabor ausente do lote é apenas desativado.');
  assert.equal(h.rows('Sabores').every(row => row.length === 9), true);
});

test('cliente nao consegue apontar a foto para um arquivo arbitrario', () => {
  const h = createHarness();
  h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png()));
  const imageId = h.flavor('chocolate').imageId;
  h.context.saveConfigDomain_('flavors', { flavorItems: [{ id: 'chocolate', name: 'Chocolate', imageId: 'arquivo-privado-de-outra-pessoa', imageUrl: 'https://evil.example/x.png' }, { id: 'ninho', name: 'Ninho com morango', imageId: 'arquivo-privado-de-outra-pessoa' }] }, h.revision());
  assert.equal(h.flavor('chocolate').imageId, imageId);
  assert.equal(h.flavor('ninho').imageId, '');
  h.save({ id: 'ninho', name: 'Ninho com morango', imageId: 'arquivo-privado-de-outra-pessoa' }, { action: 'keep', fileId: 'arquivo-privado-de-outra-pessoa' });
  assert.equal(h.flavor('ninho').imageId, '');
});

test('revisao desatualizada gera conflito sem criar arquivo no Drive', () => {
  const h = createHarness();
  h.save({ id: 'chocolate', name: 'Chocolate' }, {});
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png()), '1'), error => error.code === 'CONFIG_CONFLICT' && error.currentRevision === '2');
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png()), ''), expectCode('CONFIG_REVISION_REQUIRED'));
  assert.equal(h.drive.stats.filesCreated, 0);
});

test('falha ao gravar a aba restaura o snapshot e descarta a foto recem-enviada', () => {
  const h = createHarness({ sabores: [HEADERS, ['chocolate', 'Chocolate', true, 1, 'Sub', '', '', '', '']] });
  const before = h.rows('Sabores');
  h.failures.Sabores = 1; // falha na gravação das linhas; a restauração do snapshot funciona
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png())), expectCode('CONFIG_SAVE_FAILED'));
  assert.deepEqual(h.rows('Sabores'), before);
  assert.equal(h.revision(), '1');
  const [fileId, , state] = h.registry()[0];
  assert.equal(state, 'discarded');
  assert.equal(h.drive.files.get(fileId).trashed, true, 'Arquivo sem nenhuma referência não fica órfão.');
  assert.equal(h.rows('_ConfigBackups').at(-1)[5], 'recovered');
});

test('recuperacao pendente bloqueia novos envios de foto', () => {
  const h = createHarness();
  h.properties.set('CONFIG_RECOVERY_REQUIRED', 'CFG-1');
  assert.throws(() => h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png())), expectCode('CONFIG_RECOVERY_REQUIRED'));
  assert.equal(h.drive.stats.filesCreated, 0);
});

test('restauracao de backup volta a foto anterior e ela continua disponivel', () => {
  const h = createHarness();
  h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png()));
  const first = h.flavor('chocolate').imageId;
  const replaced = h.save({ id: 'chocolate', name: 'Chocolate' }, upload(webp(), 'image/webp', 'b.webp'));
  h.context.restoreConfigBackup_(replaced.backupId, h.revision());
  assert.equal(h.flavor('chocolate').imageId, first);
  assert.equal(h.context.getFlavorImage_('chocolate', false).mimeType, 'image/png', 'Foto aposentada ainda é servida após a restauração.');
});

test('compartilhamento bloqueado pela conta nao impede o cadastro e o fallback continua servindo', () => {
  const h = createHarness({ blockSharing: true });
  const result = h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png()));
  assert.equal(result.imagePublic, false);
  assert.equal(h.registry()[0][7], false);
  const image = h.get({ action: 'getFlavorImage', flavorId: 'chocolate' });
  assert.equal(image.ok, true);
  assert.equal(image.image.data, b64(png()));
});

test('fallback publico serve so sabores ativos e somente fotos registradas pelo BOLOGIS', () => {
  const h = createHarness();
  h.save({ id: 'chocolate', name: 'Chocolate' }, upload(jpeg(), 'image/jpeg', 'a.jpg'));
  const first = h.get({ action: 'getFlavorImage', flavorId: 'chocolate' });
  assert.equal(first.ok, true);
  assert.equal(first.image.mimeType, 'image/jpeg');
  assert.equal(first.image.data, b64(jpeg()));
  h.get({ action: 'getFlavorImage', flavorId: 'chocolate' });
  assert.equal(h.drive.stats.reads, 1, 'Segunda leitura vem do cache.');
  assert.equal(h.get({ action: 'getFlavorImage', flavorId: 'ninho' }).code, 'FLAVOR_IMAGE_NOT_FOUND');
  // Alguém edita a planilha manualmente apontando para outro arquivo do Drive: o servidor não o lê.
  const sheet = h.sheets.get('Sabores');
  sheet.data[2][7] = 'arquivo-privado-qualquer-123';
  assert.equal(h.get({ action: 'getFlavorImage', flavorId: 'ninho' }).code, 'FLAVOR_IMAGE_NOT_FOUND');
  h.save({ id: 'chocolate', name: 'Chocolate', active: false }, {});
  assert.equal(h.get({ action: 'getFlavorImage', flavorId: 'chocolate' }).code, 'FLAVOR_IMAGE_NOT_FOUND', 'Sabor inativo não é exposto no público.');
  assert.equal(h.context.getFlavorImage_('chocolate', true).mimeType, 'image/jpeg', 'Central autenticada ainda vê a foto do sabor inativo.');
});

test('limpeza manual so envia a lixeira fotos aposentadas, antigas e sem referencia', () => {
  const h = createHarness();
  h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png()));
  const old = h.flavor('chocolate').imageId;
  h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png(90, 90)));
  const current = h.flavor('chocolate').imageId;
  let result = copy(h.context.cleanupRetiredFlavorImages());
  assert.deepEqual(result, { trashed: 0, kept: 1 }, 'Foto recém-aposentada respeita o prazo de carência.');
  const registry = h.sheets.get('_ImagensSabores');
  registry.data[1][9] = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  result = copy(h.context.cleanupRetiredFlavorImages());
  assert.deepEqual(result, { trashed: 0, kept: 1 }, 'Foto referenciada por backup não é removida.');
  h.sheets.get('_ConfigBackups').data.splice(1);
  result = copy(h.context.cleanupRetiredFlavorImages());
  assert.deepEqual(result, { trashed: 1, kept: 0 });
  assert.equal(h.drive.files.get(old).trashed, true);
  assert.equal(h.drive.files.get(current).trashed, false, 'Foto em uso nunca é removida.');
  assert.equal(h.registry()[0][2], 'trashed');
});

test('ID de imagem invalido gravado manualmente e ignorado na configuracao', () => {
  const h = createHarness({ sabores: [HEADERS, ['chocolate', 'Chocolate', true, 1, '', '', '', 'javascript:alert(1)', '']] });
  assert.equal(h.flavor('chocolate').imageId, '');
  assert.equal(h.context.getPublicConfig_().flavorCatalog[0].imageId, '');
});

test('pedido continua validado pelo nome do sabor ativo com precos progressivos', () => {
  const h = createHarness();
  h.save({ id: 'chocolate', name: 'Chocolate' }, upload(png()));
  const config = h.context.getConfig_();
  config.progressivePricing = { firstSlicePrice: 19.97, additionalSlicePrice: 15 };
  const items = h.context.normalizeOrderItems_([{ flavor: 'Chocolate', quantity: 3 }, { flavor: 'Ninho com morango', quantity: 1 }], config);
  assert.deepEqual(items.map(item => [item.flavor, item.subtotal]), [['Chocolate', 49.97], ['Ninho com morango', 19.97]]);
  assert.throws(() => h.context.normalizeOrderItems_([{ flavor: 'Cenoura', quantity: 1 }], config), expectCode('INVALID_FLAVOR'));
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) { failed += 1; console.error(`FAIL ${name}`); console.error(error.stack || error); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} testes aprovados`);
  if (failed) process.exitCode = 1;
})();
