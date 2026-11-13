package br.com.navitasassist.catalogimport;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static br.com.navitasassist.catalogimport.CsvImportParser.CsvImportException;
import static br.com.navitasassist.catalogimport.CsvImportParser.ParsedCsv;
import static br.com.navitasassist.catalogimport.CsvImportParser.ParsedRow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CsvImportParserTest {

    @Test
    @DisplayName("Deve detectar delimitador vírgula e fazer parse de CSV simples com LF")
    void shouldDetectCommaDelimiterAndParseSimpleCsv() {
        String csv = "nome,idade,cidade\nJoão,30,São Paulo\nMaria,25,Campinas";
        ParsedCsv result = CsvImportParser.parse(csv.getBytes(StandardCharsets.UTF_8));

        assertNotNull(result);
        assertEquals(',', result.delimiter());
        assertEquals(List.of("nome", "idade", "cidade"), result.header());
        assertEquals(2, result.rows().size());

        ParsedRow row1 = result.rows().get(0);
        assertEquals(2, row1.lineNumber());
        assertEquals(List.of("João", "30", "São Paulo"), row1.fields());

        ParsedRow row2 = result.rows().get(1);
        assertEquals(3, row2.lineNumber());
        assertEquals(List.of("Maria", "25", "Campinas"), row2.fields());
    }

    @Test
    @DisplayName("Deve detectar delimitador ponto e vírgula e fazer parse de CSV com CRLF")
    void shouldDetectSemicolonDelimiterAndParseSimpleCsvWithCrlf() {
        String csv = "codigo;descricao;preco\r\n001;Teclado;150.00\r\n002;Mouse;80.00";
        ParsedCsv result = CsvImportParser.parse(csv.getBytes(StandardCharsets.UTF_8));

        assertNotNull(result);
        assertEquals(';', result.delimiter());
        assertEquals(List.of("codigo", "descricao", "preco"), result.header());
        assertEquals(2, result.rows().size());

        assertEquals(2, result.rows().get(0).lineNumber());
        assertEquals(List.of("001", "Teclado", "150.00"), result.rows().get(0).fields());

        assertEquals(3, result.rows().get(1).lineNumber());
        assertEquals(List.of("002", "Mouse", "80.00"), result.rows().get(1).fields());
    }

    @Test
    @DisplayName("Deve detectar delimitador ignorando caracteres delimitadores dentro de aspas no cabeçalho")
    void shouldDetectDelimiterIgnoringDelimitersInsideQuotesInHeader() {
        // Vírgula dentro de aspas no cabeçalho, ponto e vírgula fora de aspas -> deve detectar ';'
        String csvSemicolon = "\"nome,completo\";idade;cidade\nJoão Silva;30;SP";
        ParsedCsv resultSemicolon = CsvImportParser.parse(csvSemicolon.getBytes(StandardCharsets.UTF_8));
        assertEquals(';', resultSemicolon.delimiter());
        assertEquals(List.of("nome,completo", "idade", "cidade"), resultSemicolon.header());

        // Ponto e vírgula dentro de aspas no cabeçalho, vírgula fora de aspas -> deve detectar ','
        String csvComma = "\"nome;completo\",idade,cidade\nJoão Silva,30,SP";
        ParsedCsv resultComma = CsvImportParser.parse(csvComma.getBytes(StandardCharsets.UTF_8));
        assertEquals(',', resultComma.delimiter());
        assertEquals(List.of("nome;completo", "idade", "cidade"), resultComma.header());
    }

    @Test
    @DisplayName("Deve preservar separador dentro de aspas em campos de dados")
    void shouldPreserveDelimiterInsideQuotesInDataFields() {
        String csvComma = "id,endereco\n1,\"Rua das Flores, 123, Apto 4\"";
        ParsedCsv resultComma = CsvImportParser.parse(csvComma.getBytes(StandardCharsets.UTF_8));
        assertEquals(1, resultComma.rows().size());
        assertEquals("Rua das Flores, 123, Apto 4", resultComma.rows().get(0).fields().get(1));

        String csvSemicolon = "id;descricao\n10;\"Chave;Valor;Item\"";
        ParsedCsv resultSemicolon = CsvImportParser.parse(csvSemicolon.getBytes(StandardCharsets.UTF_8));
        assertEquals(1, resultSemicolon.rows().size());
        assertEquals("Chave;Valor;Item", resultSemicolon.rows().get(0).fields().get(1));
    }

    @Test
    @DisplayName("Deve lançar exceção se delimitador for ambíguo no cabeçalho")
    void shouldThrowWhenDelimiterIsAmbiguousInHeader() {
        String csv = "nome,sobrenome;idade\nJoão,Silva;30";
        CsvImportException ex = assertThrows(CsvImportException.class, () ->
                CsvImportParser.parse(csv.getBytes(StandardCharsets.UTF_8))
        );
        assertEquals("Não foi possível identificar o separador", ex.getMessage());
    }

    @Test
    @DisplayName("Deve lançar exceção se delimitador estiver ausente no cabeçalho ou arquivo vazio")
    void shouldThrowWhenDelimiterIsAbsentInHeaderOrEmptyFile() {
        // Apenas uma coluna sem delimitador
        String singleCol = "nome_completo\nJoão Silva";
        assertEquals(1, CsvImportParser.parse(singleCol.getBytes(StandardCharsets.UTF_8)).rows().size());

        // Arquivo vazio
        CsvImportException ex2 = assertThrows(CsvImportException.class, () ->
                CsvImportParser.parse(new byte[0])
        );
        assertEquals("Não foi possível identificar o separador", ex2.getMessage());

        // Arquivo apenas com linhas em branco
        String whitespaceOnly = "   \r\n   \n   ";
        CsvImportException ex3 = assertThrows(CsvImportException.class, () ->
                CsvImportParser.parse(whitespaceOnly.getBytes(StandardCharsets.UTF_8))
        );
        assertEquals("Não foi possível identificar o separador", ex3.getMessage());
    }

    @Test
    @DisplayName("Deve processar UTF-8 com BOM (EF BB BF) descartando o BOM")
    void shouldHandleUtf8WithBom() {
        byte[] bom = new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
        byte[] content = "coluna1;coluna2\nvalor1;valor2".getBytes(StandardCharsets.UTF_8);
        byte[] combined = new byte[bom.length + content.length];
        System.arraycopy(bom, 0, combined, 0, bom.length);
        System.arraycopy(content, 0, combined, bom.length, content.length);

        ParsedCsv result = CsvImportParser.parse(combined);
        assertEquals(';', result.delimiter());
        assertEquals(List.of("coluna1", "coluna2"), result.header());
        assertEquals(1, result.rows().size());
        assertEquals(List.of("valor1", "valor2"), result.rows().get(0).fields());
    }

    @Test
    @DisplayName("Deve lançar exceção quando bytes UTF-8 forem inválidos")
    void shouldThrowWhenUtf8BytesAreInvalid() {
        byte[] invalidUtf8 = new byte[]{(byte) 0xC3, (byte) 0x28, (byte) 0x61, (byte) 0x3B, (byte) 0x62};
        CsvImportException ex = assertThrows(CsvImportException.class, () ->
                CsvImportParser.parse(invalidUtf8)
        );
        assertEquals("Arquivo deve estar em UTF-8", ex.getMessage());
    }

    @Test
    @DisplayName("Deve lançar exceção quando arquivo for UTF-16 com ou sem BOM")
    void shouldThrowWhenUtf16WithOrWithoutBom() {
        // UTF-16 BE com BOM
        byte[] utf16Be = new byte[]{(byte) 0xFE, (byte) 0xFF, 0x00, 0x61, 0x00, 0x3B, 0x00, 0x62};
        CsvImportException exBe = assertThrows(CsvImportException.class, () ->
                CsvImportParser.parse(utf16Be)
        );
        assertEquals("Arquivo deve estar em UTF-8", exBe.getMessage());

        // UTF-16 LE com BOM
        byte[] utf16Le = new byte[]{(byte) 0xFF, (byte) 0xFE, 0x61, 0x00, 0x3B, 0x00, 0x62, 0x00};
        CsvImportException exLe = assertThrows(CsvImportException.class, () ->
                CsvImportParser.parse(utf16Le)
        );
        assertEquals("Arquivo deve estar em UTF-8", exLe.getMessage());

        // UTF-16 LE sem BOM (caracteres ASCII com bytes nulos intercalados)
        byte[] utf16LeNoBom = "h1;h2\n1;2".getBytes(StandardCharsets.UTF_16LE);
        CsvImportException exNoBom = assertThrows(CsvImportException.class, () ->
                CsvImportParser.parse(utf16LeNoBom)
        );
        assertEquals("Arquivo deve estar em UTF-8", exNoBom.getMessage());
    }

    @Test
    @DisplayName("Deve lançar exceção quando conteúdo for nulo")
    void shouldThrowWhenContentIsNull() {
        CsvImportException ex = assertThrows(CsvImportException.class, () ->
                CsvImportParser.parse(null)
        );
        assertEquals("Arquivo deve estar em UTF-8", ex.getMessage());
    }

    @Test
    @DisplayName("Deve processar aspas escapadas com aspas duplas (\"\")")
    void shouldParseEscapedQuotes() {
        String csv = "id;descricao\n1;\"Texto com \"\"aspas\"\" dentro\"\n2;\"\"\"Inicio\"\" e \"\"Fim\"\"\"";
        ParsedCsv result = CsvImportParser.parse(csv.getBytes(StandardCharsets.UTF_8));

        assertEquals(2, result.rows().size());
        assertEquals("Texto com \"aspas\" dentro", result.rows().get(0).fields().get(1));
        assertEquals("\"Inicio\" e \"Fim\"", result.rows().get(1).fields().get(1));
    }

    @Test
    @DisplayName("Deve processar campo multilinha preservando quebras de linha")
    void shouldParseMultilineField() {
        String csv = "id;obs\n1;\"Linha 1\nLinha 2\r\nLinha 3\"\n2;Normal";
        ParsedCsv result = CsvImportParser.parse(csv.getBytes(StandardCharsets.UTF_8));

        assertEquals(2, result.rows().size());
        assertEquals("Linha 1\nLinha 2\r\nLinha 3", result.rows().get(0).fields().get(1));
        assertEquals("Normal", result.rows().get(1).fields().get(1));
    }

    @Test
    @DisplayName("Deve ignorar linhas totalmente vazias")
    void shouldIgnoreCompletelyEmptyLines() {
        String csv = "\n\nheader1;header2\r\n\r\nval1;val2\n   \n\r\nval3;val4\n\n";
        ParsedCsv result = CsvImportParser.parse(csv.getBytes(StandardCharsets.UTF_8));

        assertEquals(2, result.rows().size());
        assertEquals(List.of("val1", "val2"), result.rows().get(0).fields());
        assertEquals(List.of("val3", "val4"), result.rows().get(1).fields());
    }

    @Test
    @DisplayName("Deve rastrear lineNumber físico inicial correto com linhas vazias e multilinhas")
    void shouldTrackPhysicalLineNumberWithMultilineAndEmptyLines() {
        // Linha 1: h1;h2
        // Linha 2: (vazia)
        // Linha 3: 1;"linha1
        // Linha 4: linha2
        // Linha 5: linha3";10
        // Linha 6: (vazia com espaços)
        // Linha 7: 2;normal;20
        String csv = "h1;h2\n\n1;\"linha1\nlinha2\nlinha3\";10\n   \n2;normal;20";
        ParsedCsv result = CsvImportParser.parse(csv.getBytes(StandardCharsets.UTF_8));

        assertEquals(2, result.rows().size());
        assertEquals(3, result.rows().get(0).lineNumber());
        assertEquals(7, result.rows().get(1).lineNumber());
    }

    @Test
    @DisplayName("Deve aplicar trim nos valores do cabeçalho e dos campos")
    void shouldTrimFieldValues() {
        String csv = "  col1  ;  col2  \n  valor1  ;  valor2  \n \" valor3 \" ; \"  valor4  \" ";
        ParsedCsv result = CsvImportParser.parse(csv.getBytes(StandardCharsets.UTF_8));

        assertEquals(List.of("col1", "col2"), result.header());
        assertEquals(List.of("valor1", "valor2"), result.rows().get(0).fields());
        assertEquals(List.of("valor3", "valor4"), result.rows().get(1).fields());
    }

    @Test
    @DisplayName("Deve aceitar registros com quantidade de campos diferente do cabeçalho")
    void shouldAcceptRowsWithDifferentFieldCountThanHeader() {
        String csv = "c1;c2;c3\n1;2\n1;2;3;4";
        ParsedCsv result = CsvImportParser.parse(csv.getBytes(StandardCharsets.UTF_8));

        assertEquals(3, result.header().size());
        assertEquals(2, result.rows().size());
        assertEquals(List.of("1", "2"), result.rows().get(0).fields());
        assertEquals(List.of("1", "2", "3", "4"), result.rows().get(1).fields());
    }

    @Test
    @DisplayName("Deve lançar exceção ao encontrar aspas sem fechamento informando a linha de início")
    void shouldThrowWhenQuotesAreUnclosed() {
        // Aspas abertas na linha 1 (cabeçalho) que nunca fecham
        String csvLine1 = "\"cabeçalho sem fechar;col2\n1;2";
        CsvImportException ex0 = assertThrows(CsvImportException.class, () ->
                CsvImportParser.parse(csvLine1.getBytes(StandardCharsets.UTF_8))
        );
        assertEquals("Aspas sem fechamento na linha 1", ex0.getMessage());

        // Aspas abertas na linha 2 que nunca fecham
        String csvLine2 = "h1;h2\n1;\"aberto sem fechar\nmais uma linha";
        CsvImportException ex1 = assertThrows(CsvImportException.class, () ->
                CsvImportParser.parse(csvLine2.getBytes(StandardCharsets.UTF_8))
        );
        assertEquals("Aspas sem fechamento na linha 2", ex1.getMessage());

        // Aspas abertas na linha 4 após linhas vazias
        String csvLine4 = "h1;h2\n1;2\n\n3;\"abriu aqui na 4 e acabou";
        CsvImportException ex2 = assertThrows(CsvImportException.class, () ->
                CsvImportParser.parse(csvLine4.getBytes(StandardCharsets.UTF_8))
        );
        assertEquals("Aspas sem fechamento na linha 4", ex2.getMessage());
    }

    @Test
    @DisplayName("Deve processar com sucesso exatamente 2.000 registros de dados (limite da fronteira)")
    void shouldAllowExactly2000DataRecords() {
        StringBuilder sb = new StringBuilder("h1;h2\n");
        for (int i = 1; i <= 2000; i++) {
            sb.append(i).append(";valor").append(i).append("\n");
        }
        ParsedCsv result = CsvImportParser.parse(sb.toString().getBytes(StandardCharsets.UTF_8));
        assertEquals(2000, result.rows().size());
        assertEquals(2001, result.rows().get(1999).lineNumber());
    }

    @Test
    @DisplayName("Deve lançar exceção ao ultrapassar 2.000 registros de dados (2.001 registros)")
    void shouldThrowWhenExceeding2000DataRecords() {
        StringBuilder sb = new StringBuilder("h1;h2\n");
        for (int i = 1; i <= 2001; i++) {
            sb.append(i).append(";valor").append(i).append("\n");
        }
        CsvImportException ex = assertThrows(CsvImportException.class, () ->
                CsvImportParser.parse(sb.toString().getBytes(StandardCharsets.UTF_8))
        );
        assertEquals("O arquivo excede 2.000 registros", ex.getMessage());
    }

    @Test
    @DisplayName("Deve permitir campo com exatamente 8 KiB (8192 bytes)")
    void shouldAllowFieldOfExactly8KiB() {
        String largeField = "a".repeat(8192);
        String csv = "h1;h2\n1;" + largeField;
        ParsedCsv result = CsvImportParser.parse(csv.getBytes(StandardCharsets.UTF_8));
        assertEquals(1, result.rows().size());
        assertEquals(8192, result.rows().get(0).fields().get(1).length());
    }

    @Test
    @DisplayName("Deve lançar exceção quando campo exceder 8 KiB citando a linha")
    void shouldThrowWhenFieldExceeds8KiB() {
        String excessiveField = "a".repeat(8193);
        String csv = "h1;h2\n1;" + excessiveField;
        CsvImportException ex = assertThrows(CsvImportException.class, () ->
                CsvImportParser.parse(csv.getBytes(StandardCharsets.UTF_8))
        );
        assertTrue(ex.getMessage().contains("linha 2"),
                "Mensagem deve citar a linha: " + ex.getMessage());
        assertTrue(ex.getMessage().contains("8 KiB") || ex.getMessage().contains("8192") || ex.getMessage().contains("8.192"),
                "Mensagem deve citar o limite de 8 KiB: " + ex.getMessage());
    }
}
