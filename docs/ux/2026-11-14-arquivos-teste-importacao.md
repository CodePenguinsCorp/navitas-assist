# Arquivos para testar importação

Pasta: `C:\Users\joseh\Desktop\Navitas\arquivos-de-teste`.

| Arquivo | Registros | O que exercita |
| --- | ---: | --- |
| clientes-validos.csv | 10 | Clientes fictícios com documentos distintos, acentos e endereço com vírgula |
| clientes-com-erros.csv | 8 | 2 válidas (uma sem documento, com aviso), 5 inválidas (razão social ausente, e-mail inválido, telefone longo, documento só com máscara e fantasia longa), 1 duplicada por documento normalizado |
| produtos-validos.csv | 10 | Produtos fictícios com SKU distinto, garantias de 12 e 24 meses, acentos e ponto e vírgula entre aspas |
| produtos-com-erros.csv | 10 | 2 válidas, 7 inválidas (SKU ausente ou longo, nome ausente, garantia zero, decimal, ausente ou acima do inteiro de 32 bits), 1 duplicada por SKU sem diferenciar maiúsculas |
| clientes-latin1.csv | 2 | Windows-1252 com acentos para provocar rejeição de UTF-8 e orientar conversão |

Contagens esperadas em banco sem essas chaves. Reimportar os arquivos válidos deve apresentar duplicadas. Os arquivos mistos usam chaves diferentes dos arquivos válidos.

Os cabeçalhos seguem literalmente o modelo de `CatalogImportController`, baixado por `CatalogService.downloadImportTemplate`: clientes usam `razao_social;nome_fantasia;documento;email;telefone;endereco;observacoes`; produtos usam `sku;nome;categoria;versao_hardware;versao_firmware;garantia_meses;notas_tecnicas`. Os quatro arquivos normais têm UTF-8 com BOM, separador ponto e vírgula e CRLF, como o modelo. O arquivo latin1 tem Windows-1252 sem BOM.

Limites lidos em `CatalogImportService`, `CsvImportParser`, `ClientRequest` e `ProductRequest`: 2 MiB por arquivo, 2.000 registros, 8 KiB por campo e 16 KiB por registro. Cliente exige razão social (até 120 caracteres sem contar espaços e hifens); fantasia/e-mail até 120, documento 18, telefone 30, endereço 255 e observações 1.000. Produto exige SKU (20), nome (120) e garantia inteira de 1 a 2.147.483.647; categoria 80, versões 40 e notas 1.000 caracteres.

Verificação local: leitura CSV, sete colunas em todos os registros, cabeçalhos exatos, contagens e codificação; Windows-1252 rejeitado por decodificador UTF-8 estrito. Não houve envio dos arquivos ao backend nem teste em navegador. Os limites máximos de volume não são exercitados por estes arquivos pequenos.


## Prévia de clientes e produtos

- Três métricas compactas filtram válidas, inválidas e duplicadas; Todas restaura a lista. O filtro ativo usa `aria-pressed`, foco visível e anúncio de contagem com `aria-live`.
- Arquivo e contagens aparecem juntos; os status usam mini-chips nos tons de sucesso, perigo e aviso. A tabela tem caption, coluna de linha estreita, identificação com quebra e ausência de motivos indicada por um traço discreto.
- Paginação compartilhada em um rodapé, com contagem à esquerda e controles à direita. Cancelar e Importar ficam no rodapé da prévia; importar exige pelo menos uma válida.
- Conferir 0, 1 e várias linhas nas métricas, linhas em branco, botão de importação e resumo final. No singular: `1 válida`, `1 linha em branco ignorada`, `Importar 1 linha válida` e `1 linha importada`.
- Conferir os três filtros, Todas, filtro vazio, mudança de tamanho e página, troca de arquivo e avisos com texto literal. Conferir visualmente em desktop e 320 px; esta alteração não foi validada em navegador.
