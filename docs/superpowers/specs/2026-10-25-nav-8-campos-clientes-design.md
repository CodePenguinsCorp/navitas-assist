# NAV-8 — Campos de clientes

## Objetivo e definições confirmadas

Concluir a [NAV-8](https://codepenguinscorp.atlassian.net/browse/NAV-8), removendo o nome do contato da interface, da API e do banco. O usuário confirmou telefone com até **30 caracteres** e endereço com até **255 caracteres**. A razão social continua aceitando até **120 caracteres**, desconsiderando espaços e traços.

## Abordagem

Foi considerada a remoção apenas visual, que preservaria contrato e dados. O usuário escolheu a remoção completa: eliminar `contactName` dos DTOs Java, tipos TypeScript, formulário, busca, resposta e entidade; retirar `contact_name` da migration inicial.

O README estabelece banco recriável, sem migração de dados legados. Ajustar `V1__create_schema.sql`, sem migration incremental. Nenhum volume será apagado como parte da implementação; documentar a incompatibilidade de bancos já inicializados no PR.

## Comportamento

- Criação, edição, listagem e consulta individual de clientes deixam de usar ou retornar `contactName`.
- As rotas e os outros nomes do contrato permanecem: o documento continua sendo `documentNumber`, apresentado como **CPF/CNPJ**.
- Preservar a política atual de campos JSON desconhecidos; não introduzir rejeição global de payloads legados.
- Remover o controle de contato também do estado e do payload Angular, embora ele já não apareça como input no template.
- Alterar o indicador **Com contato** para **Com telefone**, calculado por telefone preenchido. A coluna será **Telefone / e-mail**, com telefone na primeira linha e e-mail na segunda, usando os fallbacks existentes para valores vazios.
- A busca considera razão social, nome fantasia, documento, e-mail e telefone. Preservar os filtros de presença de documento/e-mail da NAV-57.
- Usar **CPF/CNPJ** no formulário, cabeçalho, filtro e texto de busca; usar **Com CPF/CNPJ** no indicador correspondente.
- Manter as validações existentes de razão social, telefone e endereço em ambas as camadas. Remover apenas a dica estática “Até 120 caracteres, sem contar espaços e traços”, conforme comentário da issue; manter a regra e sua mensagem de erro.

## Limites e integração

Sem biblioteca nova, abstração de formulários, máscara ou validação de CPF/CNPJ. A autorização continua no backend. Não há alteração de datas; qualquer data nova de teste deve ser fixa e considerar America/Sao_Paulo quando pertinente.

Base verificada: `main` / `origin/main` em `548ff79`, árvore limpa. NAV-18, NAV-57, NAV-59 e NAV-60 estão concluídas e incorporadas. A NAV-28 está em Homoloção/Deploy, mas sua branch ainda não está na main e altera a tela de clientes. Atualizar a base antes da implementação e novamente antes do PR; preservar eventual paginação incorporada nesse intervalo, sem integrar uma branch de outra issue por conta própria.

Na revisão, foi confirmado que a branch da NAV-28 ainda consulta `c.contactName` em `ClientRepository.search/summarize` e expõe `withContact`. Ao integrar as duas issues, retirar essas referências, adaptar o resumo para telefone e preservar o contrato paginado. Esses elementos ainda não existem na main usada por esta implementação.

## Aceite

Testes HTTP comprovam o contrato sem contato, testes da migration comprovam ausência da coluna e preservação dos tamanhos, e testes Angular comprovam interface, payloads e limites. Backend, frontend, SLA, builds e configurações Compose devem passar. A entrega termina em Em Revisão, com PR aberto e CI aprovado, sem merge.
