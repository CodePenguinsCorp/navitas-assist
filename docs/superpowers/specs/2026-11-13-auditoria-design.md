# Auditoria em três níveis

Decisão aprovada do produto em 13/11/2026: logs de erro com código de ocorrência e logs de login; trilha somente de inserção, transacional, para operações administrativas; consulta protegida por `auditoria.ver`.

O registro é explícito nos serviços, dentro da transação do dado. O ator é obtido do contexto de segurança e o IP da conexão. Resumos não copiam valores de cadastros pessoais ou segredos; observações de status preservam os textos anterior (até 200 caracteres) e novo (até 255), com máscaras de dados pessoais e segredos reconhecidos. Históricos de garantia/reparo são referenciados sem duplicação.

A V13 adiciona `audit_events` e a concessão ao Administrador. A API GET `/api/audit-events` pagina até 100 registros (padrão 20), filtra datas inclusivas em America/Sao_Paulo, ator, ação e tipo, ordena por instante e ID desc. A tela lazy `/auditoria` usa os componentes compartilhados, sem exportação, edição ou exclusão.

A implementação reutiliza Spring Data, transações e componentes Angular existentes. Eventos explícitos foram escolhidos para permitir resumos próprios de cada domínio; interceptação genérica de requisições não fornece os diffs de negócio e o vínculo transacional necessários.

Retenção e limpeza ficam para decisão futura. E-mail de teste registra solicitação: envio externo não participa da transação do banco.

Texto livre exige cuidado na origem: máscaras não reconhecem todas as formas de dados pessoais ou credenciais. Os limites devem constar na documentação da funcionalidade.
