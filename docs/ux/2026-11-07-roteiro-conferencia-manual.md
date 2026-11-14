# Roteiro de conferência manual (NAV-98)

Atualizado em 9 de novembro de 2026. Tudo abaixo foi verificado por testes (Vitest, com mutações nos testes novos) e por build, e revisado por leitura. **Nada foi visto em um navegador autenticado com backend real**: não havia login de teste. Este roteiro lista o que falta conferir, em 1440 px, 800 px e 320 px (e zoom de 200%), com um perfil ADMIN e um SERVICE_DESK (e, onde indicado, TECHNICIAN e VIEWER).

Estado de referência: suíte com 78 arquivos e mais de 1150 testes passando; build sem avisos; bundle inicial 405 kB.

## 1. Pop-up de carregamento global (todas as telas)
- Ao abrir qualquer tela, o fundo escurece e a interação trava enquanto carrega; só aparece se a espera passar de ~200 ms e fica pelo menos ~400 ms.
- Não aparecem mais textos soltos "Carregando X..." nas páginas.
- Com um diálogo aberto e um salvamento lento, o pop-up cobre o diálogo; ao terminar, o foco volta ao campo/botão em que estava.
- Atualização das notificações (a cada 60 s) NÃO dispara o pop-up.
- Painel de impedimentos: mostra só um spinner enquanto lê, sem ficar escondido atrás do pop-up.

## 2. Diálogos (foco e teclado) — pendência F1
Em cada diálogo (clientes, produtos, usuários, protocolos, novo RMA, diagnóstico, detalhe do RMA, ações em lote, salvar/renomear visualização, mudança de status, lote, impedimentos, peças, movimento, histórico, editor de regra):
- Abrir leva o foco ao campo certo (Razão social, SKU, Nome, Nome do protocolo, Cancelar nas exclusões etc.).
- Tab e Shift+Tab ficam dentro do diálogo; o fundo não recebe clique nem foco.
- Escape fecha o diálogo do topo; durante um salvamento ou exclusão o Escape é ignorado.
- Ao fechar, o foco volta ao botão que abriu (ou, se ele sumiu, ao fallback: botão "Novo", lista, aba).
- Impedimentos sobre o detalhe do Kanban: os dois funcionam, o de cima fica utilizável.
- Escape dentro de um seletor aberto fecha só o seletor.

## 3. Base visual e botões
- Títulos grandes com traço de acento; **sem total ao lado do título**.
- Seções de formulário em cartões tingidos; painéis com faixa de cabeçalho; tabelas com cabeçalho tingido e listras suaves.
- Botões: primário azul com gradiente; secundário com fundo azul-claro; Cancelar cinza-azulado e à esquerda; perigo avermelhado; botões de ícone com fundo claro. Alturas 40/34/28 px.
- Produtos: o grupo de garantia não tem título visível.
- Contraste do texto secundário (cinza escurecido) legível sobre fundos tingidos.

## 4. Totais e indicadores
- Clientes, Produtos, Usuários, RMAs: o total aparece só na paginação, com plural real ("1 cliente", "2 clientes"). Protocolos e Peças mantêm a pílula de contagem.
- RMAs: linha de indicadores abaixo do título (total, em atendimento, prioridade alta); oculta antes da primeira carga e após falha; sem texto solto no painel de filtros.
- Kanban: o total é o primeiro indicador da linha de baixo ("Y RMAs" ou "X de Y RMAs" com filtro).

## 5. Kanban
- Coluna cinza-azulada, cards brancos com borda e sombra, mais respiro; hover/seleção/foco visíveis; coluna-alvo do arraste distinguível.
- Falha de leitura mostra alerta com "Tentar novamente"; vazio real x filtro sem resultado ("Limpar filtros").
- Remover um chip ou alterar filtro solta a visualização salva marcada; salvar visualização com SLA ativo não a deixa marcada.
- Lote: "1 RMA selecionado", "2 RMAs selecionados", plurais reais.
- Cards: sem resumo de falha e sem SLA saudável.

## 6. Detalhe do RMA
- Kanban (modal): corpo cinza-azulado, seções em cartões, lateral mais larga; SLA sem quebra de palavra ("Atrasado", "74h 14min / 24h 0min").
- **Status**: pílula com a cor do status e seta; abre lista; escolher abre o diálogo existente já com o status; só Administrador/Atendimento/Técnico.
- **Responsável**: campo com avatar e nome; lista com "Sem responsável" e usuários elegíveis; salva direto; erro aparece dentro do modal; só Administrador/Atendimento.
- Fechar (botão, fundo, Escape) fica bloqueado durante atribuição pendente.
- Lista de RMAs (modal): resumo em grade que quebra em 3/2/1 colunas; abas com a selecionada em destaque e navegação por setas/Home/End; Tab entra no painel; diagnóstico vazio como bloco centralizado.
- `/rmas?rma=<id>` aberto direto (rota sob demanda) abre o detalhe.
- Tela RMAs: o painel "Histórico por lote ou série" não existe mais; a busca principal acha por lote e série.

## 7. Calendário (seletor de data)
- Abre dentro da viewport com margem de 8 px; abre para cima quando falta espaço embaixo; rola por dentro se for alto; fecha ao rolar a página ou redimensionar; dias com 40 px. Conferir dentro de diálogos (sem deslocamento por `transform`/`backdrop-filter` em ancestral).

## 8. Notificações
- Sino e aba "Caixa de entrada" sem número antes do resumo carregar e depois de falha ("Contagem de não lidas indisponível"); com sucesso mostram o número.
- Regra sem destinatário e sem responsável: "Nenhum destinatário" + "Esta regra não entrega notificações a ninguém."; salvar continua permitido.
- Abas com teclado; painel entra na sequência de Tab.

## 9. Marca
- Lateral expandida: logo com nome; lateral recolhida/320 px: só o símbolo; login com a logo sobre o gradiente azul; ícone da aba com o "n" branco sobre azul (se o antigo aparecer: Ctrl+F5).

## 10. Rotas sob demanda
- Dashboard, RMAs, Kanban, clientes, produtos e usuários carregam sob demanda mantendo guardas por perfil, títulos e redirects (testar acesso negado com TECHNICIAN em /clientes e VIEWER em /rmas de escrita).

## 11. Perfis (comportamento atual, imposto no backend)
- ADMIN: tudo; só ele gerencia usuários, regras de notificação, catálogo de protocolos.
- SERVICE_DESK: abre/edita RMAs, clientes, produtos, peças e movimentos; troca responsável; muda status; registra impedimentos. Sem diagnóstico nem protocolos.
- TECHNICIAN: diagnóstico, protocolos, peças aplicadas, status, impedimentos; relatórios. Sem abrir RMA, sem editar cadastros, sem trocar responsável.
- VIEWER: leitura e relatórios; altera só as próprias preferências de notificação.

## 12. Permissões e perfis (etapa 8A) — validar com ADMIN e um usuário de cada perfil
- **Menu "Perfis"** (só com `perfis.gerir`): lista Administrador, Atendimento, Técnico e Consulta; colunas Nome, Permissões ("n de 20"), Usuários, Atualizado, Ações; total na paginação ("4 perfis").
- **Criar / editar / duplicar / excluir** um perfil: permissões em um grupo por módulo com "x de y"; Duplicar vem como "Cópia de X"; nome repetido avisa junto do campo; perfil com usuários não pode ser excluído (mostra o motivo); perfil migrado não pode ser excluído.
- **Usuários**: seletor de perfil obrigatório; coluna Perfil com "+1 extra"; seção "Permissões extras" (as do perfil aparecem marcadas e desabilitadas com "Incluída no perfil"; trocar de perfil e voltar mantém a extra marcada); filtro por perfil.
- **Regras de notificação**: destinatários agora são perfis; o resumo mostra os nomes; regra sem destinatário avisa "Esta regra não entrega notificações a ninguém." mas salva.
- **Equivalência dos 4 perfis** (nada mudou para quem já existia): Administrador tudo; Atendimento abre/edita RMA, cadastros, peças, troca responsável, sem diagnóstico; Técnico diagnóstico, protocolos, peças aplicadas, sem abrir RMA nem trocar responsável; Consulta só leitura e relatórios.
- **Perfil personalizado**: crie "Só relatórios" (apenas `relatorios.ver`), atribua a um usuário e entre com ele: só vê Relatórios e Notificações, sem erro nos filtros; crie um com `rma.responsavel` e confira o lote no Kanban só com a ação Responsável.
- **Mudança ao vivo**: tire uma permissão de um perfil enquanto o usuário está logado: na próxima ação a tela e o menu dele se ajustam sem derrubar a sessão; ao tirar `perfis.gerir` de si mesmo em /perfis você é levado a outra tela sem mensagem de erro.
- **Proteções**: não dá para remover o último administrador (mensagem "É preciso manter ao menos um administrador ativo."); quem não é administrador não concede permissões que não possui (mensagem do servidor aparece no diálogo).
- **Sessão expirada**: ao expirar, volta ao login com "Sua sessão expirou. Entre novamente."; o endereço de retorno só aceita rotas internas.
- **Banco**: migrações V8, V9 e V10 aplicadas; backup antes de V9/V10 em `%TEMP%
avitas-backup`.

## Fora do escopo desta série (decididos para depois, com aprovação)
- Remodelar permissões (perfis personalizados por grupos de permissão + permissão avulsa).
- E-mails via API do Resend.
- Relatórios (hoje listam todos os RMAs sem paginação; serão refeitos; não foram conferidos).
- Estrutura de testes para o dono: front na Vercel, back no Render, banco no Supabase.

## Limitações conhecidas
- Não verificado em navegador real: modalidade nativa dos `<dialog>` (camada superior, `inert`, `cancel` do Escape), foco após o pop-up, geometria do calendário e dos seletores com `position: fixed`, leitores de tela.
- Rodar `ng test` pelo comando padrão pode travar ("Timeout starting forks runner"); usar `--runner-config` com `maxWorkers: 2`.
- Ambiente do Codex pode falhar no build com "Access is denied" (permissões); os agentes do Claude rodam normalmente.

## Funcionalidades posteriores (13 de novembro de 2026)

As seções acima foram escritas antes destas entregas. Onde citam SLA por etapa, ações em lote, relatórios sem paginação ou "migrações V8, V9 e V10", vale o que está em `docs/` (SLA e edição em massa foram removidos; as migrações foram zeradas em uma baseline única). Os itens abaixo ainda não foram vistos em um navegador com backend real; confira com os perfis ADMIN, SERVICE_DESK, TECHNICIAN e VIEWER onde indicado. Regras completas em [prazo-e-garantia.md](../prazo-e-garantia.md), [notificacoes-e-emails.md](../notificacoes-e-emails.md) e [relatorios-e-exportacoes.md](../relatorios-e-exportacoes.md).

## 13. Prazo: tempo por etapa e data limite
- Abrir um RMA com data limite; tentar uma data anterior à entrada: o formulário recusa. Data no passado é aceita.
- Kanban: card aberto mostra "há N d N h nesta etapa"; RMA encerrado não mostra. O valor avança sozinho (cerca de 30 s), sem recarregar.
- Detalhe: "Nesta etapa" (ou "Encerrado em ...") e, no Histórico, "Tempo por etapa" e o histórico da data limite (autor, antes e depois). Mudar status só para anotar ou trocar a prioridade não reinicia a etapa.
- Com `rma.editar`: "Alterar" a data limite e remover a data. Sem a permissão (VIEWER): o botão não aparece.
- Card com data limite: "Vence em N dias" / "Vence hoje" (perto do limite) ou "Atrasado há N dias"; sem texto quando está no prazo, sem data ou encerrado.
- Filtro "Prazo" (Todos, Atrasados, Perto do limite, No prazo, Sem data limite); encerrados só em "Todos"; o filtro entra na visualização salva e uma visualização antiga abre em "Todos". Dashboard: indicador "Atrasados" com o detalhe "perto do limite".
- Virada do dia: um RMA com limite hoje passa de "Vence hoje" para "Atrasado há 1 dia" depois da meia-noite de São Paulo, sem recarregar.
- Nenhuma notificação é gerada por prazo.

## 14. Garantia e ajuste manual
- Item com data de compra: situação "Em garantia" ou "Fora de garantia" coerente com a entrada; sem data de compra: "Pendente".
- Com `rma.editar`, abrir o ajuste de um item: escolher Em garantia ou Fora de garantia exige motivo (até 255 caracteres); sem motivo, mensagem em português. Voltar ao automático não exige motivo.
- Depois do ajuste, a situação exibida é a efetiva no card, na lista, no detalhe e no relatório; a calculada continua visível no detalhe. O histórico de garantia mostra o mais recente primeiro, com autor e horário.
- Editar o RMA (cliente, datas, outros itens) preserva ajustes e prazos; remover ou trocar um item que já tem histórico de ajuste é recusado.
- RMA encerrado: o ajuste é recusado. VIEWER e TECHNICIAN não veem o controle.

## 15. Componentes trocados e intervenções
- Peças reservadas: ao aplicar, o motivo é obrigatório (até 1000) e o lote é opcional; aparecem em "Componentes trocados" com aplicado por e quando. Consumos antigos mostram "Motivo não registrado".
- Componente externo (`pecas.reservar`): código opcional, descrição, quantidade (até 3 casas), unidade e motivo; estoque não muda. Código que já existe no catálogo, inclusive inativo, é recusado com orientação para usar a reserva.
- Intervenção (`rma.diagnosticar`): tipo, descrição, data (não futura) e horas (até 3 casas); o total de horas é somado. SERVICE_DESK e VIEWER só leem.
- RMA encerrado: novas aplicações, componentes e intervenções são recusados com mensagem em português; a leitura continua.
- O laudo PDF lista componentes (motivo e lote), intervenções, técnico e horas, sem custos.

## 16. Relatórios, laudo e CSV (`relatorios.ver`)
- Sem período, o relatório cobre os últimos 90 dias; período maior que 366 dias ou invertido é recusado. Filtros por status e cliente.
- Resumo: totais, status, garantia efetiva, meses, top 10 de falhas, recorrência e tempo médio/maior na etapa atual (sem encerrados). Lista paginada (20 por página; 10/20/50/100 se houver seletor), ordenada pela entrada mais recente.
- "Laudo (PDF)" abre o PDF com acentos corretos no cabeçalho do detalhe, no modal, na tela RMAs e na lista; o arquivo se chama `laudo-<código>.pdf`.
- Exportar CSV (RMAs e resumo): abre no Excel com acentos e colunas separadas por `;`; datas `dd/MM/aaaa`; um texto começando com `=` aparece com apóstrofo. Período com mais de 5.000 RMAs é recusado com "Reduza o período".
- Sem `relatorios.ver` (SERVICE_DESK): o menu não aparece e a rota é negada.

## 17. Notificações, sino e e-mail
- Abrir um RMA gera "Novo RMA" para Administrador e Atendimento; atribuir um responsável gera "atribuído" só para ele. O sino atualiza em até 60 s; abrir a notificação leva a `/rmas?rma=<id>`.
- Caixa de entrada: filtros por tipo e severidade; marcar como lida, adiar, "marcar todas como lidas" (inclui as adiadas e as além das 100 mais recentes). Preferências: silenciar um tipo permitido; "atribuído" não pode ser silenciado.
- Regras (`notificacoes.regras`): interruptores Geral, App e E-mail por regra; destinatários por perfil; tipos sem produtor aparecem como reservados.
- E-mail (com `NOTIFICATIONS_EMAIL_ENABLED=true`, provedor `fake`, `MAIL_FROM` e `APP_BASE_URL` locais): painel "Enviados hoje X/100"; botão de e-mail de teste responde "simulado", e uma segunda tentativa em menos de 30 s é recusada; usuário sem e-mail cadastrado não recebe.
- Falhas: a lista mostra tentativas, próxima tentativa e erro sem endereço; "Reenviar" só em `FAILED`.
- Com Resend real (ambiente de testes): e-mail de teste chega; atingido o teto diário, os pendentes esperam sem virar falha.

## 18. Importação CSV de clientes e produtos (`cadastros.importar`)
- Só ADMIN vê "Importar CSV" em Clientes e Produtos e as rotas `/clientes/importar` e `/produtos/importar`; SERVICE_DESK e os demais não.
- "Baixar modelo" gera um CSV com BOM e `;`. A prévia mostra por linha o que será criado, ignorado ou rejeitado, com motivo e avisos (documento ausente, valor iniciado por `=`, `+`, `-`, `@`).
- Arquivo com coluna repetida ou desconhecida, vazio, acima de 2 MiB, de tipo errado ou com mais de 2.000 registros: mensagem em português e nada gravado.
- Confirmar: só as linhas válidas são criadas; SKU e documento já cadastrados são ignorados. Clique duplo em "Confirmar" não cria duplicados. Sem linhas válidas, a confirmação é recusada.
- Conferir que a lista de clientes ou produtos reflete os novos cadastros e que o resumo final pode diferir da prévia se outro usuário cadastrou nesse intervalo.
