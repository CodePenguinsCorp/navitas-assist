# Minimização de dados

Especificação aprovada: ../specs/2026-11-13-minimizacao-dados-design.md.

## Etapa 1

1. Contratos de seletores: records em client/product/part, controllers/services, models e consumidores. Teste vermelho: DataMinimizationIntegrationTest verifica chaves exatas; serviço frontend verifica rota options de peças.
2. Leituras sem consumidores e summaries: conferir frontend/docs, remover handlers/métodos exclusivos/matriz, reduzir records e consultas; testes de contrato JSON.
3. Sessão e campos mortos: records de sessão e OS, autenticação e fixtures espelhadas; testes de ausência e manutenção dos fluxos.
4. Dashboard: consultas agregadas e limitadas próprias, endpoint autorizado e matriz, consumidor frontend; testes de contagens/ordenação e transporte.
5. Kanban: substituir card com resposta de escrita; teste prova ausência de recarga do board.

## Etapa 2

1. Separar records de lista, board e detalhe, consultas/mapeadores e contratos TypeScript. Testes verificam ausência de históricos/textos nas coleções.
2. Buscar detalhe ao abrir, carregamento/erro local e nova tentativa, projeção explícita após escritas; testes de abertura e atualização.
3. Clientes: lista resumida e edição por GET individual; testes de contrato e formulário.

## Etapa 3

1. Mascarar custos por autoridade em leituras/escritas e ocultar blocos; testes com e sem pecas.ver.
2. Matchers específicos e chamadas condicionais frontend; matriz completa e teste com cada perfil pronto e permissões personalizadas.

## Verificação em cada etapa

- `mvn -B -ntp -f backend/pom.xml verify`
- `$env:TZ='UTC'; npm --prefix frontend test -- --watch=false --runner-config 'C:\Users\joseh\AppData\Local\Temp\vitest-runner.config.mjs'`
- `npm --prefix frontend run build` (zero avisos e estilos até 4 kB).
- Atualizar docs/api.md e docs/acesso-e-permissoes.md; revisão independente somente leitura; commit local por tarefa lógica, sem push.
