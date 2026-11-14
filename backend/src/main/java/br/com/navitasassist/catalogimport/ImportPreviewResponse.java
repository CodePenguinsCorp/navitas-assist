package br.com.navitasassist.catalogimport;

import java.util.List;
import java.util.Map;

public record ImportPreviewResponse(String fileName, String delimiter, int totalRows, int validRows, int invalidRows,
        int duplicateRows, int blankRows, List<Row> rows) {
    public record Issue(String field, String code, String message) {}
    public record Row(int lineNumber, String status, Map<String, Object> values, List<Issue> reasons, List<Issue> warnings) {}
}
