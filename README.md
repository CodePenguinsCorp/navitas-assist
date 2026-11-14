# Navitas Assist

Sistema web para diagnóstico técnico e acompanhamento de RMAs (produtos da Navitas que voltam para assistência técnica ou reparo): abertura, Kanban, diagnóstico, peças, protocolos, garantia, prazo, notificações e relatórios, com rastreabilidade por produto, lote e série.

## Stack

- Frontend: Angular 21 (`frontend/`)
- Backend: Spring Boot 3.2, Java 17 (`backend/`)
- Banco: PostgreSQL 16 (migrações Flyway), também nos testes (Testcontainers)
- Execução local: Docker Compose

## Subir em 3 comandos

Requer Docker Desktop e PowerShell, na raiz do repositório:

```powershell
Copy-Item .env.example .env
.\run-local.ps1 -Build
# depois, insira o primeiro administrador (ver docs/banco-de-dados.md)
```

Acesse `http://localhost:4200` (frontend), `http://localhost:8080` (API) e `http://localhost:8080/health`. Para parar: `.\stop-local.ps1`. Sem Docker, testes, build e demais comandos: [docs/desenvolvimento.md](docs/desenvolvimento.md).

## Usuários

A aplicação não cria contas na inicialização. Em banco novo, o primeiro administrador é inserido no banco com um hash BCrypt ([docs/banco-de-dados.md](docs/banco-de-dados.md#primeiro-administrador)); depois, usuários e perfis são mantidos pelas telas Usuários e Perfis.

Para dados de demonstração locais (clientes, produtos, peças, RMAs e protocolos), com a stack no ar e uma conta administradora:

```powershell
node scripts/dev-seed/seed.mjs
```

O script cria os usuários `demo.atendimento`, `demo.tecnico` e `demo.consulta` e imprime a senha inicial ao final. Variáveis e detalhes em [docs/desenvolvimento.md](docs/desenvolvimento.md#dados-de-demonstração).

## Documentação

Todo o detalhamento está em [docs/](docs/README.md):

| Documento | Conteúdo |
| --- | --- |
| [visao-geral](docs/visao-geral.md) | Sistema, módulos, fluxo do RMA, fuso, numeração, paginação |
| [desenvolvimento](docs/desenvolvimento.md) | Ambiente, Docker, testes, build, convenções, dados de demonstração |
| [configuracao](docs/configuracao.md) | Variáveis de ambiente e propriedades |
| [acesso-e-permissoes](docs/acesso-e-permissoes.md) | Perfis, permissões, sessão, regras anti-escalada |
| [api](docs/api.md) | Rotas por módulo e permissão exigida |
| [banco-de-dados](docs/banco-de-dados.md) | Migrações, baseline, recriar o banco, primeiro administrador |
| [prazo-e-garantia](docs/prazo-e-garantia.md) | Tempo por etapa, data limite, garantia, componentes e intervenções |
| [notificacoes-e-emails](docs/notificacoes-e-emails.md) | Eventos, regras, fila de e-mail, provedores, tetos |
| [relatorios-e-exportacoes](docs/relatorios-e-exportacoes.md) | Relatórios, CSV, laudo em PDF, importação CSV |
| [operacao-e-deploy](docs/operacao-e-deploy.md) | CI, build de produção, deploy, checklist |
| [projeto](docs/projeto.md) | Equipe, objetivo, MVP, backlog e cronograma |

Histórico de planejamento (`docs/superpowers`) e roteiro de conferência manual (`docs/ux`) estão listados no índice.

## Equipe

André Schultz (Frontend), José Henrique Brühmüller (PO), Lucas Monich Nunes (Backend) e Matheus Büsemayer (QA).
