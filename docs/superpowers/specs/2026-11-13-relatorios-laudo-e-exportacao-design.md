# Relatórios enxutos, laudo em PDF e exportação CSV — design

Data: 13 nov 2026. Substitui as abas da NAV-27 (laudo em tela, tempo por etapa por RMA, garantia por produto e devoluções).

## 1. Objetivo e decisões

O documento do cliente (§6 e §3.6) pede: quantidade de RMAs por período, top falhas por produto/lote/cliente, taxa de "volta novamente" por lote/serial/modelo, tempo médio por etapa, % em garantia e fora, e o laudo final em PDF por RMA. Decisões do dono do produto: **sem custo por RMA**; o relatório não pode mais listar todos os RMAs de uma vez; o laudo em PDF entra agora; exportação em **CSV** para abrir no Excel.

Fica:

| Relatório | Conteúdo |
| --- | --- |
| Resumo | total de RMAs e itens, contagem por status atual, itens por garantia efetiva (`items[].warrantyStatus`, com ajuste manual), RMAs por mês de entrada, tempo médio e maior tempo na etapa atual dos RMAs em andamento (o cálculo do projeto de prazo, agora feito no servidor) |
| Falhas | top 10 por produto, por lote (produto + lote), por cliente e por tipo de falha do diagnóstico. A métrica é a quantidade de itens de RMA (uma devolução = uma falha relatada); tipo de falha conta RMAs com diagnóstico |
| Recorrência | um item é **retorno** quando o mesmo produto + número de série tem 2 ou mais RMAs com entrada até o fim do período (inclusive RMAs anteriores ao período). Taxa = itens que retornaram ÷ itens com série no período. Mostra o total, top 10 por modelo e por lote e os seriais que retornaram |
| RMAs | lista paginada no servidor (página padrão 20, máx. 100) com código, entrada, cliente, produto principal (+N), série, lote, status, garantia efetiva e tipo de falha, com link para o laudo |

Sai: laudo em tela (vira o PDF), tempo por RMA na etapa atual (já está no Kanban e no detalhe), tabela de garantia por item e aba de devoluções (viram contagens de status e de garantia).

Filtros iguais aos atuais e válidos para todos: `entryFrom`, `entryTo` (data de entrada, inclusivos, padrão últimos 90 dias, máximo 366), `status`, `clientId`. Instante de referência único (`generatedAt`) em cada resposta.

## 2. API

| Rota | Permissão | Resposta |
| --- | --- | --- |
| `GET /api/reports/rmas/summary` | `relatorios.ver` | `RmaReportSummaryResponse` (seção 1) |
| `GET /api/reports/rmas?page&size` | `relatorios.ver` | `{ generatedAt, entryFrom, entryTo, rmas: PageResponse<RmaReportRowResponse> }` (muda o formato: antes era a lista completa de `RmaResponse`) |
| `GET /api/reports/rmas/export.csv` | `relatorios.ver` | CSV com uma linha por item de RMA |
| `GET /api/reports/rmas/summary/export.csv` | `relatorios.ver` | CSV do resumo, falhas e recorrência em formato longo (`Seção;Item;Quantidade;Base;Percentual;Tempo médio (h);Maior tempo (h)`) |
| `GET /api/rmas/{id}/report.pdf` | `rma.ver` | laudo final em PDF |

**Sem permissão nova.** Relatórios e exportação reaproveitam `relatorios.ver`; o laudo é um dado do RMA e exige `rma.ver`. Cada rota tem matcher explícito no `SecurityConfig` e linha na matriz do `PermissionEquivalenceIntegrationTest`. Sem migração.

## 3. CSV

- UTF-8 **com BOM**, separador `;`, fim de linha `\r\n`, `Content-Type: text/csv; charset=UTF-8` e `Content-Disposition: attachment` com nome ASCII fixo (`rmas-AAAA-MM-DD-a-AAAA-MM-DD.csv`, `resumo-rmas-….csv`).
- Escape RFC 4180: campo com `;`, `"`, `\r` ou `\n` vai entre aspas, com aspas dobradas.
- **Injeção de fórmula:** campo de texto que começa com `=`, `+`, `-`, `@`, tab ou CR recebe um apóstrofo na frente. Números gerados pelo sistema não passam pela neutralização.
- Datas `dd/MM/aaaa`, decimais com vírgula, rótulos em português.
- Limite: **5.000 RMAs** por exportação. Acima disso a API responde `400` pedindo para reduzir o período ou filtrar; não exporta parcial calado.

## 4. Laudo em PDF

Biblioteca **OpenPDF** (`com.github.librepdf:openpdf`, versão fixa, LGPL/MPL, sem dependências de rede). Fonte Helvetica padrão com codificação Cp1252, que cobre os acentos do português; caracteres fora dela (emoji) não aparecem. Nada é baixado em tempo de execução.

Conteúdo: código, cliente, entrada, status, emissão (São Paulo); por item: produto, SKU, lote, série e garantia efetiva (com "ajuste manual" quando houver); falha relatada; diagnóstico (falha encontrada, tipo, causa, técnico, data, notas); ações executadas (`repairSummary`, `testSummary`); peças trocadas (`replacedPartsSummary` mais as reservas `CONSUMED` de `PartStockService.getRmaParts`, com código, nome e quantidade, **sem custo**); observações (`physicalCondition`, `receivedAccessories`). Campo vazio aparece como "Não informado".

O laudo é montado por um `RmaReportPdfService` a partir de um modelo próprio (`RmaTechnicalReport`), para que componentes trocados e intervenções estruturadas (projeto futuro) entrem como novas seções sem mudar a rota.

Resposta: `application/pdf`, `Content-Disposition: attachment; filename="laudo-<código>.pdf"`, com o código reduzido a `[A-Za-z0-9_-]`. RMA inexistente: `404`.

## 5. Frontend

`pages/reports` refeita: `app-page-header`, filtros na mesma linha (datas, status, cliente, Consultar), abas Resumo/Falhas/Recorrência/RMAs, tabelas simples sem caixa dentro de caixa, botão "Exportar CSV" no cabeçalho da aba (resumo e falhas/recorrência usam o CSV do resumo; RMAs usa o CSV da lista). A aba RMAs usa `app-pagination`. Laudo: link discreto "Laudo (PDF)" com ícone no cabeçalho do modal de detalhe ao lado de "Abrir na lista" e no cabeçalho do detalhe em `pages/rmas`. Downloads por `HttpClient` com `responseType: 'blob'` (sessão do Angular e pop-up global de carregamento pelo interceptor), nome vindo do `Content-Disposition`.

## 6. Fora

Custo por RMA; XLSX nativo; PDF em lote; gráficos; componentes trocados/intervenções estruturados; recorrência de RMAs legados sem `rma_items`; tempo histórico por etapa de RMAs encerrados.
