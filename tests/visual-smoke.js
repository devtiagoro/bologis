const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const chrome = chromeCandidates.find(candidate => fs.existsSync(candidate));
if (!chrome) throw new Error('Google Chrome não encontrado para o teste visual local.');

const publicConfig = {
  brandName: 'Primeira Fornada',
  heroTitle: 'Primeira Fornada 🍰',
  heroSubtitle: 'Bolos artesanais por encomenda.',
  description: 'Escolha o sabor e o tamanho para reservar seu bolo.',
  flavors: ['Chocolate', 'Ninho com morango'],
  sizes: [
    { id: 'p', name: 'Pequeno', description: 'Serve aproximadamente 8 pessoas', price: 89 },
    { id: 'm', name: 'Médio', description: 'Serve aproximadamente 15 pessoas', price: 129 }
  ],
  payments: [{ id: 'pix', name: 'PIX', type: 'pix', description: 'Pagamento via PIX', paymentLink: '', active: true }],
  availability: {
    enabled: true,
    days: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: true },
    deliveryDay: 'sunday', paymentDeadlineDay: 'thursday', paymentDeadlineTime: '23:59:59'
  }
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bologis-visual-'));
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let adminPreviewHtml = '';

function runChrome(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let errorText = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { errorText += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`Chrome terminou com ${code}: ${errorText}`)));
  });
}

function classListFor(dom, id) {
  const match = dom.match(new RegExp(`<[^>]+id="${id}"[^>]*class="([^"]*)"`, 'i'));
  return match ? match[1].split(/\s+/).filter(Boolean) : [];
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/api') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    response.end(JSON.stringify({ ok: true, config: publicConfig }));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(url.pathname === '/admin-preview' ? adminPreviewHtml : html);
});

(async () => {
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;
    html = html
      .replace(/const APPS_SCRIPT_URL = '[^']*';/, `const APPS_SCRIPT_URL = '${origin}/api';`)
      .replace('connect-src https://script.google.com https://script.googleusercontent.com', `connect-src ${origin}`);

    const fakeOrders = [
      { id: 'PF-HML-101', createdAt: '2026-10-20T12:00:00Z', customerName: 'Cliente Fictícia', whatsapp: '(34) 99999-1111', date: '2026-10-25', time: '10:00', flavor: 'Chocolate', size: 'Pequeno', description: 'Serve 8 pessoas', price: 89, payment: 'PIX', notes: 'Sem nozes', status: 'Aguardando pagamento' },
      { id: 'PF-HML-102', createdAt: '2026-10-19T12:00:00Z', customerName: 'Pessoa de Teste', whatsapp: '(34) 98888-2222', date: '2026-10-26', time: '14:00', flavor: 'Ninho com morango', size: 'Médio', description: 'Serve 15 pessoas', price: 129, payment: 'Cartão', notes: '', status: 'Em produção' }
    ];
    adminPreviewHtml = html.replace(
      'initializeApp();',
      `config = normalizeConfig(${JSON.stringify({ ...publicConfig, revision: '7', flavorItems: publicConfig.flavors.map((name, index) => ({ id: `f-${index}`, name, active: index === 0, order: index + 1 })), orderStatuses: ['Aguardando pagamento', 'Confirmado', 'Em produção', 'Concluído', 'Cancelado'] })});
       appState.config = config;
       appState.orders = ${JSON.stringify(fakeOrders)};
       adminWasUnlocked = true;
       document.getElementById('initialLoading').classList.add('hidden');
       document.getElementById('appTopbar').classList.remove('hidden');
       document.getElementById('adminAuthView').classList.add('hidden');
       renderAdmin();`
    );

    const desktop = path.join(tempDir, 'admin-desktop.png');
    const tablet = path.join(tempDir, 'admin-tablet.png');
    const mobile = path.join(tempDir, 'public-mobile.png');
    const common = ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--virtual-time-budget=2500'];

    await runChrome([...common, '--window-size=1440,1000', `--screenshot=${desktop}`, `${origin}/admin-preview`]);
    await runChrome([...common, '--window-size=768,1024', `--screenshot=${tablet}`, `${origin}/admin-preview`]);
    await runChrome([...common, '--window-size=390,844', `--screenshot=${mobile}`, `${origin}/?public=1`]);
    const adminDom = await runChrome([...common, '--dump-dom', `${origin}/`]);
    const previewDom = await runChrome([...common, '--dump-dom', `${origin}/admin-preview`]);
    const publicDom = await runChrome([...common, '--dump-dom', `${origin}/?public=1`]);

    assert.ok(fs.statSync(desktop).size > 10_000, 'Screenshot desktop não foi renderizado corretamente.');
    assert.ok(fs.statSync(tablet).size > 10_000, 'Screenshot tablet não foi renderizado corretamente.');
    assert.ok(fs.statSync(mobile).size > 10_000, 'Screenshot mobile não foi renderizado corretamente.');
    assert.equal(classListFor(adminDom, 'adminAuthView').includes('hidden'), false);
    assert.equal(classListFor(adminDom, 'adminView').includes('hidden'), true);
    assert.equal(classListFor(publicDom, 'customerView').includes('hidden'), false);
    assert.equal(classListFor(publicDom, 'adminAuthView').includes('hidden'), true);
    assert.equal(classListFor(previewDom, 'adminView').includes('hidden'), false);
    assert.match(previewDom, /order-mobile-card/);
    assert.match(previewDom, /PF-HML-101/);
    console.log('PASS central protegida sem sessão');
    console.log('PASS central operacional renderizada em 1440x1000 e 768x1024');
    console.log('PASS formulário público renderizado em 390x844');
  } finally {
    server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
