# Visão geral

Navitas Assist é um sistema web para diagnóstico técnico e acompanhamento de ordens de serviço (produtos da Navitas que voltam para assistência técnica ou reparo). Consolida o registro, o acompanhamento e os relatórios do atendimento e dá rastreabilidade por produto, lote e série.

## Arquitetura

- `frontend/`: SPA em Angular 21, servida por Nginx no Docker. Fala com a API em `/api` por proxy.
- `backend/`: API REST em Spring Boot 3.2 (Java 17), JPA, Flyway e Spring Security com sessão.
- Banco: PostgreSQL 16 em todos os ambientes. Os testes automatizados rodam contra um PostgreSQL real (Testcontainers localmente, serviço no CI).

## Módulos

| Módulo | O que faz |
| --- | --- |
| Ordens de serviço | Abertura, lista, detalhe, histórico de status, impedimentos, responsável, diagnóstico, reparo, garantia e data limite. |
| Kanban | Quadro paginado por status com rolagem infinita, ordem manual persistida, filtros no servidor, visualizações salvas, arraste e Alt+Setas. |
| Dashboard | Indicadores de ordens de serviço abertas, prioridade e atrasados. |
| Clientes e produtos | Cadastros com busca paginada e importação CSV. |
| Peças | Cadastro, estoque, movimentações, reservas e aplicação nas ordens de serviço. |
| Protocolos | Modelos versionados de checklist, executados durante a OS. |
| Relatórios | Resumo, lista, CSV e laudo em PDF. |
| Notificações | Sino e caixa de entrada no app, regras por evento e e-mail opcional. |
| Administração | Usuários, perfis e permissões, regras de notificação. |

## Fluxo da OS

Status (`RmaStatus`): `RECEIVED` (Recebido), `TRIAGE` (Triagem), `IN_DIAGNOSIS` (Diagnóstico), `WAITING_PART` (Aguardando peça), `IN_REPAIR` (Reparo), `IN_TESTS` (Testes), `COMPLETED` (Concluído), `RETURNED` (Devolvido) e `IRREPARABLE` (Sem conserto). Os três últimos encerram a OS.

1. Quem tem `rma.abrir` abre a OS com cliente, um ou mais itens (produto, lote, série), data de entrada, falha relatada, acessórios, estado físico, prioridade e data limite opcional. A OS nasce em `RECEIVED` e o usuário autenticado é gravado em `receivedBy` (somente leitura na API).
2. O status muda arrastando o card no Kanban ou pelo seletor do detalhe (`rma.status`). Não há ordem obrigatória entre etapas; o único bloqueio é o de protocolo (abaixo). Cada mudança entra no histórico; a observação de um evento do histórico pode ser editada depois (`rma.status`, até 255 caracteres, com autor e horário da edição) enquanto a OS não está encerrado.
3. O responsável (técnico) é atribuído por quem tem `rma.responsavel`. Só usuários ativos com `rma.atribuivel` aparecem como opção; perder a permissão ou ser inativado não apaga a atribuição existente. Cada troca registra anterior, novo, autor e horário.
4. O técnico registra o diagnóstico (`rma.diagnosticar`), reserva e consome peças, adiciona componentes externos e intervenções (ver [prazo-e-garantia.md](prazo-e-garantia.md)) e executa protocolos (`protocolos.executar`).
5. Impedimentos (`rma.impedimentos`) registram bloqueios com motivo e resolução. Bloquear não muda a coluna nem para o tempo da etapa.
6. Ao encerrar, o laudo em PDF fica disponível ([relatorios-e-exportacoes.md](relatorios-e-exportacoes.md)). ordens de serviço encerradas recusam novas aplicações de peça, componentes externos, intervenções e ajustes de garantia.

Status, responsável e prioridade são alterados individualmente; não há edição em massa. A prioridade é trocada no detalhe, no Kanban e na tela de ordens de serviço por quem tem `rma.editar` (enquanto a OS não está encerrado), com `PUT /api/rmas/{id}` enviando só `{ "priority": ... }`; a API registra a nota `Priority changed from X to Y` no histórico de status.

O número da nota fiscal fica disponível na abertura e no detalhe; não há campo de arquivo da NF nem de "Recebido por" na interface.

### Impedimentos

Quem tem `rma.impedimentos` bloqueia com motivo obrigatório (até 1000 caracteres) e categoria opcional (até 80), ou desbloqueia com nota de resolução obrigatória (até 1000). Quem tem só `rma.ver` consulta. Cada episódio guarda autor e instante de início e de resolução; a API retorna `currentBlock` e `blockHistory`. Bloqueios concorrentes são serializados pelo lock da OS: uma resolução desatualizada não encerra um episódio posterior. O filtro de impedimentos do Kanban combina com os demais e é salvo nas visualizações.

### Protocolos técnicos

Modelos versionados por produto ou categoria (`protocolos.catalogo`), executados na OS (`protocolos.executar`). A listagem traz `inUse` (alguma versão já foi usada em uma OS); modelo em uso não pode ser excluído (409), apenas desativado, e modelo nunca usado é excluído de fato, com todas as versões. Cada alteração do modelo cria uma versão imutável; execuções em andamento continuam na versão em que começaram. Os itens podem ser verificação, texto ou medição (unidade, casas decimais, mínimo e máximo), com resultado esperado e exigência de evidência. O backend impede concluir com obrigatórios pendentes, aprovar medição fora da faixa ou com mais casas que o configurado, e exige justificativa para reprovar, marcar como não aplicável ou repetir um item (as tentativas anteriores ficam no histórico). Cada versão define `blockedStatuses`: status da OS bloqueados enquanto a execução mais recente tiver itens obrigatórios não aprovados. `GET /api/protocols/rmas/{rmaId}/executions` expõe protocolo, versão, executor e tentativas, e alimenta o laudo.

### Visualizações salvas do Kanban

Cada usuário salva, reaplica, renomeia, exclui e define uma visualização padrão dos filtros avançados (`/api/kanban-views`, sempre sobre o usuário da sessão; nomes únicos por usuário). A padrão é restaurada ao abrir o quadro em uma nova sessão. Falhas de persistência não alteram os filtros já aplicados na tela. O filtro por responsável aceita técnico ativo ou "sem responsável".

## Datas e fuso horário

- As regras que dependem de "hoje" e o ano do código da OS usam `America/Sao_Paulo`, independente do fuso do navegador ou do servidor.
- Datas sem horário (`YYYY-MM-DD` / `LocalDate`) preservam o dia informado, sem conversão.
- No frontend, use `core/utils/date.ts` para o dia atual e para exibir datas civis. Instantes de auditoria, atualizações e entradas em etapas são exibidos em `America/Sao_Paulo`, formato curto `pt-BR` (`formatBusinessDateTime`); a API não altera os valores.

## Numeração das ordens de serviço

Formato `OS-AAAA-NNNNNN`, com o ano em `America/Sao_Paulo` e a sequência reiniciada em `000001` a cada ano. A alocação é serializada por uma linha de bloqueio no banco (`rma_code_generation_lock`, criada pela baseline), então criações concorrentes recebem códigos distintos e uma criação revertida não consome número. Ao chegar a `999999`, novas criações do ano recebem erro de negócio `400`. Escritas diretas no banco, fora da API, não seguem esse controle.

## Paginação das consultas

`GET /api/rmas`, `/api/clients`, `/api/products` e `/api/users` retornam `{ content, page, size, totalElements, totalPages }`.

| Parâmetro | Regra |
| --- | --- |
| `page` | Índice a partir de 0 (padrão `0`). Negativo ou não numérico retorna `400`. Além do fim, `content` vem vazio com os totais corretos. |
| `size` | Padrão `20`, mínimo `1`, máximo `100`; fora disso, `400`. |

A ordem é fixa e estável (desempate por `id`): ordens de serviço na ordem da fila (prioridade alta, média, demais; depois a entrada mais antiga); clientes, produtos e usuários por nome. Os filtros rodam no backend antes de paginar, e `totalElements` conta só os registros filtrados:

| Recurso | Filtros |
| --- | --- |
| `/api/rmas` | `query`, `status` |
| `/api/clients` | `query`, `hasDocument`, `hasEmail` |
| `/api/products` | `query`, `category`, `hasFirmware` |
| `/api/users` | `query`, `profileId`, `active` |

O Kanban usa `GET /api/rmas/board/column` (20 cartões por coluna) e `/api/rmas/board/counts` (totais filtrados), com ordem manual acima dos cartões automáticos. O contrato está em [kanban-payload.md](kanban-payload.md). `/api/rmas/board` continua compatível para leitura completa. Seletores usam `GET /api/clients/options` e `GET /api/products/options`, sem paginação e por nome. Os totais dos cartões vêm de `/api/clients/summary`, `/api/products/summary` (inclui `categories`) e `/api/users/summary`. No frontend, as telas oferecem 10, 20, 50 ou 100 por página; a busca por texto aguarda 300 ms, mudar busca, filtro ou tamanho volta à primeira página e, ao excluir o último item de uma página, a tela volta à última página existente.

## Limites de tempo

Nenhuma tela fica carregando para sempre. O frontend interrompe qualquer chamada à API que passe de 45 s e mostra "A operação demorou mais do que o esperado e foi interrompida. Verifique a conexão e tente novamente."; nas escritas o texto acrescenta "Confira se a alteração foi salva antes de repetir.", porque o servidor pode ter concluído a operação, e nenhuma escrita é repetida sozinha. O banco cancela cada consulta que passe de 50 s (`DB_STATEMENT_TIMEOUT`) e a API responde `503` com mensagem em português; o Flyway não herda esse limite. Nos fluxos pesados abaixo o banco aceita até 110 s por consulta (`DB_EXPORT_STATEMENT_TIMEOUT`, aplicado com `SET LOCAL` só dentro da transação deles), para o `503` não vir antes do limite do frontend. Têm limite de 120 s no frontend as exportações CSV (`/api/reports/rmas/export.csv`, `/api/reports/rmas/summary/export.csv`), o laudo em PDF (`/api/rmas/{id}/report.pdf`) e a prévia e a confirmação da importação CSV (`/api/{clients|products}/imports/preview` e `/confirm`). O contador de notificações (`/api/notifications/summary`) e as chamadas de `/api/auth/` ficam fora do limite do frontend.

## Histórico de reparo

O histórico de reparo identifica componentes criados, editados e anulados, peças aplicadas do estoque e intervenções registradas, editadas e anuladas. Novos resumos usam frases curtas, quantidade com unidade, `Motivo da troca:`, `Lote:` quando preenchido e horas com vírgula decimal, como `Intervenção registrada: Limpeza (1,5 h).`. Anulações mantêm `Motivo:`; a tela usa esse marcador para associar o motivo ao registro original. Textos já gravados são preservados e continuam aceitos pela tela.

## Glossário

OS significa Ordem de Serviço. RMA é o nome interno mantido em identificadores de código, rotas, tabelas e permissões (`rma`/`Rma`). A interface e os textos usam Ordem de Serviço ou OS; o código sequencial segue `OS-AAAA-NNNNNN`.
