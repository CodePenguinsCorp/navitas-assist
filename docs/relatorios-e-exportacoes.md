# Relatórios e exportações

## Relatórios

A tela Relatórios exige `relatorios.ver` (Administrador, Técnico e Consulta). Sem sessão a API responde `401`; sem a permissão, `403`. Todas as rotas aceitam os mesmos filtros opcionais:

- `entryFrom` e `entryTo` (`YYYY-MM-DD`, inclusivos, sobre a **data de entrada**). Sem período, valem os **últimos 90 dias** até hoje em `America/Sao_Paulo`; com uma só data, a outra é completada; o máximo é **366 dias**.
- `status` e `clientId`.

Parâmetros inválidos, intervalo invertido ou período maior que o máximo retornam `400`. Cada resposta traz o período aplicado e um `generatedAt` único.

| Rota | Conteúdo |
| --- | --- |
| `GET /api/reports/rmas/summary` | Total de ordens de serviço e itens; ordens de serviço por status atual; itens por garantia **efetiva** (com ajuste manual); ordens de serviço por mês de entrada; top 10 de falhas por produto, lote, cliente (itens) e tipo de falha do diagnóstico; recorrência; tempo médio e maior tempo na etapa atual das ordens de serviço em andamento, medidos em `generatedAt` (encerrados ficam fora). |
| `GET /api/reports/rmas?page&size` | Lista paginada no servidor (padrão 20, máximo 100), por entrada e ID decrescentes: `{ generatedAt, entryFrom, entryTo, rmas: { content, page, size, totalElements, totalPages } }`. Cada linha traz código, entrada, status, cliente, produto, SKU, série e lote do item principal, quantidade de itens, situações de garantia efetiva distintas e tipo de falha. |
| `GET /api/reports/rmas/export.csv` | Uma linha por item de OS: código, entrada, status, cliente, produto, SKU, lote, série, garantia, ajuste manual, falha relatada, falha encontrada, tipo, causa, responsável, expedição. |
| `GET /api/reports/rmas/summary/export.csv` | O resumo em tabela longa: `Seção;Item;Quantidade;Base;Percentual;Tempo médio (h);Maior tempo (h)`. |

O resumo e os dois CSV têm o mesmo limite: acima de **5.000 ordens de serviço** no período a resposta é `400` ("Reduza o período: o relatório passa de 5.000 ordens de serviço."). Não há custo por OS nos relatórios nem no laudo.

### Recorrência

Um item **retornou** quando o mesmo produto e número de série (sem diferenciar maiúsculas nem espaços nas pontas) têm 2 ou mais ordens de serviço com entrada até o fim do período, inclusive ordens de serviço anteriores ao período e de outros clientes. A busca de anteriores considera só os seriais presentes no período. A taxa é itens que retornaram ÷ itens com série no período, no total, por modelo e por lote (top 10), mais a lista dos seriais. Série vazia fica fora da base; ordens de serviço legados sem `rma_items` não entram na busca de anteriores.

## CSV

Formato dos arquivos exportados: UTF-8 **com BOM**, separador `;`, fim de linha CRLF, para abrir direto no Excel. Campos com `;`, aspas ou quebra de linha vão entre aspas. Texto que começa com `=`, `+`, `-`, `@`, tab ou CR recebe um apóstrofo na frente, para a planilha não executar fórmulas. Datas em `dd/MM/aaaa` e decimais com vírgula.

## Laudo final em PDF

`GET /api/rmas/{id}/report.pdf` (`rma.ver`). O PDF traz código, cliente, entrada, status, produtos (lote, série e garantia efetiva), falha relatada, diagnóstico (falha encontrada, tipo, causa, técnico, data e notas), ações executadas (reparo e testes), peças trocadas (resumo em texto e reservas aplicadas, com componentes externos, motivo e lote), intervenções com técnico e horas, e observações (estado físico e acessórios), sem custos. Usa OpenPDF com a fonte Helvetica padrão (Cp1252, cobre os acentos), sem baixar nada em tempo de execução. O arquivo se chama `laudo-<código>.pdf`, com o código reduzido a letras, números, `_` e `-`.

Na interface, o link "Laudo (PDF)" fica no cabeçalho do detalhe da OS, no modal, na tela ordens de serviço e na lista do relatório.

## Importação CSV de clientes e produtos

Em **Clientes** ou **Produtos**, use **Importar CSV** (`cadastros.importar`). Baixe o modelo e apague ou substitua o exemplo fictício antes de enviar.

**Formato.** O modelo usa UTF-8 com BOM e `;`; a importação aceita UTF-8 com ou sem BOM, separador `;` ou `,`, aspas escapadas e campos multilinha. Limites: 2 MiB por arquivo, 2.000 registros, 16 KiB por registro decodificado e 8 KiB por campo.

- **Clientes**: `razao_social;nome_fantasia;documento;email;telefone;endereco;observacoes`. Só `razao_social` é obrigatória no cabeçalho.
- **Produtos**: `sku;nome;categoria;versao_hardware;versao_firmware;garantia_meses;notas_tecnicas`. `sku`, `nome` e `garantia_meses` são obrigatórias no cabeçalho; SKU até 20 caracteres; garantia, inteiro a partir de 1.
- As colunas podem mudar de ordem e as opcionais podem ser omitidas. Colunas desconhecidas ou repetidas rejeitam o arquivo. A prévia mostra motivos e avisos por linha; linhas vazias são contadas e ignoradas.

**Duplicidade.** Produtos duplicam por SKU sem distinguir caixa; clientes, por documento não vazio, ignorando pontos, barras, hífens e espaços e sem distinguir caixa. Entre registros válidos, a primeira ocorrência vale. Chaves já cadastradas são ignoradas; clientes sem documento recebem aviso e podem se repetir em novo envio. Valores iniciados por `=`, `+`, `-` ou `@` geram aviso de fórmula e permanecem como texto. Não há relatório exportável dos dados enviados.

**Endpoints** (todos com `cadastros.importar`; os `POST` exigem CSRF e `multipart/form-data` com a parte `file`): `GET /api/clients/imports/template`, `POST /api/clients/imports/preview`, `POST /api/clients/imports/confirm` e os mesmos caminhos em `/api/products`. Erros de formato, tamanho e tipo retornam `ApiError` em português com status `400`, `413` e `415`.

**Fluxo sem estado.** A prévia não grava cadastros. O navegador mantém o `File` e o reenvia ao confirmar; o servidor reanalisa o conteúdo e os cadastros atuais, sem guardar lotes, IDs, TTL ou cotas. Só as linhas válidas nessa nova análise são criadas, em uma única transação; inválidas e duplicadas são ignoradas, e qualquer falha de gravação reverte tudo. O resumo final pode diferir da prévia se o banco mudou. Sem linhas válidas, a confirmação retorna `400`.

**Limitações.** A interface impede confirmação simultânea por clique duplo, mas não há idempotência persistente: reenviar clientes sem documento pode criar novos cadastros. A verificação de documento é exclusiva da importação e não garante unicidade contra gravações concorrentes pelo CRUD; o SKU mantém a unicidade do banco.
