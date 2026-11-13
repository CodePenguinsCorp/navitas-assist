# Documentação do Navitas Assist

Índice da documentação. Cada assunto tem um único documento; o `README.md` da raiz traz só a visão rápida.

## Para começar

| Documento | Conteúdo |
| --- | --- |
| [visao-geral.md](visao-geral.md) | O que é o sistema, módulos, fluxo do RMA, datas e fuso, numeração, paginação. |
| [desenvolvimento.md](desenvolvimento.md) | Pré-requisitos, subir com e sem Docker, portas, testes, build, convenções, dados de demonstração. |
| [configuracao.md](configuracao.md) | Variáveis de ambiente e propriedades, com padrão e obrigatoriedade. |
| [projeto.md](projeto.md) | Equipe, problema, objetivo, público, MVP, backlog e cronograma originais. |

## Referência

| Documento | Conteúdo |
| --- | --- |
| [acesso-e-permissoes.md](acesso-e-permissoes.md) | Perfis, permissões extras, catálogo, perfis prontos, sessão, regras anti-escalada. |
| [api.md](api.md) | Rotas por módulo, com a permissão exigida. |
| [banco-de-dados.md](banco-de-dados.md) | Migrações, política da baseline, recriar o banco, primeiro administrador. |

## Funcionalidades

| Documento | Conteúdo |
| --- | --- |
| [prazo-e-garantia.md](prazo-e-garantia.md) | Tempo por etapa, data limite, garantia e ajuste manual. |
| [notificacoes-e-emails.md](notificacoes-e-emails.md) | Eventos, regras, fila de e-mail, provedores, tetos, falhas e reenvio. |
| [relatorios-e-exportacoes.md](relatorios-e-exportacoes.md) | Relatórios, CSV, laudo em PDF, importação CSV de clientes e produtos. |

## Operação

| Documento | Conteúdo |
| --- | --- |
| [operacao-e-deploy.md](operacao-e-deploy.md) | CI, build de produção, scripts de deploy, checklist de ambiente. |

## Para conversar com o dono

| Documento | Conteúdo |
| --- | --- |
| [produto/pontos-para-conversar-com-o-dono.md](produto/pontos-para-conversar-com-o-dono.md) | Etiqueta com QR Code e custo por RMA: opções, esforço e decisões pendentes. |

## Histórico e conferência

- [ux/](ux/): estudo de UI/UX (NAV-98), planos por etapa e o [roteiro de conferência manual](ux/2026-11-07-roteiro-conferencia-manual.md), usado para validar as telas em um navegador com backend real. `ux/visuals/` guarda páginas HTML de apoio.
- [superpowers/specs/](superpowers/specs/) e [superpowers/plans/](superpowers/plans/): especificações de projeto e planos de implementação. São histórico de planejamento; em caso de divergência, vale o código e os documentos acima.
