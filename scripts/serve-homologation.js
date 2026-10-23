const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const filePath = path.join(root, '.homologation', 'index.html');
if (!fs.existsSync(filePath)) {
  console.error('Execute scripts/prepare-homologation.js antes de iniciar o servidor.');
  process.exit(1);
}

const server = http.createServer((request, response) => {
  if (request.url !== '/' && !request.url.startsWith('/?')) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Não encontrado');
    return;
  }
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(fs.readFileSync(filePath));
});

server.listen(4173, '127.0.0.1', () => {
  console.log('Homologação local disponível em http://127.0.0.1:4173');
  console.log('Use ?public=1 para o formulário público. Pressione Ctrl+C para encerrar.');
});
