# Relatórios, laudo em PDF e exportação CSV — plano

**Spec:** `docs/superpowers/specs/2026-11-13-relatorios-laudo-e-exportacao-design.md`

## Regras

- TDD: teste vermelho, depois verde. Um commit por tarefa, em português, `git add` por caminho, sem trailer de coautoria, sem push.
- Outros agentes editam e-mail (backend), Kanban/modal e garantia (frontend) em paralelo: em arquivos compartilhados (`pom.xml`, `SecurityConfig`, `PermissionEquivalenceIntegrationTest`, `README.md`, modal de detalhe, `pages/rmas`, `models.ts`, ícones) só entram no índice as minhas linhas (patch aplicado com `git apply --cached`).
- Sem migração e sem permissão nova.
- Comandos: `mvn -B -ntp -f backend/pom.xml -Dtest=<Classe> test`; completo `mvn -B -ntp -f backend/pom.xml verify`. Frontend: `npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs'` e `npm --prefix frontend run build`.

## Tarefas

1. **Documentos.** Spec e plano. Commit `docs: desenho dos relatorios enxutos, laudo em PDF e exportacao CSV`.
2. **Lista paginada.** `RmaReportIntegrationTest`: página padrão 20, `size` 1..100, ordem entrada desc/ID desc, linha enxuta (`RmaReportRowResponse`), consultas constantes. Arquivos: `RmaRecordRepository.searchReportPage` (+ `countQuery`), `RmaReportService`, `RmaReportController`, `RmaReportRequest` (`page`, `size`), `RmaReportPageResponse`, `RmaReportRowResponse`.
3. **Resumo.** `RmaReportSummaryIntegrationTest`: status, garantia efetiva (com ajuste), mês, top falhas por produto/lote/cliente/tipo, recorrência (serial com RMA anterior ao período conta; série vazia fora da base), etapas só de RMAs em andamento. Arquivos: `RmaReportSummaryResponse`, `ReportLabels`, `RmaRecordRepository.findRecurrentSerials`, `RmaReportService.summary`, rota `/summary`.
4. **CSV.** `CsvWriterTest` (BOM, `;`, aspas, neutralização `=+-@`, tab/CR) e casos de integração (cabeçalhos, nome do arquivo, uma linha por item, limite de 5.000 → 400). Arquivos: `report/CsvWriter`, `RmaReportCsvService`, rotas `/export.csv` e `/summary/export.csv`.
5. **Laudo PDF.** `RmaTechnicalReportIntegrationTest`: `application/pdf`, nome seguro, texto extraído (`PdfTextExtractor`) com acentos, diagnóstico, resumos, peça consumida sem custo, reserva cancelada ausente; 404; 401/403. Arquivos: `pom.xml` (OpenPDF), `RmaTechnicalReport`, `RmaReportPdfService`, `RmaController` (`/{id}/report.pdf`).
6. **Segurança e documentação.** Matchers explícitos no `SecurityConfig`, linhas novas na matriz do `PermissionEquivalenceIntegrationTest`, README (seção de relatórios e tabela de permissões). `mvn verify` verde.
7. **Frontend: serviço e download.** `report.service.spec.ts` (parâmetros, blob, nome do `Content-Disposition`), `core/utils/download.ts`. Modelos novos em `models.ts`.
8. **Frontend: tela de relatórios.** Specs refeitos para Resumo, Falhas, Recorrência e RMAs (paginação, erro, período inválido, exportar).
9. **Frontend: laudo no detalhe.** Link "Laudo (PDF)" no modal (`shared/rma-detail-modal`) e em `pages/rmas`, com spec; ícone `download`. Testes e build sem avisos.
