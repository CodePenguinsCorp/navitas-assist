package br.com.navitasassist.report;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Excel-friendly CSV: UTF-8 with BOM, {@code ;} separator and CRLF. Text cells starting with {@code = + - @}, tab or CR
 * get a leading apostrophe so spreadsheets do not run them as formulas; numbers written by the system use {@link #number}
 * or {@link #decimal} and are not touched.
 */
public final class CsvWriter {
    private static final byte[] BOM = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
    private final StringBuilder content = new StringBuilder();

    public CsvWriter row(Object... values) {
        for (int index = 0; index < values.length; index++) {
            if (index > 0) {
                content.append(';');
            }
            content.append(values[index] instanceof Raw raw ? raw.value() : cell(values[index] == null ? null : values[index].toString()));
        }
        content.append("\r\n");
        return this;
    }

    public byte[] toBytes() {
        byte[] text = content.toString().getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream output = new ByteArrayOutputStream(BOM.length + text.length);
        output.writeBytes(BOM);
        output.writeBytes(text);
        return output.toByteArray();
    }

    static String cell(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        String safe = "=+-@\t\r".indexOf(value.charAt(0)) >= 0 ? "'" + value : value;
        if (safe.indexOf(';') >= 0 || safe.indexOf('"') >= 0 || safe.indexOf('\n') >= 0 || safe.indexOf('\r') >= 0) {
            return '"' + safe.replace("\"", "\"\"") + '"';
        }
        return safe;
    }

    public static Raw number(long value) {
        return new Raw(Long.toString(value));
    }

    /** One decimal place with a comma, as Excel in pt-BR expects. */
    public static Raw decimal(double value) {
        return new Raw(String.format(Locale.ROOT, "%.1f", value).replace('.', ','));
    }

    public record Raw(String value) {}
}
