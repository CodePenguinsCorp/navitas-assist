# Formulários inline do detalhe da OS

Diagnóstico, impedimentos, intervenções, peças (reservar, aplicar, componente externo, anular), garantia e observação do status abriam formulários com rótulos, alturas e botões diferentes. Todos usam agora um único padrão, definido em `frontend/src/styles.css`.

- Container: `.inline-form` (grade de 2 colunas, 1 coluna até 600 px). Vale para `<form>` e para `<div>` quando o envio é por botão.
- Campo: `.field-group` com o rótulo como filho direto (`<label>` ou `<span>`), sempre visível, em semibold e `--font-size-md`. Campo largo usa `.field-group--full`.
- Obrigatório: `.field-group--required` acrescenta um asterisco discreto ao rótulo. Não se escreve "obrigatório" nem "(opcional)" no texto.
- Textarea: altura fixa de 6rem, sem alça de redimensionar, com a barra de rolagem padrão.
- Erros: `small.field-error` logo abaixo do campo; mensagem do formulário inteiro também em `.field-error`, na largura total.
- Rodapé: `.form-actions.inline-form__actions`, alinhado à direita, Cancelar (`.button-secondary`) antes da ação primária (`.button-primary`), ambos com `--control-height`.
- O formulário abre no corpo da seção; o cabeçalho (`app-collapsible-section`) não muda.

O spec de cada componente chama `expectInlineForm` (`frontend/src/app/testing/inline-form.ts`) para afirmar a classe, o rodapé, os rótulos e os campos obrigatórios. Fora deste padrão ficam o resultado de protocolo (`shared/rma-protocols`) e os modais de cadastro, que têm cabeçalho e rodapé próprios.
