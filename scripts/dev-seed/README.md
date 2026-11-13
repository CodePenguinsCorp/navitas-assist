# Dados de demonstração LOCAL

Requer Node.js 18+ e Navitas Assist local iniciado, com os perfis Atendimento, Técnico e Consulta e uma conta administradora. Sem dependências.

```powershell
node scripts/dev-seed/seed.mjs
# Opcionais:
$env:SEED_BASE_URL = 'http://localhost:4201'
$env:SEED_USER = 'admin'
$env:SEED_PASSWORD = 'admin123'
```

Os padrões são `http://localhost:4201` e `admin` / `admin123`. Configure as variáveis **antes** de executar. O script aceita apenas origens de loopback e envia cookies de sessão, `Origin` e `X-XSRF-TOKEN`. Consulta `/api/auth/me`, obtém o CSRF inicial em `/api/auth/csrf` quando necessário, faz login e consulta `/api/auth/me` novamente.

Cria 3 clientes, 3 produtos, 3 peças com entradas de 20 unidades, 3 usuários, 7 RMAs em etapas e prioridades variadas, 2 impedimentos, 2 reservas e um modelo de protocolo com 3 execuções (uma concluída). Os nomes de clientes e produtos contêm `[DEMO]`; SKUs, códigos, lotes e séries usam `DEMO-`. A senha inicial das contas criadas é impressa ao final.

Pode repetir após falha: consulta todas as páginas e reutiliza nomes, SKUs, códigos e séries fixos; consulta também entradas, reservas e protocolos antes de criar. Execute uma instância por vez. Não redefine senhas nem desfaz alterações manuais em etapas já alcançadas, impedimentos resolvidos ou reservas canceladas. Se registros marcados forem editados ou removidos manualmente, a carga pode precisar de revisão. Não há transação global nem limpeza automática; remova os vínculos antes dos cadastros ao limpar.

Contratos conferidos nos controllers, DTOs e services de `backend/src/main/java/br/com/navitasassist`. Não altera aplicação, SQL ou Flyway. Validação sem acessar o app:

```powershell
node --check scripts/dev-seed/seed.mjs
```
