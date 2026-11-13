package br.com.navitasassist.catalogimport;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CsvImportSafetyTest {
    @Test void acceptsRequiredOnlyClientHeader() {
        assertEquals(1, parse("razao_social\nEmpresa").rows().size());
    }
    @Test void countsBlankRecordsSeparately() {
        assertEquals(1, parse("razao_social;email\n\nEmpresa;\n").blankRows());
    }
    @Test void rejectsTextAfterClosingQuote() {
        assertThrows(CsvImportParser.CsvImportException.class, () -> parse("razao_social;email\n\"Empresa\"texto;"));
    }
    @Test void rejectsOversizedDecodedRecord() {
        assertThrows(CsvImportParser.CsvImportException.class, () -> parse("a;b;c\n" + "x".repeat(6000) + ";" + "x".repeat(6000) + ";" + "x".repeat(6000)));
    }
    @Test void fieldLimitAppliesBeforeTrimming() {
        assertThrows(CsvImportParser.CsvImportException.class, () -> parse("razao_social;email\n" + " ".repeat(8193) + ";"));
    }
    @Test void recordLimitAppliesBeforeTrimming() {
        assertThrows(CsvImportParser.CsvImportException.class, () -> parse("a;b;c\n" + (" ".repeat(5999) + "x;").repeat(3)));
    }
    @Test void blankRecordsDoNotConsumeDataRowLimit() {
        assertEquals(2000, parse("a;b\n\n" + "A;B\n".repeat(2000)).rows().size());
    }
    private CsvImportParser.ParsedCsv parse(String csv) { return CsvImportParser.parse(csv.getBytes(StandardCharsets.UTF_8)); }
}
