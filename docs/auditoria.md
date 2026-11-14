# Auditoria

A auditoria tem três níveis: logs do servidor, trilha transacional no banco e consulta na tela **Auditoria** (`/auditoria`).

## Logs do servidor

- Erro inesperado: `ERROR`, com exceção completa no servidor e código de ocorrência de oito caracteres. O cliente recebe apenas o envelope `ApiError` com a mensagem “Erro inesperado. Informe o código XXXXXXXX ao suporte.”.
- Login concluído: `INFO`; credenciais recusadas: `WARN`. O registro contém username normalizado e limitado a 60 caracteres e IP de `request.getRemoteAddr()`; não interpreta `X-Forwarded-For`.
- Senha, corpo de login e tokens não são registrados. Falhas de login ficam somente nos logs.

## Trilha no banco

`audit_events` recebe apenas inserções. O registro ocorre dentro da transação da operação: falha ao gravar o evento reverte a operação e rollback da operação remove também seu evento. Não há endpoint de edição ou exclusão.

| Operação | Conteúdo |
| --- | --- |
| Usuários | Criação, exclusão e campos alterados; ativação, senha e e-mail alterados sem seus valores. Perfil e permissões com permissões adicionadas/removidas. |
| Perfis | Criação, edição, exclusão e diferença de permissões. |
| Clientes e produtos | Criação, exclusão e nomes dos campos alterados; nome/código no rótulo do registro. |
| Observação de status da OS | Texto anterior limitado a 200 caracteres e texto novo até 255, com máscaras para dados pessoais e segredos reconhecidos. |
| Notificações | Alteração de regras, solicitação de reenvio e solicitação de e-mail de teste, sem endereço de destino. |
| Importação CSV | Confirmação com contagens, sem conteúdo das linhas. |
| Garantia e anulação de reparo | Referência ao histórico específico existente, sem repetir seus dados. |

O ator vem do contexto autenticado, nunca do corpo da requisição. São preservados username e ID do ator; a exclusão posterior da conta não apaga o evento. O IP vem da conexão HTTP. Em operações sem contexto HTTP ele pode ficar vazio.

Resumos de cadastros não copiam valores de e-mail, documento, telefone ou endereço, nem senha/hash.

As observações preservam o texto anterior e o novo com máscaras para e-mail, números de documento/telefone, endereços e marcadores de segredo reconhecidos. Essas máscaras não identificam todo dado pessoal possível em texto livre; não inclua dados pessoais ou credenciais nas observações. O anterior é limitado a 200 caracteres e o novo preserva até 255.

O envio externo de e-mail não pode ser revertido pelo banco. O evento de teste descreve a **solicitação**, não comprova entrega; o resultado da entrega continua no mecanismo de e-mail.

Não são registrados acessos de leitura, navegação, falhas de login na tabela, prévias de CSV ou o conteúdo importado. A trilha não substitui os históricos próprios de OS, garantia e reparo.

## Consulta

Exige `auditoria.ver`, concedida por padrão somente ao Administrador. A permissão pode ser atribuída explicitamente seguindo as regras de concessão existentes.

Na tela **Auditoria**, escolha período, username, ação e tipo de registro e clique em **Filtrar**. **Limpar filtros** reinicia a consulta. Os dias do período são inclusivos em `America/Sao_Paulo`; a data/hora também aparece nesse fuso. O filtro de usuário corresponde ao username completo sem diferenciar maiúsculas de minúsculas.

`GET /api/audit-events` aceita `from`, `to` (`YYYY-MM-DD`), `actor`, `action`, `entityType`, `page` (base zero) e `size` (padrão 20, máximo 100). Ordem: `occurred_at DESC, id DESC`. A resposta paginada expõe apenas ID, instante, username, ação, tipo, ID/rótulo do registro e resumo. IDs internos do ator e IP não aparecem na consulta.

## Decisões futuras

Não há exportação, retenção automática nem limpeza. O prazo de retenção, os responsáveis pela política e eventual limpeza são decisões futuras do produto.
