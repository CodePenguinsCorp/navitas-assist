package br.com.navitasassist.catalogimport;

import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class CsvImportParser {

    private static final int MAX_ROWS = 2000;
    private static final int MAX_FIELD_BYTES = 8192; // 8 KiB

    private CsvImportParser() {
    }

    public record ParsedCsv(char delimiter, List<String> header, List<ParsedRow> rows) {
    }

    public record ParsedRow(int lineNumber, List<String> fields) {
    }

    public static class CsvImportException extends RuntimeException {
        public CsvImportException(String message) {
            super(message);
        }

        public CsvImportException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    public static ParsedCsv parse(byte[] content) {
        if (content == null) {
            throw new CsvImportException("Arquivo deve estar em UTF-8");
        }

        int offset = 0;
        int length = content.length;

        // Verifica BOM UTF-16 BE / LE
        if (length >= 2) {
            if ((content[0] == (byte) 0xFE && content[1] == (byte) 0xFF) ||
                (content[0] == (byte) 0xFF && content[1] == (byte) 0xFE)) {
                throw new CsvImportException("Arquivo deve estar em UTF-8");
            }
        }

        // Verifica BOM UTF-8 (EF BB BF)
        if (length >= 3 &&
            content[0] == (byte) 0xEF &&
            content[1] == (byte) 0xBB &&
            content[2] == (byte) 0xBF) {
            offset = 3;
            length -= 3;
        }

        CharsetDecoder decoder = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);

        CharBuffer charBuffer;
        try {
            charBuffer = decoder.decode(ByteBuffer.wrap(content, offset, length));
        } catch (CharacterCodingException e) {
            throw new CsvImportException("Arquivo deve estar em UTF-8", e);
        }

        String text = charBuffer.toString();
        if (text.indexOf('\0') >= 0) {
            throw new CsvImportException("Arquivo deve estar em UTF-8");
        }

        char delimiter = detectDelimiter(text);

        return parseContent(text, delimiter);
    }

    private static char detectDelimiter(String text) {
        int len = text.length();
        int i = 0;
        int currentLine = 1;

        // Pula linhas totalmente vazias antes do cabeçalho
        while (i < len) {
            int lineStart = i;
            boolean onlyWhitespace = true;
            while (i < len && text.charAt(i) != '\n' && text.charAt(i) != '\r') {
                if (!Character.isWhitespace(text.charAt(i))) {
                    onlyWhitespace = false;
                }
                i++;
            }
            if (onlyWhitespace) {
                if (i < len && text.charAt(i) == '\r') {
                    i++;
                }
                if (i < len && text.charAt(i) == '\n') {
                    i++;
                }
                currentLine++;
            } else {
                i = lineStart;
                break;
            }
        }

        if (i >= len) {
            throw new CsvImportException("Não foi possível identificar o separador");
        }

        int commaCount = 0;
        int semicolonCount = 0;
        boolean inQuotes = false;
        int quoteStartLine = currentLine;

        while (i < len) {
            char c = text.charAt(i);
            if (c == '"') {
                if (inQuotes) {
                    if (i + 1 < len && text.charAt(i + 1) == '"') {
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    inQuotes = true;
                    quoteStartLine = currentLine;
                }
            } else if (c == '\r' || c == '\n') {
                if (c == '\r' && i + 1 < len && text.charAt(i + 1) == '\n') {
                    i++;
                }
                currentLine++;
                if (!inQuotes) {
                    break;
                }
            } else if (!inQuotes) {
                if (c == ',') {
                    commaCount++;
                } else if (c == ';') {
                    semicolonCount++;
                }
            }
            i++;
        }

        if (inQuotes) {
            throw new CsvImportException("Aspas sem fechamento na linha " + quoteStartLine);
        }

        if ((commaCount > 0 && semicolonCount > 0) || (commaCount == 0 && semicolonCount == 0)) {
            throw new CsvImportException("Não foi possível identificar o separador");
        }

        return commaCount > 0 ? ',' : ';';
    }

    private static ParsedCsv parseContent(String text, char delimiter) {
        int len = text.length();
        int currentLine = 1;
        int recordStartLine = 1;
        boolean inQuotes = false;
        int quoteStartLine = 1;
        boolean seenDelimiterInRecord = false;

        List<String> header = null;
        List<ParsedRow> rows = new ArrayList<>();
        List<String> currentFields = new ArrayList<>();
        StringBuilder fieldBuilder = new StringBuilder();

        int i = 0;
        while (i < len) {
            char c = text.charAt(i);

            if (c == '"') {
                if (inQuotes) {
                    if (i + 1 < len && text.charAt(i + 1) == '"') {
                        fieldBuilder.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    if (fieldBuilder.toString().isBlank()) {
                        fieldBuilder.setLength(0);
                        inQuotes = true;
                        quoteStartLine = currentLine;
                    } else {
                        fieldBuilder.append('"');
                    }
                }
            } else if (c == delimiter) {
                if (inQuotes) {
                    fieldBuilder.append(c);
                } else {
                    seenDelimiterInRecord = true;
                    String val = fieldBuilder.toString().trim();
                    checkFieldSize(val, recordStartLine);
                    currentFields.add(val);
                    fieldBuilder.setLength(0);
                }
            } else if (c == '\r' || c == '\n') {
                String newlineStr = "\n";
                if (c == '\r') {
                    if (i + 1 < len && text.charAt(i + 1) == '\n') {
                        i++;
                        newlineStr = "\r\n";
                    } else {
                        newlineStr = "\r";
                    }
                }
                currentLine++;

                if (inQuotes) {
                    fieldBuilder.append(newlineStr);
                } else {
                    String val = fieldBuilder.toString().trim();
                    checkFieldSize(val, recordStartLine);
                    currentFields.add(val);
                    fieldBuilder.setLength(0);

                    if (!isLineEmpty(currentFields, seenDelimiterInRecord)) {
                        if (header == null) {
                            header = List.copyOf(currentFields);
                        } else {
                            rows.add(new ParsedRow(recordStartLine, List.copyOf(currentFields)));
                            if (rows.size() > MAX_ROWS) {
                                throw new CsvImportException("O arquivo excede 2.000 registros");
                            }
                        }
                    }

                    currentFields.clear();
                    seenDelimiterInRecord = false;
                    recordStartLine = currentLine;
                }
            } else {
                fieldBuilder.append(c);
            }

            i++;
        }

        if (inQuotes) {
            throw new CsvImportException("Aspas sem fechamento na linha " + quoteStartLine);
        }

        if (!currentFields.isEmpty() || fieldBuilder.length() > 0 || seenDelimiterInRecord) {
            String val = fieldBuilder.toString().trim();
            checkFieldSize(val, recordStartLine);
            currentFields.add(val);
            if (!isLineEmpty(currentFields, seenDelimiterInRecord)) {
                if (header == null) {
                    header = List.copyOf(currentFields);
                } else {
                    rows.add(new ParsedRow(recordStartLine, List.copyOf(currentFields)));
                    if (rows.size() > MAX_ROWS) {
                        throw new CsvImportException("O arquivo excede 2.000 registros");
                    }
                }
            }
        }

        if (header == null) {
            throw new CsvImportException("Não foi possível identificar o separador");
        }

        return new ParsedCsv(delimiter, header, Collections.unmodifiableList(rows));
    }

    private static boolean isLineEmpty(List<String> fields, boolean seenDelimiter) {
        if (seenDelimiter) {
            return false;
        }
        return fields.size() == 1 && fields.get(0).isEmpty();
    }

    private static void checkFieldSize(String val, int lineNumber) {
        if (val.getBytes(StandardCharsets.UTF_8).length > MAX_FIELD_BYTES) {
            throw new CsvImportException("Campo excede o limite de 8 KiB na linha " + lineNumber);
        }
    }
}
