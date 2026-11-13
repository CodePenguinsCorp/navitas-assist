# Pontos para Alinhamento com o Dono do Produto

Documento de apoio para decisão sobre duas funcionalidades solicitadas: Etiquetas com QR Code e Custo por RMA.

---

## 1. Etiqueta com QR Code do RMA e Número de Série

### O que seria
Uma etiqueta adesiva impressa para ser colada no produto ou na embalagem assim que o item entra na assistência, permitindo identificação visual e leitura rápida em bancada ou estoque.

### Como funcionaria no sistema
No cadastro ou no detalhe do RMA, um botão "Imprimir Etiqueta" geraria um PDF formatado para impressão contendo os dados básicos (código do RMA, cliente, produto, número de série) e o QR Code.

### Opções, Prós e Contras
* **Conteúdo do QR Code**:
  * *Opção A: Link direto da web (`/rmas?rma=ID`)* — Pró: lendo com a câmera do celular, abre diretamente a tela do RMA. Contra: exige que o dispositivo esteja na rede da empresa e com usuário autenticado.
  * *Opção B: Apenas o código do RMA e serial em texto* — Pró: universal, compatível com qualquer leitor óptico USB de bancada (bipador). Contra: não abre página web automaticamente no smartphone.
* **Formato de impressão**:
  * *Opção A: Etiqueta térmica individual (ex.: 50x30 mm)* — Pró: padrão industrial para impressoras térmicas (Zebra, Argox); imprime uma a uma sob demanda. Contra: exige impressora térmica na bancada.
  * *Opção B: Folha A4 com grade de etiquetas (ex.: Pimaco)* — Pró: funciona em qualquer impressora comum. Contra: desperdício de folha se a entrada for unitária; alinhamento de margens complexo.
* **Leitura no chão de fábrica**: celular com câmera (flexível, mas exige celular conectado) vs. bipador USB no computador da bancada (mais rápido e ergonômico para o técnico).
* **Necessidade real**: Vale avaliar se a etiqueta física é indispensável neste momento ou se a ordem de serviço impressa/identificação visual atual já supre a rotina operacional.

### Esforço relativo
* **Pequeno** para etiqueta térmica individual com código do RMA.
* **Médio** caso envolva diagramação em folhas A4 com grade ou leitura integrada no app mobile.

### O que o sistema JÁ tem hoje
* O link direto `/rmas?rma=<id>` **já está implementado** no frontend, abrindo direto o modal do RMA (inclusive preservando o link após a tela de login).
* Motor de geração de PDFs pronto no backend (OpenPDF).
* Numeração única de RMA (`rma.code`) e campos de número de série já estruturados.

### O que depende de decisão do dono
1. Definir se a etiqueta é indispensável para o processo físico ou se pode ser postergada.
2. Escolher o modelo operacional: impressora térmica dedicada ou impressora comum A4.
3. Escolher o conteúdo do QR: link web direto para celular ou código de texto para leitor de código de barras.

### Perguntas objetivas para o dono
1. A oficina possui impressora térmica de etiquetas (Zebra/Argox) ou apenas impressora comum?
2. Os técnicos usarão smartphone na bancada ou leitor/bipador USB conectado ao computador?
3. Podemos iniciar a operação sem etiquetas adesivas e validar a necessidade no dia a dia?

---

## 2. Custo por RMA (Peças + Horas de Serviço)

### O que seria
Cálculo automático do custo total de cada reparo: `Custo Total = Custo das Peças Consumidas + (Horas de Intervenção × Valor da Hora)`.

### Como funcionaria no sistema
Ao registrar peças consumidas e horas gastas pelos técnicos, o sistema aplicaria o valor-hora configurado para calcular o custo total do atendimento.

### Opções, Prós e Contras
* **Cálculo da hora técnica**:
  * *Taxa horária global única* (ex.: R$ 80/h para toda a assistência) — Pró: configuração simples, manutenção zero. Contra: não reflete especialidades diferentes.
  * *Taxa por tipo de intervenção* (ex.: diagnóstico R$ 90/h, limpeza R$ 50/h) — Pró: mais preciso. Contra: exige tabela de preços de serviços.
  * *Taxa por técnico* — Não recomendado: complexidade contábil e risco de exposição salarial.
* **Peças fora do estoque (sem cadastro prévio)**: atualmente são registradas em `RmaExternalComponent` sem campo de valor. Opções: incluir campo opcional de custo na inclusão vs. considerar custo R$ 0,00 vs. exigir que toda peça venha do estoque cadastrado.
* **Garantia**: RMAs dentro da garantia representam **custo interno para a Navitas** (prejuízo/cobertura) e não são cobrados do cliente. Já atendimentos fora de garantia podem ser faturados.
* **Riscos Contábeis e Variação de Preços**: o sistema usa o custo cadastrado na peça no momento do consumo. Mudanças futuras no cadastro de peças não afetam RMAs passados, mas o sistema não gerencia custo médio ponderado nem lotes contábeis (FIFO).
* **Onde exibir e Quem pode ver**:
  * *Onde*: detalhe interno do RMA e relatórios gerenciais/CSV. No laudo do cliente, o recomendável é **não exibir custos**, apenas peças trocadas e horas.
  * *Permissão*: criar permissão específica (ex.: `custos.ver`), evitando que técnicos ou terceiros visualizem margens e custos da empresa.

### Versão Mínima vs. Versão Completa
* **Versão Mínima (MVP)**: taxa horária única global cadastrada no sistema; cálculo exibido apenas na aba de detalhes do RMA; visível somente para administradores.
* **Versão Completa**: taxa horária configurável por tipo de serviço; campo de custo em peças fora de estoque; visão de custos e rentabilidade nos relatórios gerenciais e exportação CSV.

### Esforço relativo
* **Pequeno** para a versão mínima (aproveita quase toda a estrutura existente).
* **Médio** para a versão completa (novas configurações, tabelas e filtros nos relatórios).

### O que o sistema JÁ tem hoje
* `Part.unitCost` e cálculo automático de `consumedCost` e `reservedCost` no backend (`PartStockService`).
* Painel de peças no frontend já exibe o custo de peças consumidas no RMA.
* Registro de intervenções com horas (`hours`) e soma total (`totalServiceHours`).
* Geração do laudo PDF estruturada (já inclui peças e horas, hoje sem valores).

### O que depende de decisão do dono
1. Definição do modelo da taxa horária (taxa única vs. por tipo de intervenção).
2. Tratamento para peças fora do estoque (campo de valor livre vs. sem custo).
3. Nível de sigilo: quem na empresa pode ver valores financeiros de custo.

### Perguntas objetivas para o dono
1. Podemos adotar uma taxa horária única para a empresa (ex.: R$ 80,00/h) ou precisa variar por tipo de reparo?
2. As peças fora de estoque devem permitir digitar um valor de custo na hora da aplicação?
3. Os custos devem ficar restritos aos administradores e omitidos do laudo enviado ao cliente?

---

## Decisões Prioritárias para o Dono do Produto
1. **Etiquetas**: Avançar com etiqueta térmica individual (50x30 mm) ou adiar para uma etapa posterior?
2. **Formato do QR Code**: Conter link direto da web (`/rmas?rma=ID`) ou apenas texto com código/serial?
3. **Custo por RMA**: Iniciar com a Versão Mínima (taxa horária única global, visível apenas a gestores)?
4. **Peças Fora do Estoque**: Permitir informar o custo na inclusão ou manter apenas controle de quantidade?
