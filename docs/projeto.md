# Projeto

Contexto acadêmico e de produto do Navitas Assist: equipe, problema atendido, objetivo, público, MVP, backlog inicial e cronograma. Movido do README da raiz sem alteração de conteúdo; o backlog e o cronograma refletem o planejamento original e não são atualizados com o andamento.

## Integrantes

- André Schultz - Frontend
- José Henrique Brühmüller - PO
- Lucas Monich Nunes - Backend
- Matheus Büsemayer - QA

## Problema Atendido

O processo de assistência técnica enfrenta dificuldades como:
- Falta de rastreabilidade dos produtos
- Controle manual de informações
- Dificuldade em localizar histórico de atendimentos
- Falta de padronização no processo de OS
- Retrabalho e perda de informações

## Objetivo do Sistema

Desenvolver um sistema digital que permita o controle e rastreamento de produtos da Navitas que retornam para assistência técnica ou reparo, consolidando o processo de OS no sistema Navitas Assist e facilitando o registro, acompanhamento e geração de relatórios relacionados aos atendimentos.

## Público Beneficiado

O projeto beneficia diretamente dois principais públicos. O primeiro e mais diretamente beneficiado é a empresa Navitas Tecnologia, uma vez que o produto pretende otimizar os processos de OS da empresa proporcionando maior competitividade e eficiência interna, um diferencial necessário nos setores de tecnologia.
O segundo público beneficiado será composto pelos clientes e parceiros da Navitas Tecnologia, que poderão usufruir de uma experiência mais eficiente, organizada e transparente no atendimento de reparos e assistência dos produtos Navitas, resultando em benefícios diretos, como maior agilidade e confiabilidade no serviço, e indiretos, como aumento da satisfação, fortalecimento do relacionamento e maior credibilidade da marca.

## Projeto Mínimo Viável (MVP)

Disponibilizar um fluxo funcional de gerenciamento de assistência técnica, permitindo registrar uma assistência, acompanhar sua evolução e consultar as principais informações do atendimento.

### Funcionalidades incluídas no MVP:

- Cadastro e consulta de clientes
- Cadastro e consulta de produtos
- Abertura de assistência técnica
- Identificação da assistência
- Registro do diagnóstico
- Atualização do status
- Registro de reparo e testes
- Consulta do histórico básico da assistência

## Backlog

| ID | Item | Tipo | Prioridade | Responsável |
|:---|:---|:---|:---|:---|
| **1** | Revisar e finalizar estrutura inicial do projeto | Técnico | Alta | André e Matheus |
| **2** | Modelar e configurar o banco de dados | Técnico | Alta | José e Lucas |
| **3** | Implementar autenticação e autorização | Requisito técnico | Alta | José e Lucas |
| **4** | Implementar cadastro de clientes | Requisito funcional | Alta | André e Lucas |
| **5** | Implementar cadastro de produtos | Requisito funcional | Alta | André e Lucas |
| **6** | Implementar abertura da assistência | Requisito funcional | Alta | José e Lucas |
| **7** | Implementar fluxo e status da assistência | Requisito funcional | Alta | José e Matheus |
| **8** | Implementar registro de diagnóstico, reparo e testes | Requisito funcional | Alta | André e Matheus |
| **9** | Integrar frontend e backend do fluxo principal | Técnico | Alta | André, José e Lucas |
| **10** | Validar primeiro incremento com a Navitas | Validação | Média | José e Matheus |

## Cronograma de Desenvolvimento

| Período | Marco esperado | Evidência de entrega | Resp. |
| :--- | :--- | :--- | :--- |
| **10/08 a 24/08** | Ponto de partida mínimo concluído | README, arquitetura, stack, backlog, estrutura inicial e repositório | André e Matheus |
| **24/08 a 21/09** | Sprint 1 em desenvolvimento | Primeiro incremento funcional, commits e tarefas registradas | José |
| **21/09 a 05/10** | Sprint 1 revisada e Sprint 2 planejada | Demonstração parcial e backlog ajustado | Todos |
| **05/10 a 19/10** | Versão Alpha em implementação | Funcionalidades principais integradas | José e Lucas |
| **19/10 a 16/11** | Preparação para implementação/validação | Versão testável, feedback do parceiro ou plano de homologação | Todos |
| **Novembro** | Implementação, validação e evolução da entrega | Evidências de uso, testes, homologação ou deploy | Todos |

## Próximos Passos

- [ ] **Interface Kanban para ordens de serviço:** Fazer com que a gestão de status do chamado seja feita de forma visual, melhorando a experiência do usuário.
- [ ] **Ampliação da Cobertura de Testes:** Criar novos testes de integração para as regras de negócio de ordens de serviço e Garantias.
- [ ] **Homologação e Deploy:** Validar os scripts de ambiente de produção, preparando o sistema para o primeiro ciclo de uso e feedback do cliente.

