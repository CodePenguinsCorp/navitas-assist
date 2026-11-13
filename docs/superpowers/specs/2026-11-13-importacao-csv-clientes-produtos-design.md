# Importação CSV de clientes e produtos — desenho

**Estado:** proposta para implementação posterior; somente este documento é entregue nesta tarefa.
**Objetivo:** atender ao item §9 do PDF do cliente conforme o contexto fornecido: importar clientes e produtos exclusivamente por CSV, com prévia e confirmação. O PDF não foi disponibilizado para conferência direta.
**Decisões do usuário:** CSV, duas etapas, permissão própria `cadastros.importar`, Administrador com essa permissão por padrão e acesso pela tela de Clientes e pela de Produtos. As demais escolhas abaixo são recomendações deste desenho.
**Escopo:** novos cadastros em lote. Excel/XLSX, atualização em massa, importação de RMAs, peças e alterações do projeto de prazo ficam fora.

## Base real do repositório

Os caminhos Java abaixo são relativos a `backend/src/main/java/br/com/navitasassist/`.

- `controller/{ClientController,ProductController}.java`: CRUD em `/api/clients` e `/api/products`, com `@Valid` nos requests; listas paginadas, opções e resumos separados.
- `client/ClientRequest.java` e `service/ClientService.java`: razão social obrigatória, até 120 caracteres desconsiderando espaços e traços conforme a expressão Unicode existente; nome fantasia 120, documento 18, e-mail válido/120, telefone 30, endereço 255 e observações 1000. O serviço aplica `trim`. Não há validação de CPF/CNPJ nem verificação de documento repetido no serviço/repositório.
- `product/ProductRequest.java` e `service/ProductService.java`: SKU obrigatório/20, nome obrigatório/120, categoria 80, hardware e firmware 40, garantia obrigatória inteira ≥1 e notas 1000. `validateSku` usa `existsBySkuIgnoreCase` após `trim`.
- Entidades e `backend/src/main/resources/db/migration/V1__baseline.sql`: documento opcional e sem índice único; SKU com `uk_products_sku`. A coluna SKU tem 60 caracteres, mas o contrato HTTP limita a 20: a importação deve respeitar **20**. Razão social é `TEXT`, mas continua sujeita ao validador do request.
- `config/SecurityConfig.java`: GET de clientes/produtos é liberado a autenticados; POST de criação, PUT e DELETE exigem `cadastros.editar`; CSRF permanece habilitado. Novas regras específicas precisam preceder os matchers amplos e o fallback administrativo.
- `frontend/src/app/pages/{clients,products}/`: componentes standalone, signals, formulários reativos, `app-page-header`, tabelas/filtros, `PagedList` e recarga de resumo após escrita. Produtos inicia garantia em 12 no formulário, mas a API exige valor explícito.
- `frontend/src/app/core/services/catalog.service.ts` concentra HTTP; `core/models.ts` espelha DTOs. `app.routes.ts` protege Clientes/Produtos com `permissionGuard`; catálogo fixo em `core/permissions.ts`, rótulos vindos da API.
- `access/Permission.java`, seed da V1, testes de permissões e README mantêm o contrato de autorização. `PermissionEquivalenceIntegrationTest` enumera os mappings MVC: adicionar endpoints exige ampliar sua matriz, não apenas testes isolados.

## Alternativas e recomendação

| Escolha | Alternativas | Recomendação e motivo |
|---|---|---|
| Duplicados | Atualizar existentes ou ignorar | **Ignorar**, sem sobrescrever dados usados nos RMAs; atualização exige outro desenho e critérios de correspondência confiáveis. |
| Linhas inválidas | Bloquear todo o arquivo ou aproveitar válidas | **Confirmar somente válidas**, exibindo explicitamente quantas serão ignoradas. Corrigir uma linha não deve obrigar a descartar centenas de linhas corretas. |
| Escrita | Commit por linha ou uma transação | **Uma transação para o conjunto válido aprovado**; falha inesperada reverte todas as inserções desse conjunto. Não confundir seleção parcial na prévia com commits parciais. |
| Prévia | Reenviar arquivo/resultado pelo navegador ou lote no servidor | **Lote temporário no servidor**, imutável e vinculado ao usuário; não confiar em classificação ou dados devolvidos pelo navegador. |

## Contrato dos arquivos

Um arquivo por tipo. Cabeçalho obrigatório com nomes abaixo, em português, minúsculos e sem acentos. Aceitar colunas em qualquer ordem, retirar espaços externos dos nomes e rejeitar nomes desconhecidos, repetidos ou ausência de coluna obrigatória. Colunas opcionais podem ser omitidas; o modelo inclui todas.

| Clientes | Obrigatório | Regra |
|---|---|---|
| `razao_social` | Sim | `legalName`; regra Unicode existente de 120 caracteres significativos |
| `nome_fantasia` | Não | `tradeName`, 120 |
| `documento` | Não | `documentNumber`, 18; texto, preservar zeros à esquerda |
| `email` | Não | E-mail válido, 120 |
| `telefone` | Não | Texto, 30 |
| `endereco` | Não | 255 |
| `observacoes` | Não | `notes`, 1000 |

| Produtos | Obrigatório | Regra |
|---|---|---|
| `sku` | Sim | Texto obrigatório, 20 |
| `nome` | Sim | `name`, 120 |
| `categoria` | Não | 80 |
| `versao_hardware` | Não | 40 |
| `versao_firmware` | Não | 40 |
| `garantia_meses` | Sim | `defaultWarrantyMonths`, inteiro decimal de 1 a 2147483647; sem fração ou separador de milhar |
| `notas_tecnicas` | Não | `technicalNotes`, 1000 |

UTF-8 estrito com ou sem BOM; rejeitar UTF-16 e bytes inválidos, sem conversão silenciosa de Windows-1252. Aceitar CRLF/LF. Detectar `;` ou `,` pelo cabeçalho fora de aspas; rejeitar detecção ambígua. O delimitador fica fixo no arquivo. Aspas duplas delimitam campos com separador ou quebra de linha; `""` representa aspas literais. Não usar `split` para analisar CSV: adotar parser CSV mantido, por exemplo Apache Commons CSV, com versão definida na implementação.

Aplicar `trim` aos valores, opcionais vazios viram `null`; validar os requests com Bean Validation, traduzindo violações para português sem alterar mensagens do CRUD. Não converter documentos/telefones em números nem completar garantia vazia com 12. Linhas totalmente vazias são ignoradas e contadas separadamente. Registro com quantidade de campos diferente do cabeçalho é inválido; aspas sem fechamento ou estrutura que impeça localizar registros rejeitam o arquivo inteiro. Número da linha é a linha física inicial do registro, inclusive com campos multilinha; cabeçalho começa na linha 1.

**Modelos para download:** `clientes-modelo.csv` e `produtos-modelo.csv`, UTF-8 com BOM, separador `;`, cabeçalho e um exemplo fictício válido; orientar a apagar/substituir o exemplo. Exemplo de produto: `NAV-001;Controlador;Controle;1.0;2.0;12;Modelo demonstrativo`. Não incluir IDs ou campos de auditoria.

## Duplicidade e concorrência

- Produto: chave SKU após `trim`, sem distinguir caixa, tanto no arquivo quanto no banco, seguindo o serviço atual. Não presumir que a collation MySQL e H2 tratam caixa/acentos igualmente; testar o banco alvo.
- Cliente: recomendar chave de documento não vazio, removendo apenas pontuação usual de máscara (`.`, `/`, `-`) e espaços, comparando letras sem distinguir caixa; preservar o valor original aparado para salvar. Suportar caracteres alfanuméricos e não introduzir validação fiscal ausente do CRUD. Documento que fica vazio após normalização é inválido quando foi informado. Nome/e-mail não identificam duplicidade.
- Cliente sem documento: continua válido, com aviso de que não é possível detectar duplicados; reimportar poderá criar outro cliente. Não inventar correspondência por razão social. Se já houver vários clientes com a mesma chave, classificar a linha como duplicada, sem escolher um cadastro para atualizar.
- Validar campos antes de deduplicar. Entre linhas válidas com a mesma chave, a primeira é candidata; seguintes são `DUPLICATE`, citando a primeira linha. Uma linha inválida não reserva a chave. Chave já no banco torna todas as correspondentes duplicadas. Categorias são exclusivas: `VALID`, `INVALID`, `DUPLICATE`; avisos são independentes.
- Reconsultar banco e revalidar o conjunto na confirmação. Se a classificação mudar, responder `409` e exigir nova prévia; não reduzir silenciosamente o total aprovado. Violação da constraint SKU durante escrita também resulta em rollback e `409`.
- **Limite explícito:** documento não é único no domínio atual. A checagem da importação não garante unicidade contra CRUD concorrente ou outros processos; não adicionar constraint global nesta entrega. Garantia forte exigiria saneamento de dados e coordenação de todas as escritas. SKU continua protegido pela constraint existente.

## Fluxo, limites e transação

1. Selecionar arquivo e gerar prévia; nenhuma entidade é criada. Mostrar arquivo, delimitador, totais, avisos e motivos por linha.
2. Confirmar explicitamente “Importar N linhas válidas”; inválidas e duplicadas são ignoradas. Sem válidas, botão desabilitado e API recusa confirmação.
3. Dentro de uma transação externa ao CRUD, revalidar e criar todas as candidatas usando `ClientService.create`/`ProductService.create`, preservando auditoria e regras. Efetuar flush antes de concluir. Qualquer falha reverte o conjunto; não capturar erro e continuar com transação marcada para rollback.
4. Retornar resumo de sucesso somente após commit. Recarregar listagem e indicadores ao voltar à tela de origem. Corrigir CSV requer novo upload/prévia.

Limites iniciais propostos: **2 MiB por arquivo**, **2.000 registros de dados**, **16 KiB por registro decodificado** e **8 KiB por campo**, antes dos limites de negócio. Contar também registros inválidos/duplicados; vazios continuam sujeitos ao teto de bytes. Recusar excesso inteiro, sem truncar prévia. Configurar multipart com arquivo de 2 MiB e request de 3 MiB (overhead); validar bytes durante leitura, sem confiar no navegador ou `Content-Length`. Alinhar proxy para permitir multipart até esse teto e devolver erro compreensível.

Lote temporário em memória por instância, UUID imprevisível, dono pelo ID da conta e sessão, tipo, dados normalizados, classificação, expiração e estado. Validade de **15 minutos desde a prévia**, sem renovação automática; até **2 lotes por usuário e 20 lotes no total**, rejeitando excesso com `429`. Limpeza periódica e descarte do conteúdo ao expirar/logout. Não guardar arquivo bruto, PII em logs ou no localStorage. Memória é aceitável para a implantação atual de sessão por instância; reinício exige novo upload e múltiplas réplicas exigirão armazenamento compartilhado.

Estados `PREVIEW → PROCESSING → COMPLETED`; transição atômica impede dupla confirmação. Em sucesso, remover dados pessoais e manter apenas resumo até expirar: repetição devolve o mesmo resultado, sem inserir novamente. Durante processamento, `409`. Falha/rollback invalida o lote e exige nova prévia. Queda entre commit e registro do resultado não oferece idempotência durável: registrar essa limitação, especialmente para clientes sem documento; persistência do lote é evolução se essa garantia for necessária.

## API proposta

Criar controllers finos específicos de importação; DTOs em pacote próprio `catalogimport`, serviços em `service`. Contratos iguais para os dois tipos, sem alterar os endpoints existentes. Na tabela, `{resource}` significa as duas rotas concretas `clients` e `products`, não um parâmetro livre.

| Método e caminho | Contrato |
|---|---|
| GET `/api/{resource}/imports/template` | `200 text/csv; charset=UTF-8`, `Content-Disposition: attachment` com nome fixo do modelo |
| POST `/api/{resource}/imports/preview` | `multipart/form-data`, parte obrigatória `file`; `200 ImportPreviewResponse` |
| POST `/api/{resource}/imports/{importId}/confirm` | Sem corpo; `200 ImportResultResponse`; UUID identifica exclusivamente o lote armazenado |

`ImportPreviewResponse = { importId, resource, fileName, delimiter, expiresAt, totalRows, validRows, invalidRows, duplicateRows, blankRows, rows }`.
`ImportRowResponse = { lineNumber, status, values, reasons, warnings }`: `values` expõe campos do request correspondente, nunca entidade JPA; motivos/avisos são listas `{ field, code, message }` com código estável e mensagem em português. Ordem original preservada; retornar no máximo os 2.000 registros permitidos, paginar a apresentação localmente.
`ImportResultResponse = { importId, importedRows, ignoredInvalidRows, ignoredDuplicateRows, completedAt }`.

Erros seguem `ApiError` existente (`timestamp`, `status`, `error`, `message`, `details`), com `message`/`details` desta funcionalidade em português. Exemplos: `400` “Cabeçalho obrigatório ausente: razao_social”, “Arquivo deve estar em UTF-8”, “Nenhuma linha válida para importar”; `413` “O arquivo excede 2 MiB” ou “O arquivo excede 2.000 registros”; `415` “Envie um arquivo CSV”; `409` “Os cadastros mudaram. Gere uma nova prévia”; `410` “A prévia expirou. Envie o arquivo novamente”; `429` “Limite de prévias atingido. Tente novamente mais tarde”. Linha inválida é dado da prévia `200`, não falha HTTP. ID desconhecido ou de outro dono/tipo retorna `404`, sem revelar existência. Erro inesperado retorna `500` sem stack trace ou conteúdo do arquivo. Não traduzir globalmente os erros antigos como parte desta entrega.

## Autorização e segurança

Adicionar `CADASTROS_IMPORTAR`/`Codes.CADASTROS_IMPORTAR`, código `cadastros.importar`, módulo Cadastros e rótulo “Importar clientes e produtos”. Ela autoriza modelo, prévia e confirmação, independentemente de `cadastros.editar`; consultar/editar manualmente conserva as regras atuais. Perfil Administrador recebe por padrão; Atendimento, Técnico e Consulta não recebem. Permitir concessão pelo fluxo existente de perfis/extras, sem atalhos por nome de perfil.

Declarar matchers dos seis endpoints **antes** de GET `/api/clients/**`, `/api/products/**` e do fallback `/api/**`. Revalidar authorities efetivas em cada requisição; revogação após prévia impede confirmar. Preservar sessão, CSRF e interceptor XSRF Angular, inclusive no multipart; deixar navegador montar o boundary. Testar `401`, `403` e falta de CSRF. Vincular lote ao usuário e sessão, nunca ao nome de usuário fornecido pelo cliente.

Atualizar futuramente, juntos: enum/Codes, seed do Administrador, `PermissionEquivalenceIntegrationTest`, testes de catálogo/seed, `frontend/core/permissions.ts` e seu teste que lê SQL, fixtures/guards e README (tabela de permissões, matriz e uso). A V1 foi lida como referência; **não editar baseline aplicada**. Para bases já inicializadas, planejar migration incremental com o grant ao perfil `legacy_code = 'ADMIN'`; alocar o próximo número somente após integrar o projeto de prazo, sem reservar V2 aqui. Banco vazio recebe o grant pela sequência de migrations. Preservar demais permissões.

Validar extensão `.csv`, tamanho e conteúdo textual; não confiar apenas no MIME, pois navegadores podem enviar `text/csv`, `text/plain`, MIME legado ou vazio. Rejeitar XLS/XLSX/ZIP e bytes NUL. Nome recebido é apenas rótulo escapado, nunca caminho de disco ou nome de download.

**Injeção de fórmula:** importação armazena texto, nunca executa fórmulas. Prévia usa interpolação Angular, sem HTML dinâmico. Detectar texto cujo primeiro caractere significativo seja `=`, `+`, `-` ou `@` (incluindo prefixos de controle/tabulação) e avisar por linha; não rejeitar telefone `+55` nem alterar silenciosamente valores legítimos. Os modelos contêm apenas texto fixo seguro. Se houver exportação futura de dados/erros para CSV, neutralizar essas células com apóstrofo antes da serialização e aplicar escape CSV; colocar entre aspas sozinho não impede fórmula. Download de relatório de erros fica fora do primeiro escopo.

## Interface

Botão secundário **Importar CSV** no cabeçalho de Clientes e Produtos, visível com `cadastros.importar`, leva a tela compartilhada com tipo fixado pela origem: `/clientes/importar` e `/produtos/importar`, lazy loaded e protegidas pela nova permissão. Colocar rotas específicas antes de eventuais rotas de detalhe. Incluir a permissão como alternativa de acesso às telas/links de Cadastros para quem só pode importar; não conceder edição manual por consequência.

Etapa de upload: título do tipo, baixar modelo, seletor `.csv`, limites/formato próximos do campo e botão **Gerar prévia**. Etapa de prévia: contadores “Válidas”, “Inválidas”, “Duplicadas”, avisos, tabela paginada com linha, identificação, situação e todos os motivos; filtros por situação, sem depender só de cor. Layout responsivo com detalhes por linha no celular. **Cancelar** à esquerda, **Importar N linhas válidas** à direita; explicitar total ignorado antes de confirmar, sem terceiro modal obrigatório. Desabilitar cliques durante requisição e usar carregamento global existente.

Novo arquivo descarta a prévia anterior na UI. Erros de arquivo permanecem junto ao upload; `409`/`410` exigem gerar nova prévia; perda de permissão bloqueia confirmação. Sucesso apresenta resumo e retorno à origem com lista/resumo atualizados, preservando filtros quando possível. Usar componentes/estilos existentes, foco acessível, mensagens `role="alert"`/`status`; não renderizar milhares de linhas de uma vez. Não alterar telas de prazo ou indicadores SLA.

## Testes e critérios de aceite (TDD)

Escrever primeiro casos que falham, implementar o mínimo e refatorar após verde. Backend: testes unitários do parser/classificação e integração HTTP/serviço com H2; verificar rollback e unicidade SKU também em MySQL alvo, pois H2 não comprova collation/concorrência reais.

- CSV: ambos delimitadores, BOM, acentos, zeros, aspas escapadas, campos multilinha, vazios, cabeçalho reordenado/opcionais omitidos, cabeçalhos inválidos, campos faltando/sobrando, encoding inválido e cada limite na fronteira/excesso.
- Reutilização exata dos limites de requests, razão social Unicode, e-mail e garantia; diferenças entre limite SKU da coluna e do DTO. Prévia não altera banco.
- Duplicados no arquivo/banco, SKU com caixa diferente, documento com máscara/alfanumérico, documento ausente e banco já duplicado; inválida anterior não impede válida posterior.
- Confirmação insere só válidas, mantém existentes intactos e auditoria correta; falha na última inserção reverte anteriores. Mudança de classificação entre etapas retorna `409` sem escrita; concorrência/constraint SKU e repetição de confirmação não duplicam gravações.
- Lote expirado, desconhecido, outra sessão/dono/tipo, cotas, dupla confirmação e revogação entre etapas. Matriz de endpoints e permissões: Administrador padrão autorizado, editar sozinho insuficiente, importar sozinho suficiente, ausência de sessão/CSRF negada.
- Frontend/Vitest: rotas/botões, transporte `FormData`, download `Blob`, tipos espelhados, contadores/motivos, filtro/paginação, zero válidas, confirmação única, erro/expiração, nova seleção, sucesso/recarga e acessibilidade. Valores como `=HYPERLINK(...)` e HTML aparecem como texto.

Verificação futura: `mvn -B -ntp -f backend/pom.xml verify`; em sequência, `npm --prefix frontend test -- --watch=false` e `npm --prefix frontend run build`. Usar configuração de runner local documentada se necessária. Não executar testes de implementação nesta tarefa documental.

## Perguntas abertas para aprovação

- Confirmar as recomendações de ignorar duplicados e importar apenas válidas em uma transação, com os limites de 2 MiB/2.000 registros.
- É aceitável importar cliente sem documento, com possível repetição em reenvios, e deduplicar documento apenas na importação? Unicidade global exige outro escopo.
- A implantação continuará em uma instância e aceita prévia perdida no reinício e idempotência sem durabilidade? Caso contrário, persistir lotes antes de implementar.
- Há cabeçalhos de arquivos legados que precisam de aliases? Até aprovação, aceitar somente o contrato acima.

## Tarefas numeradas para implementação posterior

**Objetivo:** entregar importação CSV com prévia, confirmação e autorização própria.
**Arquitetura:** controllers finos, parser/classificador separado, lote temporário limitado e serviço transacional reutilizando CRUD; Angular standalone com serviço HTTP existente.
**Tecnologias:** Java 17/Spring Boot, Bean Validation, JPA/Flyway, parser CSV, Angular/TypeScript, JUnit/MockMvc e Vitest.
**Restrição global:** tarefas abaixo são roteiro; não executadas nesta entrega. Sincronizar com o trabalho de prazo antes de editar arquivos compartilhados; não copiar mudanças desse projeto nem fixar número de migration antecipadamente.

### Tarefa 1 — Backend: contrato CSV e prévia

**Arquivos:** criar `catalogimport/*`, `service/CatalogImportService.java` e parser; controllers de importação em `controller/`; dependência em `backend/pom.xml`, limites multipart em configuração. Caminhos Java relativos à base informada acima.
**Testes:** novos testes de parser/classificação e integração de importação em `backend/src/test/java/br/com/navitasassist/catalogimport/`.
**Interfaces:** modelos e POST de prévia dos dois tipos, DTOs e mensagens desta spec.

- [ ] Escrever testes vermelhos de formato, limites, validações, duplicidade e ausência de escrita na prévia.
- [ ] Implementar parser, mapeamento para requests, consultas de chaves em lote e respostas em português; evitar consulta por linha e leitura de entidades completas desnecessárias.
- [ ] Implementar modelos e prévia com cotas/TTL/dono; repetir testes focados até verde.

### Tarefa 2 — Backend: confirmação, segurança e permissão

**Arquivos:** serviços/controllers novos, `config/SecurityConfig.java`, `access/Permission.java`, repositories necessários, próxima migration disponível; testes de acesso/catálogo e `PermissionEquivalenceIntegrationTest`.
**Interfaces:** POST de confirmação, nova authority e seed/grant do Administrador.

- [ ] Criar testes vermelhos de rollback, revalidação, concorrência, repetição, expiração, isolamento e autorização dos seis endpoints.
- [ ] Implementar transação, flush, ciclo de vida do lote e proteção CSRF; classificar erros sem vazar dados.
- [ ] Adicionar catálogo/grant incremental coordenado com prazo e ampliar matriz literal de endpoints, testes de seeds e concessão; repetir testes e `mvn verify`.

### Tarefa 3 — Frontend: transporte e acesso

**Arquivos:** `frontend/src/app/core/{models.ts,permissions.ts}`, `core/services/catalog.service.{ts,spec.ts}`, `app.routes.{ts,spec.ts}`, navegação/fixtures e testes de permissão existentes.
**Interfaces:** DTOs espelhados, `FormData`, `Blob`, rotas de importação e permissão própria.

- [ ] Escrever testes vermelhos de transporte e acesso, inclusive importar sem editar e editar sem importar.
- [ ] Acrescentar contratos/métodos, catálogo e acesso de navegação; manter espelho/ordem do enum e teste que lê os seeds SQL compatíveis com o grant incremental.
- [ ] Repetir testes focados sem tocar nos contratos de prazo.

### Tarefa 4 — Frontend: tela, documentação e validação

**Arquivos:** criar `frontend/src/app/pages/catalog-import/`; alterar somente pontos de entrada em `pages/clients/` e `pages/products/`; atualizar README na implementação.
**Testes:** specs da nova tela, das entradas e regressões de catálogo existentes.

- [ ] Escrever testes vermelhos do fluxo completo, motivos por linha, limites/erros, foco e proteção contra confirmação repetida.
- [ ] Implementar upload, modelo, prévia paginada, confirmação, resumo e retorno à origem seguindo os componentes existentes.
- [ ] Documentar CSV, duplicidade, limites, permissão, matriz de perfis e limitações operacionais no README.
- [ ] Executar testes frontend/build sequencialmente e backend completo; validar manualmente ambos os tipos e o banco alvo. Revisar diff/`git diff --check`, sem incluir arquivos do trabalho paralelo.
