const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'index.html');
function prepareHomologation(options = {}) {
  const endpoint = String(options.endpoint || '').trim();
  const outputPath = path.resolve(options.outputPath || path.join(root, '.homologation', 'index.html'));
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)) {
    throw new Error('Defina BOLOGIS_HOMOLOGATION_API_URL com a URL /exec de um deployment isolado do Apps Script.');
  }

  const source = fs.readFileSync(sourcePath, 'utf8');
  const match = source.match(/const APPS_SCRIPT_URL = '([^']+)';/);
  if (!match) throw new Error('Não foi possível localizar APPS_SCRIPT_URL em index.html.');
  if (endpoint === match[1]) {
    throw new Error('O endpoint de homologação não pode ser igual ao endpoint atualmente configurado no frontend.');
  }

  const prepared = source
    .replace(/const APPS_SCRIPT_URL = '[^']+';/, `const APPS_SCRIPT_URL = '${endpoint}';`)
    .replace('<body>', '<body>\n  <!-- CÓPIA LOCAL DE HOMOLOGAÇÃO: NÃO PUBLICAR -->');

  if (prepared.includes(`const APPS_SCRIPT_URL = '${match[1]}';`)) {
    throw new Error('O endpoint anterior ainda está ativo na cópia preparada.');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, prepared, 'utf8');
  return outputPath;
}

if (require.main === module) {
  try {
    const outputPath = prepareHomologation({
      endpoint: process.env.BOLOGIS_HOMOLOGATION_API_URL,
      outputPath: process.env.BOLOGIS_HOMOLOGATION_OUTPUT
    });
    console.log(`Frontend isolado preparado em: ${outputPath}`);
    console.log('Nenhuma requisição externa foi executada.');
  } catch (error) {
    console.error(`ERRO: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { prepareHomologation };
