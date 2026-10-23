# Implantação segura da fronteira administrativa

Este documento descreve uma implantação futura. Nenhuma destas ações deve ser executada sem autorização explícita.

Para o procedimento detalhado de validação anterior à produção, use `HOMOLOGATION_ISOLATED.md`. A homologação deve ser concluída em planilha, projeto Apps Script, deployment e frontend local exclusivos de teste.

## 1. Backup e inventário

1. Fazer uma cópia integral da planilha de produção, preservando todas as abas e permissões.
2. Exportar uma cópia adicional em formato Excel ou equivalente.
3. Registrar os IDs e URLs de todos os deployments existentes do Apps Script.
4. Registrar a versão atualmente publicada do GitHub Pages e do Apps Script.
5. Confirmar que a planilha de produção não será usada nos testes.

## 2. Ambiente isolado

1. Criar uma planilha de testes com a mesma estrutura, contendo apenas dados fictícios.
2. Criar uma cópia isolada do projeto Apps Script ligada a essa planilha.
3. Executar `setupProject()` somente na cópia de testes se ela ainda não estiver preparada.
4. Publicar um deployment de teste acessível apenas pelo tempo necessário à validação.
5. Apontar uma cópia local ou branch de teste do frontend para o endpoint isolado.

## 3. Propriedades privadas

Na cópia de testes e, posteriormente, em produção:

1. Confirmar `SPREADSHEET_ID` nas Script Properties.
2. Executar manualmente `initializeAdminSecurity()` no editor do Apps Script.
3. Copiar a chave mostrada uma única vez para um gerenciador de senhas.
4. Confirmar a presença de `ADMIN_KEY_HASH`, `AUTH_SIGNING_SECRET` e `AUTH_VERSION` nas Script Properties.
5. Confirmar que a chave em texto puro não aparece em propriedades, planilhas, código ou logs.
6. Opcionalmente definir `PAYMENT_ALLOWED_HOSTS` como lista separada por vírgulas, mas somente depois de inventariar os domínios reais dos provedores. Sem essa propriedade, qualquer URL HTTPS é aceita.

## 4. Validação do deployment de teste

Executar os testes locais e depois validar no ambiente isolado:

- `GET ?action=ping` responde sem autenticação.
- `GET ?action=getPublicConfig` retorna catálogo e não retorna `spreadsheetUrl`.
- `POST action=createOrder` cria somente um pedido fictício válido.
- `GET ?action=getOrders` é rejeitado.
- Operações administrativas sem token, com token adulterado e expirado são rejeitadas.
- Chave correta cria uma sessão de aproximadamente 30 minutos.
- `endAdminSession` invalida a sessão imediatamente.
- Rotação de chave invalida sessões anteriores.
- Links `javascript:`, `data:` e `http:` são rejeitados.
- Links HTTPS reais continuam funcionando.
- Fluxos público e administrativo funcionam em desktop e mobile.

## 5. Sequência de publicação futura

1. Publicar primeiro uma nova versão do Apps Script, mantendo o deployment de teste separado.
2. Validar a nova URL com dados fictícios.
3. Atualizar localmente `APPS_SCRIPT_URL` no frontend somente depois da validação.
4. Publicar o frontend e executar imediatamente a matriz de testes pública e administrativa.
5. Monitorar erros do Apps Script sem registrar chaves, tokens ou dados pessoais.
6. Identificar e desativar todos os deployments antigos que aceitem `getOrders`, `saveConfig` ou `updateOrderStatus` sem autorização.

Manter um deployment antigo vulnerável acessível anula a proteção da nova versão.

## 6. Recuperação de acesso

1. Um responsável com acesso ao editor do Apps Script executa `initializeAdminSecurity()` novamente.
2. A nova chave é guardada em um gerenciador de senhas.
3. O incremento de `AUTH_VERSION` invalida todas as sessões existentes.
4. Nenhum pedido ou configuração da planilha precisa ser alterado para recuperar o acesso.

## 7. Reversão segura

- Em caso de falha no frontend, restaurar a versão anterior do frontend apenas se ela for compatível com os endpoints protegidos.
- Em caso de falha no Apps Script, corrigir ou republicar uma versão que mantenha a autorização obrigatória.
- Restaurar uma versão antiga que exponha pedidos ou mutações administrativas sem autorização **não é um rollback seguro**.
- Se for necessário suspender a administração, manter o formulário público funcionando e bloquear temporariamente as ações administrativas no servidor.
- Restaurar planilhas somente a partir do backup verificado e somente se uma alteração de dados tiver ocorrido.

## 8. Checklist final

- Backup verificado.
- Ambiente isolado aprovado.
- Chave fora do código e guardada com segurança.
- Configuração pública sem dados privados.
- Pedidos inacessíveis sem sessão.
- Mutações inacessíveis sem sessão.
- Links de pagamento reais validados.
- Deployments vulneráveis antigos desativados.
- Procedimentos de rotação e recuperação testados.
