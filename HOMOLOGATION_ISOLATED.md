# Homologação isolada do BOLOGIS

Este roteiro prepara e valida um ambiente temporário sem acessar recursos de produção. Ele não deve ser executado com IDs, URLs, chaves, planilhas ou deployments de produção.

## 1. Limites do ambiente

- Use uma conta/projeto de teste ou identifique claramente todos os recursos com o prefixo `BOLOGIS-HML`.
- A planilha, o projeto Apps Script, o deployment e a chave administrativa devem ser novos e exclusivos da homologação.
- Use somente clientes, telefones, pedidos, links e valores fictícios.
- Não cole segredos no repositório, em arquivos de resultado, prints ou relatório de testes.
- Não publique a cópia do frontend no GitHub Pages. Sirva-a apenas em `127.0.0.1`.

## 2. Criar a planilha isolada

1. Crie uma planilha vazia chamada `BOLOGIS-HML-DESCARTAVEL`.
2. Pela própria planilha, abra **Extensões > Apps Script**. Isso mantém o projeto de teste vinculado somente à planilha fictícia.
3. As seis abas e cabeçalhos esperados são:

| Aba | Cabeçalhos, na ordem |
|---|---|
| `Configuracoes` | `Chave`, `Valor` |
| `Sabores` | `ID`, `Nome`, `Ativo`, `Ordem` |
| `Tamanhos` | `ID`, `Nome`, `Descrição`, `Preço`, `Ativo`, `Ordem` |
| `Pagamentos` | `ID`, `Nome`, `Tipo`, `Descrição`, `Link/Payload`, `Ativo`, `Ordem` |
| `Disponibilidade` | `Dia`, `Código`, `Aberto`, `Ordem` |
| `Pedidos` | `Pedido ID`, `Criado em`, `Cliente`, `WhatsApp`, `Data desejada`, `Horário`, `Sabor`, `Tamanho ID`, `Tamanho`, `Descrição/Porções`, `Valor`, `Pagamento`, `Observações`, `Status`, `Origem` |

O caminho preferencial é executar `setupProject()` **somente no projeto vinculado à planilha de teste**. A função cria/normaliza essas abas, grava `SPREADSHEET_ID` nas propriedades do script e inclui dados iniciais. Confira os seis nomes e cabeçalhos antes de continuar. Não importe ou copie linhas da produção.

Após o primeiro salvamento administrativo, é esperado surgir a aba técnica oculta `_ConfigBackups`. Ela guarda no máximo 20 snapshots privados de configuração e não substitui nenhuma das seis abas operacionais. Confirme que essa aba não é exposta pelas rotas públicas.

## 3. Criar e configurar o Apps Script de teste

1. No projeto Apps Script recém-criado, substitua o conteúdo inicial por uma cópia local do arquivo `code.gs` revisado.
2. Execute `setupProject()` e autorize somente o projeto de homologação.
3. Em **Configurações do projeto > Propriedades do script**, confirme:
   - `SPREADSHEET_ID`: ID exclusivo da planilha fictícia, preenchido por `setupProject()`;
   - `ADMIN_KEY_HASH`, `AUTH_SIGNING_SECRET` e `AUTH_VERSION`: ainda ausentes antes da inicialização;
   - `PAYMENT_ALLOWED_HOSTS`: opcional, apenas com domínios fictícios ou provedores previamente aprovados para o teste.
4. Execute manualmente `initializeAdminSecurity()` uma vez.
5. Copie a chave exibida uma única vez para um gerenciador de senhas temporário. Não registre a chave no relatório nem no histórico de comandos.
6. Confirme que as propriedades contêm somente hash, segredo de assinatura e versão; a chave administrativa em texto puro não deve estar nas propriedades, planilha ou código.
7. Não adicione `console.log`, `Logger.log` ou tratamento de erro que imprima chave ou token.

## 4. Criar manualmente o deployment temporário

Esta etapa depende do runtime real do Google e não é automatizada pelo repositório.

1. Selecione **Implantar > Nova implantação > Aplicativo da Web**.
2. Execute como o proprietário do projeto de teste.
3. Escolha o acesso mínimo que ainda permita o formulário público sem conta. Na arquitetura atual isso normalmente requer acesso anônimo; confirme as opções disponíveis na conta de teste.
4. Crie um deployment novo e temporário e copie sua URL terminada em `/exec`.
5. Verifique que a URL e o ID não correspondem a nenhum deployment inventariado de produção.

## 5. Preparar o frontend local de homologação

No PowerShell, a partir da raiz do repositório:

```powershell
$env:BOLOGIS_HOMOLOGATION_API_URL = 'https://script.google.com/macros/s/ID_EXCLUSIVO_DE_TESTE/exec'
node scripts/prepare-homologation.js
Remove-Item Env:BOLOGIS_HOMOLOGATION_API_URL
node scripts/serve-homologation.js
```

O gerador:

- aceita somente URL HTTPS no formato oficial `/exec`;
- recusa o endpoint atualmente configurado em `index.html`;
- gera `.homologation/index.html`, que é ignorado pelo Git;
- não altera `index.html` nem faz requisições externas.

Abra `http://127.0.0.1:4173/?public=1` para o formulário e `http://127.0.0.1:4173/` para a central. Não use uma extensão de servidor que exponha a porta na rede local.

## 6. Roteiro manual de validação

Registre para cada item: data/hora, navegador, resultado esperado, resultado observado e evidência sem credenciais ou dados pessoais.

1. Confirme que a planilha isolada tem exatamente as seis abas esperadas.
2. Confirme que o projeto Apps Script isolado aponta para o `SPREADSHEET_ID` fictício.
3. Instale o `code.gs` revisado no projeto isolado.
4. Confira as propriedades privadas necessárias.
5. Inicialize a chave administrativa apenas no projeto de teste.
6. Crie o deployment temporário de homologação.
7. Gere e sirva a cópia local do frontend apontando somente para esse deployment.
8. Com DevTools aberto, teste CORS e os redirecionamentos de `script.google.com` para `script.googleusercontent.com`. A resposta deve ser legível pelo JavaScript. Confirme que chave e token não aparecem na URL.
9. Abra `/?public=1`: o catálogo deve carregar sem autenticação e a resposta pública não pode conter `spreadsheetUrl` nem campos internos.
10. Crie um pedido fictício, por exemplo cliente `Cliente Teste Homologação`, telefone reservado para teste, observação `DADO FICTÍCIO - DESCARTAR`. Confirme a resposta e uma única linha na aba `Pedidos`.
11. Abra a central local e autentique com a chave temporária. Confirme sessão aproximada de 30 minutos.
12. Consulte os pedidos e confirme que somente o pedido fictício está presente.
13. Salve uma alteração fictícia reversível, como marca `Primeira Fornada HML`, e confirme a persistência na planilha de teste.
14. Atualize o status apenas do pedido fictício e confirme a linha correspondente.
15. Encerre a sessão com rede disponível e confirme a mensagem de revogação no servidor.
16. Reenvie, pelo DevTools do ambiente isolado, uma chamada administrativa com o token anterior. O resultado esperado é `AUTH_REVOKED`. Não copie o token para arquivo ou relatório.
17. Valide expiração e rotação: aguarde a expiração real para ao menos uma sessão; depois crie outra, execute `initializeAdminSecurity()` no projeto de teste e confirme que o token anterior é rejeitado. Guarde somente a nova chave temporária.
18. Teste links: HTTPS permitido deve salvar/renderizar; `javascript:`, `data:` e `http:` devem ser rejeitados ou omitidos. Se `PAYMENT_ALLOWED_HOSTS` estiver definido, um domínio fora da lista também deve ser rejeitado.
19. Abra duas sessões administrativas com a mesma revisão. Salve na primeira e confirme que a segunda recebe `CONFIG_CONFLICT` sem perder os campos preenchidos.
20. Confirme que cada salvamento cria um snapshot anterior em `_ConfigBackups`, incrementa a revisão e preserva itens inativos e seus IDs.
21. Em uma cópia descartável adicional, valide restauração de snapshot e o bloqueio `CONFIG_RECOVERY_REQUIRED` após uma falha de recuperação simulada. Não provoque falhas na planilha que será usada para os demais testes.
22. Preencha a tabela de resultados abaixo sem IDs, URLs completas, chaves, tokens ou dados pessoais.
23. Ao terminar, pare o servidor local, remova `.homologation`, desative/exclua o deployment temporário e descarte o projeto e a planilha de teste conforme a política da conta. Confirme antes que nenhum recurso pertence à produção.

## 7. Cenários adicionais obrigatórios

- Faça `GET ?action=getOrders` e `GET ?action=getAdminConfig`: ambos devem responder `AUTH_REQUIRED` sem dados.
- Faça `POST` administrativo sem token, com token adulterado e com token expirado: nenhum deve chegar à planilha.
- Durante uma edição não salva, force a expiração/reautenticação: o conteúdo dos campos deve permanecer e só ser enviado após nova autenticação.
- Durante o logout, simule rede offline. A credencial local deve ser removida e a central bloqueada, mas a interface deve avisar que a revogação remota não foi confirmada e que a sessão poderá permanecer válida até expirar.
- Reative a rede, autentique novamente e repita o logout para confirmar a revogação real.
- Confira mobile e desktop para carregamento, erro e confirmação, sem ampliar a avaliação visual.

## 8. Registro de resultados

| Caso | Esperado | Observado | Evidência sanitizada | Resultado |
|---|---|---|---|---|
| 1. GET público | Catálogo legível, sem dados privados |  |  | Pendente |
| 2. POST de pedido | Uma única linha fictícia e resposta coerente |  |  | Pendente |
| 3. Autenticação administrativa | Sessão válida por aproximadamente 30 minutos |  |  | Pendente |
| 4. Consulta autorizada | Pedido fictício visível somente com sessão |  |  | Pendente |
| 5. Consulta sem sessão | GET e POST administrativos rejeitados antes da planilha |  |  | Pendente |
| 6. Alteração de status | Somente pedido fictício atualizado com sessão válida |  |  | Pendente |
| 7. Salvamento de configuração | Domínio correto persistido e revisão incrementada |  |  | Pendente |
| 8. Conflito de revisão | Segundo salvamento rejeitado sem perder o rascunho |  |  | Pendente |
| 9. Snapshot e recuperação | Snapshot anterior íntegro, incluindo datas e pagamentos |  |  | Pendente |
| 10. Logout e revogação | Token revogado e rejeitado no servidor |  |  | Pendente |
| 11. Expiração e rotação | Tokens expirados e de versão anterior rejeitados |  |  | Pendente |
| 12. Persistência no Sheets | IDs, preço, entrega, status e textos seguros coerentes |  |  | Pendente |
| 13. CORS/redirecionamentos | Respostas legíveis após redirecionamentos do Google |  |  | Pendente |
| 14. Links de pagamento | Esquemas e domínios inseguros rejeitados |  |  | Pendente |
| 15. Navegadores e dispositivos | Fluxos público e administrativo operáveis em mobile e desktop |  |  | Pendente |

## 9. Critério de aprovação e encerramento

A homologação só pode ser aprovada após todos os casos acima passarem no runtime real do Apps Script e a planilha fictícia receber os dados esperados. Testes locais não comprovam CORS, redirecionamentos, permissões do deployment, comportamento do `CacheService` distribuído ou gravação real no Sheets.

Ao encerrar:

1. Pare o processo `serve-homologation.js`.
2. Exclua apenas a pasta local `.homologation` após confirmar seu caminho.
3. Desative todos os deployments temporários de teste.
4. Descarte a planilha/projeto de homologação conforme a política aplicável.
5. Revogue as chaves temporárias descartando o projeto ou rotacionando-as antes de eventual reutilização.
6. Registre que nenhum recurso de produção foi acessado.

Restaurar ou reativar uma versão antiga sem autorização administrativa não é um rollback seguro.

## 10. Plano de implantação após aprovação

Somente depois dos 15 casos acima estarem aprovados:

1. Faça backup integral e exportação verificável da planilha de produção.
2. Inventarie todos os deployments atuais e identifique os que expõem versões antigas.
3. Prepare as propriedades privadas sem copiar a chave temporária de homologação.
4. Publique primeiro uma nova versão protegida do Apps Script.
5. Valide novamente as rotas públicas e administrativas na URL definitiva antes de alterar o frontend.
6. Atualize o endpoint do frontend e publique em uma janela curta e monitorada.
7. Execute imediatamente os casos 1, 2, 3, 5, 10, 13 e 15 com dados controlados.
8. Desative deployments antigos vulneráveis depois de confirmar o novo fluxo.

## 11. Critérios de rollback

Interrompa a implantação se ocorrer qualquer uma destas condições:

- uma rota administrativa responder sem sessão válida;
- o formulário público não conseguir ler a configuração ou registrar um pedido controlado;
- preço, data de entrega ou status registrado divergir da resposta apresentada;
- CORS ou redirecionamentos impedirem o navegador de ler a resposta;
- salvamento de configuração causar conflito não sinalizado ou recuperação incompleta;
- logout não puder ser confirmado e houver suspeita de exposição do token.

Rollback seguro significa manter ou republicar uma versão com a fronteira administrativa protegida. Nunca restaure uma versão antiga que exponha pedidos, configurações, backups ou mutações. Se a falha estiver apenas no frontend, restaure um frontend compatível com os endpoints protegidos. Se houver dúvida sobre a integridade das configurações, bloqueie novos salvamentos, preserve os pedidos e restaure somente a partir de backup validado.
