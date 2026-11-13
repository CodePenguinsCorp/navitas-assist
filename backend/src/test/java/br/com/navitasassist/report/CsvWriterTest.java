package br.com.navitasassist.report;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

import org.junit.jupiter.api.Test;

class CsvWriterTest {

    @Test
    void startsWithUtf8BomAndUsesSemicolonAndCrLf() {
        CsvWriter csv = new CsvWriter();
        csv.row("Código", "Situação");
        csv.row("RMA-1", "Em garantia");
        byte[] bytes = csv.toBytes();

        assertArrayEquals(new byte[] {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF}, Arrays.copyOf(bytes, 3));
        assertEquals("Código;Situação\r\nRMA-1;Em garantia\r\n", new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8));
    }

    @Test
    void quotesSeparatorsQuotesAndLineBreaks() {
        assertEquals("\"a;b\"", CsvWriter.cell("a;b"));
        assertEquals("\"diz \"\"oi\"\"\"", CsvWriter.cell("diz \"oi\""));
        assertEquals("\"linha 1\nlinha 2\"", CsvWriter.cell("linha 1\nlinha 2"));
        assertEquals("", CsvWriter.cell(null));
    }

    @Test
    void neutralizesFormulaPrefixes() {
        assertEquals("'=1+1", CsvWriter.cell("=1+1"));
        assertEquals("'+55 11", CsvWriter.cell("+55 11"));
        assertEquals("'-2", CsvWriter.cell("-2"));
        assertEquals("'@SUM(A1)", CsvWriter.cell("@SUM(A1)"));
        assertEquals("'\tx", CsvWriter.cell("\tx"));
        assertEquals("\"'\rx\"", CsvWriter.cell("\rx"));
        assertEquals("\"'=A1;B1\"", CsvWriter.cell("=A1;B1"));
        assertEquals("a=b", CsvWriter.cell("a=b"));
    }

    @Test
    void writesSystemNumbersWithoutNeutralizingThem() {
        CsvWriter csv = new CsvWriter();
        csv.row(CsvWriter.number(-3), CsvWriter.decimal(12.5), "x");
        String text = new String(csv.toBytes(), StandardCharsets.UTF_8).substring(1);
        assertEquals("-3;12,5;x\r\n", text);
    }
}
