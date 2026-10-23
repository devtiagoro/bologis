const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepareHomologation } = require('../scripts/prepare-homologation');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const currentEndpoint = source.match(/const APPS_SCRIPT_URL = '([^']+)'/)[1];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bologis-hml-'));

function run(endpoint, outputName) {
  return prepareHomologation({ endpoint, outputPath: path.join(tempRoot, outputName) });
}

try {
  const fakeEndpoint = 'https://script.google.com/macros/s/AKfycb-HOMOLOGACAO_FICTICIA_123/exec';
  run(fakeEndpoint, 'success.html');
  const generated = fs.readFileSync(path.join(tempRoot, 'success.html'), 'utf8');
  assert.match(generated, /C.PIA LOCAL DE HOMOLOGA..O: N.O PUBLICAR/i);
  assert.ok(generated.includes(`const APPS_SCRIPT_URL = '${fakeEndpoint}';`));
  assert.ok(!generated.includes(`const APPS_SCRIPT_URL = '${currentEndpoint}';`));
  console.log('PASS gera somente copia local com endpoint ficticio isolado');

  assert.throws(() => run(currentEndpoint, 'same.html'), /não pode ser igual ao endpoint atualmente configurado/i);
  assert.equal(fs.existsSync(path.join(tempRoot, 'same.html')), false);
  console.log('PASS recusa reutilizacao do endpoint atualmente configurado');

  assert.throws(() => run('https://example.com/not-apps-script', 'invalid.html'), /deployment isolado do Apps Script/i);
  assert.equal(fs.existsSync(path.join(tempRoot, 'invalid.html')), false);
  console.log('PASS recusa URL fora do formato Apps Script /exec');

  console.log('\n3/3 testes aprovados');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
