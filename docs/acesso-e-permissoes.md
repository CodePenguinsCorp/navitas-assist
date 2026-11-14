# Acesso e permissões

## Modelo

A API autoriza por **permissão**, não por perfil. Um **perfil** é um nome mais um conjunto de permissões de um catálogo fixo (`Permission.java`). Cada usuário tem exatamente um perfil e, opcionalmente, **permissões extras**. As permissões efetivas são as do perfil mais as extras e são recalculadas a cada requisição.

- Perfis são geridos na tela **Perfis** (`perfis.gerir`); perfil e extras de cada usuário, na tela **Usuários** (`usuarios.gerir`).
- Não há coluna de role em `user_accounts`: o acesso vem só de `profile_id` e das extras (tabelas `access_profiles`, `access_profile_permissions`, `user_account_extra_permissions`; os perfis destinatários das regras de notificação ficam em `notification_rule_recipient_profiles`).
- Os 4 perfis prontos são criados pela baseline e **não podem ser excluídos**; um perfil com usuários também não.
- Requisições sem autenticação recebem `401`; autenticadas sem permissão, `403`. Rotas de API não classificadas exigem `usuarios.gerir` **e** `perfis.gerir`.

### Regras anti-escalada

- **Concessão**: quem não é administrador só concede permissões que ele mesmo possui (`PermissionGrantPolicy`); caso contrário, "Você não pode conceder permissões que não possui.". É administrador quem tem `usuarios.gerir` e `perfis.gerir`.
- **Último administrador**: nenhuma operação (editar, inativar ou excluir usuário; mudar permissões do perfil) pode deixar o sistema sem um usuário ativo com as duas permissões: "É preciso manter ao menos um administrador ativo.". Se já não houver administrador ativo, a mudança passa, para não travar o sistema.

## Catálogo e perfis prontos

A = Administrador (`ADMIN`), S = Atendimento (`SERVICE_DESK`), T = Técnico (`TECHNICIAN`), V = Consulta (`VIEWER`). O código do perfil pronto fica em `access_profiles.legacy_code`.

| Código | Módulo | Rótulo | A | S | T | V |
|:---|:---|:---|:-:|:-:|:-:|:-:|
| `rma.ver` | RMAs | Ver RMAs, Kanban e dashboard | ✓ | ✓ | ✓ | ✓ |
| `rma.abrir` | RMAs | Abrir RMAs | ✓ | ✓ | | |
| `rma.editar` | RMAs | Alterar dados gerais e prioridade | ✓ | ✓ | | |
| `rma.status` | RMAs | Alterar status | ✓ | ✓ | ✓ | |
| `rma.responsavel` | RMAs | Atribuir responsável | ✓ | ✓ | | |
| `rma.atribuivel` | RMAs | Pode ser responsável por RMAs | | | ✓ | |
| `rma.diagnosticar` | RMAs | Registrar diagnóstico | ✓ | | ✓ | |
| `rma.impedimentos` | RMAs | Registrar e resolver impedimentos | ✓ | ✓ | ✓ | |
| `cadastros.ver` | Clientes e produtos | Consultar clientes e produtos | ✓ | ✓ | ✓ | ✓ |
| `cadastros.editar` | Clientes e produtos | Criar, alterar e excluir clientes e produtos | ✓ | ✓ | | |
| `cadastros.importar` | Clientes e produtos | Importar clientes e produtos | ✓ | | | |
| `pecas.ver` | Peças | Consultar peças e estoque | ✓ | ✓ | ✓ | ✓ |
| `pecas.movimentar` | Peças | Cadastrar peças e movimentar estoque | ✓ | ✓ | | |
| `pecas.reservar` | Peças | Reservar e aplicar peças nos RMAs | ✓ | | ✓ | |
| `protocolos.ver` | Protocolos técnicos | Consultar protocolos e execuções | ✓ | ✓ | ✓ | ✓ |
| `protocolos.executar` | Protocolos técnicos | Executar protocolos nos RMAs | ✓ | | ✓ | |
| `protocolos.catalogo` | Protocolos técnicos | Gerenciar modelos de protocolo | ✓ | | | |
| `relatorios.ver` | Relatórios | Ver relatórios | ✓ | | ✓ | ✓ |
| `usuarios.gerir` | Administração | Gerenciar usuários | ✓ | | | |
| `perfis.gerir` | Administração | Gerenciar perfis e permissões | ✓ | | | |
| `notificacoes.regras` | Administração | Configurar regras de notificação | ✓ | | | |
| `auditoria.ver` | Administração | Consultar a trilha de auditoria | ✓ | | | |

Total: 22 permissões. Administrador tem 21 (todas menos `rma.atribuivel`), Atendimento 11, Técnico 11 e Consulta 5. `cadastros.importar` chega só ao Administrador, pela migração `V9`. `auditoria.ver` chega somente ao Administrador pela `V13`.

`cadastros.ver`, `pecas.ver` e `protocolos.ver` controlam telas e menus; as leituras `GET` correspondentes na API continuam abertas a qualquer usuário autenticado, exceto os modelos de importação.

## Matriz resumida

Rota a rota em [api.md](api.md).

| Recurso/operação | Permissão |
|:---|:---|
| Consultar clientes, produtos, peças e protocolos (`GET`, exceto importação) | qualquer usuário autenticado |
| Consultar RMAs, Kanban e dashboard (`GET /api/rmas/**`) e laudo PDF | `rma.ver` |
| Criar, alterar ou excluir clientes e produtos | `cadastros.editar` |
| Baixar modelo, prévia e confirmação de importação CSV | `cadastros.importar` |
| Abrir RMA | `rma.abrir` |
| Alterar dados gerais e prioridade; ajustar garantia dos itens | `rma.editar` |
| Alterar o status | `rma.status` |
| Atribuir ou remover responsável | `rma.responsavel` |
| Registrar diagnóstico; registrar intervenção | `rma.diagnosticar` |
| Registrar e resolver impedimentos | `rma.impedimentos` |
| Cadastrar peças e movimentar estoque | `pecas.movimentar` |
| Reservar, alocar, aplicar e cancelar peças; componentes externos | `pecas.reservar` |
| Executar protocolos | `protocolos.executar` |
| Gerenciar modelos de protocolo | `protocolos.catalogo` |
| Relatórios e exportações CSV | `relatorios.ver` |
| Usuários (`/api/users/**`, exceto `assignable`) | `usuarios.gerir` |
| Perfis (`/api/profiles/**`) | `perfis.gerir` |
| Regras de notificação (`/api/notification-rules/**`) | `notificacoes.regras` |
| Consultar auditoria (`GET /api/audit-events`, tela `/auditoria`) | `auditoria.ver` |
| `GET /api/profiles/options` | qualquer uma de `perfis.gerir`, `usuarios.gerir`, `notificacoes.regras` |
| `GET /api/permissions` | qualquer uma de `perfis.gerir`, `usuarios.gerir` |
| Visualizações do Kanban, notificações pessoais, técnicos atribuíveis, `/api/auth/me`, logout | qualquer usuário autenticado |

## Autenticação e sessão

A sessão é criada no backend. O frontend envia usuário e senha só para `POST /api/auth/login`; nada reutilizável é guardado em `localStorage` ou `sessionStorage`.

- `JSESSIONID` é `HttpOnly` e `SameSite=Strict`; fora do ambiente local também é `Secure` (`SESSION_COOKIE_SECURE`).
- Requisições de escrita exigem o token CSRF: cookie `XSRF-TOKEN` e header `X-XSRF-TOKEN`. `GET /api/auth/csrf` retorna `204` sem corpo e cria o cookie só quando ausente.
- A sessão é restaurada após recarregar a página por `GET /api/auth/me`. A expiração por inatividade é de 30 minutos (`SESSION_TIMEOUT`). `POST /api/auth/logout` invalida a sessão e remove os cookies.
- Respostas de autenticação e autorização são JSON, com `401` e `403`. A tela de login indica credenciais inválidas só para `401` do login; falhas de rede ou do CSRF mostram mensagem genérica.

**Revogação.** Alterar usuário, senha ou situação ativa, ou excluir uma conta, revoga todas as sessões dela após o commit: a próxima requisição responde `401` e é preciso entrar de novo. Alterar o perfil ou as extras de um usuário, ou as permissões de um perfil, **não** encerra sessões: as permissões são recalculadas a cada requisição e valem na próxima. Alterar só o nome completo não encerra sessões, e operações recusadas ou revertidas não revogam acesso. O registro usa o ID da conta, então reutilizar o nome de um usuário excluído não recupera sessões antigas. Se a conta foi excluída ou desativada fora da API, a sessão é encerrada na requisição seguinte (anônima, `401` nas rotas protegidas).

No código, use sempre `Authentication.getAuthorities()`: só as authorities são recalculadas a cada requisição; o principal guarda as permissões do momento do login.

O registro de sessões fica em memória por instância, como as sessões HTTP; a revogação vale para uma única instância, não sincroniza réplicas nem cancela requisições já autorizadas.

**Senhas.** Novas ou alteradas exigem ao menos 6 caracteres e no máximo 72 bytes em UTF-8 (limite do BCrypt; acentos e emojis ocupam mais de um byte). O backend rejeita o excesso no cadastro e na edição; o login retorna `401` acima do limite. Senhas não são aparadas nem truncadas. Hashes BCrypt existentes permanecem; uma senha histórica acima de 72 bytes precisa ser redefinida, e não há migração automática.

**E-mail do usuário.** Opcional. No `PUT`, campo ausente preserva o endereço atual; `null` explícito ou texto em branco o limpa (o frontend sempre envia o campo). É normalizado para minúsculas, limitado a 254 caracteres e único sem diferenciar caixa. Aparece na sessão e nas respostas de usuários; a lista de atribuíveis não o expõe.

**Contas.** A aplicação não cria nem altera usuários na inicialização. Ver o primeiro administrador em [banco-de-dados.md](banco-de-dados.md).
