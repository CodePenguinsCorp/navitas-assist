# Dados de demonstração

Requer Node.js 18+ e Navitas Assist local iniciado, com uma conta administradora. Sem dependências.

```powershell
node scripts/dev-seed/seed.mjs
# Opcionais:
$env:SEED_BASE_URL = 'http://localhost:4201'
$env:SEED_USER = 'admin'
$env:SEED_PASSWORD = 'admin123'
```

Os padrões são `http://localhost:4201` e `admin` / `admin123`. Configure as variáveis **antes** de executar. Por padrão, o script aceita apenas origens de loopback e envia cookies de sessão, `Origin` e `X-XSRF-TOKEN`. Consulta `/api/auth/me`, obtém o CSRF inicial em `/api/auth/csrf` quando necessário, faz login e consulta `/api/auth/me` novamente.

Para um ambiente remoto de testes, exige `SEED_ALLOW_REMOTE=1`, `SEED_BASE_URL` com origem HTTPS sem caminho/credenciais, `SEED_USER` e `SEED_PASSWORD` explícitos. Não segue redirecionamentos. Use a URL da Vercel (proxy `/api`) e mantenha e-mail desligado durante a carga. O roteiro com prompt de senha e limpeza das variáveis está em [ambiente de testes](../../docs/ambiente-de-testes.md). A opção remota permite criar dados em qualquer origem HTTPS informada; confira o destino e nunca use produção. As contas demo têm senha conhecida: altere/desative depois da apresentação.

Cria pela API os perfis Atendimento, Técnico e Consulta antes dos usuários, reutilizando nomes sem diferenciar caixa e preservando permissões existentes. Não muda os destinatários das notificações.

Cria 3 clientes, 3 produtos, 3 peças com entradas de 20 unidades, 3 usuários, 7 RMAs em etapas e prioridades variadas, 2 impedimentos, 2 usos de peça e um modelo de protocolo com 3 execuções (uma concluída). Os nomes de clientes e produtos contêm `[DEMO]`; SKUs, códigos, lotes e séries usam `DEMO-`. A senha inicial das contas criadas é impressa ao final.

Para testar listas, filtros, paginação e relatórios, defina `SEED_VOLUME=100` (ou outro número) antes de executar: além da carga base, cria essa quantidade de OS extras (série `DEMO-V-0001...`) em todas as etapas, prioridades, prazos e garantias variados, com responsáveis e alguns impedimentos, mais 20 clientes (`[DEMO] Cliente Volume ...`), 20 produtos (`DEMO-V001...`) e 2 técnicos extras (`demo.tecnico2`, `demo.tecnico3`). É idempotente: repetir não duplica. Além disso cria 8 modelos de protocolo por produto e 5 por categoria (`[DEMO] Protocolo geral de ...`) e inicia uma execução em uma a cada quatro OS novas, escolhendo um modelo ativo que se aplique ao produto da OS (a API recusa os demais); se um uso de peça ou execução falhar, o script imprime o motivo real como aviso e segue. As datas usam o dia civil de São Paulo, para a entrada não cair em "amanhã" à noite.

Pode repetir após falha: consulta todas as páginas e reutiliza nomes, SKUs, códigos e séries fixos; consulta também entradas, usos de peça e protocolos antes de criar. Execute uma instância por vez. Não redefine senhas nem desfaz alterações manuais em etapas já alcançadas, impedimentos resolvidos ou usos desfeitos. Se registros marcados forem editados ou removidos manualmente, a carga pode precisar de revisão. Não há transação global nem limpeza automática; remova os vínculos antes dos cadastros ao limpar.

Contratos conferidos nos controllers, DTOs e services de `backend/src/main/java/br/com/navitasassist`. Não altera aplicação, SQL ou Flyway. Validação sem acessar o app:

```powershell
node --check scripts/dev-seed/seed.mjs
node --test scripts/dev-seed/guard.test.mjs scripts/dev-seed/profiles.test.mjs
```
