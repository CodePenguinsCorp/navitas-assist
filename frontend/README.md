# Navitas Assist - Frontend

Interface web do Navitas Assist, feita em Angular 21 com componentes standalone e signals para o estado.

- Código-fonte em `src/app`: páginas em `pages`, componentes compartilhados em `shared` e serviços, modelos e utilitários em `core`.
- Os testes unitários usam Vitest com TestBed e ficam ao lado do código, em arquivos `*.spec.ts`.
- As chamadas à API passam por serviços HTTP em `core/services`, com os tipos declarados em `core/models.ts`.
- O acesso às rotas e às ações da tela segue as permissões definidas em `core/permissions.ts`.

Comandos de instalação, execução, testes e build: veja [`../docs/desenvolvimento.md`](../docs/desenvolvimento.md).
