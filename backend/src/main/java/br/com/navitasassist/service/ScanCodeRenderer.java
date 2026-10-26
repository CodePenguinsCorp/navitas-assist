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

    /**
     * Printable width of the barcode on the 100 x 50 mm label: 100 mm minus 3 mm padding on each side. The barcode spans
     * this full width, so module width = 94 mm / total modules (quiet zones included).
     */
    public static final double LABEL_BARCODE_WIDTH_MM = 94.0;

    /**
     * Minimum module width accepted for the printed Code 128 (about 2.6 dots at 203 dpi).
     */
    public static final double MIN_BARCODE_MODULE_MM = 0.33;

    public BitMatrix matrix(String token, ScanCodeFormat format) {
        try {
            if (format == ScanCodeFormat.QR) {
                return new QRCodeWriter().encode(token, BarcodeFormat.QR_CODE, 0, 0, Map.of(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M, EncodeHintType.MARGIN, 2));
            }
            // For 1D codes ZXing's MARGIN is the total of both sides: 20 gives the 10-module quiet zone Code 128 requires per side.
            return new Code128Writer().encode(token, BarcodeFormat.CODE_128, 0, 1, Map.of(EncodeHintType.MARGIN, 20));
        } catch (WriterException exception) {
            throw new IllegalStateException("Scan code could not be encoded.", exception);
        }
    }

    /**
     * Module width the printed barcode will have on the label. With the 24-digit barcode token, Code 128 set C encodes two
     * digits per symbol: (12 + start + check) x 11 + stop 13 = 167 modules, plus 2 x 10 quiet zone = 187 modules, i.e.
     * 94 / 187 = 0.50 mm per module.
     */
    public double barcodeModuleWidthMm(String barcodeToken) {
        return LABEL_BARCODE_WIDTH_MM / matrix(barcodeToken, ScanCodeFormat.BARCODE).getWidth();
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
