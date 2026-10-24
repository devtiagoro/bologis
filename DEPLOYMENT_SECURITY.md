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

## 9. Confirmação automática de pagamentos (Etapa 10)

Nada desta seção deve ser executado sem autorização explícita. Validar primeiro no ambiente isolado de homologação.

### Como funciona

- O retorno do cliente (`redirect_url`) e a notificação da InfinitePay (`webhook_url`) apenas entregam `transaction_nsu` e `slug`. Nenhum dos dois confirma pagamento.
- A confirmação vem somente da consulta autenticada ao `payment_check`. O pedido passa a "Confirmado" quando a InfinitePay informa `paid: true`, o `amount` é igual ao valor esperado em centavos, as referências devolvidas coincidem com o pedido, a cobrança persistida corresponde ao pedido atual e o pedido ainda está em "Aguardando pagamento".
- A notificação não tem assinatura documentada. A URL de cada checkout leva um token HMAC exclusivo do pedido, diferente do token de retorno. Mesmo com um token válido, o corpo da notificação nunca decide o pagamento.
- O Apps Script sempre responde HTTP 200, então o reenvio automático da InfinitePay em caso de erro 400 não se aplica. A conciliação agendada cobre notificações perdidas.
- Divergências (valor, transação, pedido alterado, pedido cancelado ou status legado) ficam em `paid_unverified` ou `payment_amount_mismatch`, com o motivo exibido na central para conferência manual.

### Ativação

1. Publicar a nova versão do Apps Script no deployment de homologação.
2. Definir `INFINITEPAY_WEBHOOK_URL` com a URL `/exec` desse deployment (formato `https://script.google.com/macros/s/<id>/exec`). Sem essa propriedade nenhum `webhook_url` é enviado e só o retorno do cliente e a conciliação fornecem referências.
3. Somente checkouts criados depois desse passo recebem o webhook; checkouts antigos continuam dependendo do retorno do cliente.
   - Formato padrão: `webhook: { url, events: ["paid"] }`, conforme a ajuda oficial atualizada em 20/10/2026. Para o campo antigo `webhook_url` da página de desenvolvedores, definir `INFINITEPAY_WEBHOOK_FORMAT=flat`.
   - A documentação não comprova qual formato a API aceita. Em homologação, criar um checkout de baixo valor e confirmar, nos registros de execução do Apps Script, que a notificação chegou ao `doPost` ("Webhook InfinitePay" sem erro e pedido confirmado). Se não chegar, repetir com `flat`.
   - Se a InfinitePay recusar o campo com HTTP 400/422, o checkout é criado novamente sem webhook (referência `webhook: "rejected"` na aba `CheckoutCobrancas`) e a confirmação segue pelo retorno do cliente e pela conciliação.
   - O Web App precisa estar publicado como "Executar como: eu" e "Quem pode acessar: qualquer pessoa". O Apps Script responde ao POST com redirecionamento 302 para `script.googleusercontent.com`; o `doPost` já foi executado nesse momento, e um eventual reenvio da InfinitePay é tratado de forma idempotente.
4. Validar em homologação um pagamento PIX e um de cartão de baixo valor, um checkout abandonado e o fechamento da aba antes do retorno.
5. No editor do Apps Script, executar manualmente `installPaymentReconciliationTrigger()` uma única vez. A função não cria um segundo gatilho e remove duplicados. A conciliação roda a cada 10 minutos, confere no máximo 15 pedidos por execução e cerca de 4 minutos, com espera crescente entre consultas.
6. Repetir os passos 1, 2 e 5 em produção somente depois da aprovação da homologação. O `INFINITEPAY_WEBHOOK_URL` de produção precisa apontar para o deployment de produção.
7. Para suspender a conciliação, executar `removePaymentReconciliationTrigger()`. Para suspender as notificações, remover `INFINITEPAY_WEBHOOK_URL`.

### Limitação

O `payment_check` exige `transaction_nsu` e `slug`, e a InfinitePay não oferece consulta por `order_nsu` apenas. Um pedido pago cujo cliente não retornou e cuja notificação nunca chegou não pode ser confirmado automaticamente; ele continua em "Aguardando pagamento" para conferência manual na InfinitePay.
