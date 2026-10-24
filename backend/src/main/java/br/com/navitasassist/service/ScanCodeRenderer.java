package br.com.navitasassist.service;

import java.util.Map;

import br.com.navitasassist.scan.ScanCodeFormat;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.oned.Code128Writer;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import org.springframework.stereotype.Component;

/**
 * Renders scan tokens as self-contained SVG (no scripts, links or external references) using ZXing for the encoding.
 */
@Component
public class ScanCodeRenderer {

    private static final int BARCODE_HEIGHT = 60;

    public BitMatrix matrix(String token, ScanCodeFormat format) {
        try {
            if (format == ScanCodeFormat.QR) {
                return new QRCodeWriter().encode(token, BarcodeFormat.QR_CODE, 0, 0, Map.of(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M, EncodeHintType.MARGIN, 2));
            }
            return new Code128Writer().encode(token, BarcodeFormat.CODE_128, 0, 1, Map.of(EncodeHintType.MARGIN, 10));
        } catch (WriterException exception) {
            throw new IllegalStateException("Scan code could not be encoded.", exception);
        }
    }

    public String svg(String token, ScanCodeFormat format) {
        BitMatrix matrix = matrix(token, format);
        boolean qr = format == ScanCodeFormat.QR;
        int width = matrix.getWidth();
        int height = qr ? matrix.getHeight() : BARCODE_HEIGHT;
        StringBuilder path = new StringBuilder();

        for (int y = 0; y < (qr ? matrix.getHeight() : 1); y++) {
            int x = 0;
            while (x < width) {
                if (!matrix.get(x, y)) {
                    x++;
                    continue;
                }
                int start = x;
                while (x < width && matrix.get(x, y)) {
                    x++;
                }
                path.append('M').append(start).append(' ').append(y).append('h').append(x - start).append('v').append(qr ? 1 : height).append('h').append(start - x).append('z');
            }
        }

        return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 " + width + " " + height + "\" shape-rendering=\"crispEdges\">"
            + "<rect width=\"100%\" height=\"100%\" fill=\"#ffffff\"/>"
            + "<path fill=\"#000000\" d=\"" + path + "\"/></svg>";
    }
}
