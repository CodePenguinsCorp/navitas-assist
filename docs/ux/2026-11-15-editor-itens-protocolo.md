# Editor dos itens do protocolo

O dono reprovou o editor de itens com três falas: não achou onde altera o título; com tipo Medição "fica um monte de caixa que não dá para entender nada"; e a linha acima de Obrigatório e Exige evidência "não precisa".

## Diagnóstico

- O título do item é o campo rotulado "Item", o terceiro da grade (depois de Etapa), e o cabeçalho recolhido mostra "Sem título" sem dizer de onde vem. O nome do campo não casa com o que o cabeçalho exibe.
- Em Medição, nove campos caem numa grade `auto-fit` de colunas de 180 px: Etapa, Item, Tipo, Unidade, Casas decimais, Mínimo, Máximo, e as duas áreas de texto. As alturas diferem (mensagem de erro, textarea de 110 px) e nada separa o que identifica o item do que só vale para medição.
- A divisória do rodapé é uma `border-top` própria do componente, sem função: o espaço já separa.
- O contrato não validava mínimo <= máximo no cliente (só o backend recusava, depois de salvar).

## Campos por tipo (contrato `ProtocolTemplateItemRequest`)

| Campo | Verificação | Medição | Anotação |
| --- | --- | --- | --- |
| Título (200), Etapa (120) | obrigatórios | obrigatórios | obrigatórios |
| Tipo | sim | sim | sim |
| Unidade (20), Casas decimais (0 a 6) | não vão ao servidor | obrigatórios no backend | não vão ao servidor |
| Mínimo, Máximo (até 13 inteiros e 6 decimais, mínimo <= máximo, no máximo as casas decimais) | não | opcionais | não |
| Instruções (1000), Resultado esperado (500) | opcionais | opcionais | opcionais |
| Obrigatório, Exige evidência | sim | sim | sim |

O que muda entre tipos é só o bloco de limites: apenas Medição precisa de unidade, casas e faixa. O resto é comum. Instruções é o texto que o técnico lê na execução (aparece em `shared/rma-protocols`), então não é raro nem secundário; Resultado esperado é a referência para comparar. Por isso os dois ficam visíveis e não recolhidos em "Detalhes": esconder esconderia também erros de limite de tamanho e o campo que o técnico mais lê.

## Ordem natural de preenchimento

1. Título (o que se verifica): o campo mais importante e o único que o cabeçalho recolhido repete.
2. Etapa (grupo em que o item aparece na execução) e Tipo.
3. Bloco "Medição", só quando o tipo exige: Unidade, Casas decimais, Mínimo, Máximo, nessa ordem de leitura ("em mm, com 2 casas, de tanto a tanto").
4. Instruções e Resultado esperado.
5. Obrigatório e Exige evidência, como opções do item.

## Como outros editores fazem

A pesquisa na web trouxe pouco detalhe de layout. O confirmado: o SafetyCulture (iAuditor) trata cada resposta por tipo (número com unidade escolhida abaixo do rótulo da pergunta) e mostra campos de lógica só para os tipos que os aceitam; divulgação progressiva (mostrar campos só quando o contexto pede) é a recomendação geral para formulários dinâmicos. Jira, Notion, Typeform e Google Forms não tiveram a organização interna confirmada pela busca; não se afirma aqui nada sobre eles além do padrão amplamente conhecido: pergunta em destaque no topo, tipo ao lado e opções condicionais aparecendo só quando o tipo as usa.

## Desenho adotado

- Título primeiro, largura total, rótulo "Título do item" com asterisco, placeholder "O que verificar" e destaque de tamanho. Cabeçalho recolhido: título, ou "Sem título" em muted quando vazio.
- Linha Etapa (grupo) | Tipo; a ajuda da etapa é uma linha curta ("Agrupa os itens na execução.").
- Bloco "Medição" (subtítulo, sem borda): uma linha com Unidade | Casas decimais | Mínimo | Máximo, todos com a mesma altura, placeholders de formato, e erro de faixa abaixo do Máximo.
- Instruções | Resultado esperado: textareas de 6rem (padrão `.inline-form`), lado a lado e empilhadas até 600 px.
- Rodapé: Obrigatório e Exige evidência em dois switches na mesma linha, sem divisória e sem borda. Remover continua no cabeçalho do item.
- O limite de 100 itens do contrato passa a valer no botão Adicionar item (antes só o servidor recusava). Mantidos: validações, `aria-controls`, expandir/recolher por item (sem "Expandir todos"), erro só após tocar.
