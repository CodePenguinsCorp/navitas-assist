package br.com.navitasassist.scan;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import br.com.navitasassist.service.ScanCodeRenderer;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.common.HybridBinarizer;
import org.junit.jupiter.api.Test;

class ScanCodeRendererTest {

    private static final String TOKEN = "K7M2Q4XW7ZP3HTD6RVB5NCJ6LYG2FA4S";

    private final ScanCodeRenderer renderer = new ScanCodeRenderer();

    @Test
    void qrCodeDecodesBackToTheOpaqueToken() throws Exception {
        assertEquals(TOKEN, decode(renderer.matrix(TOKEN, ScanCodeFormat.QR), BarcodeFormat.QR_CODE));
    }

    @Test
    void barcodeDecodesBackToTheOpaqueToken() throws Exception {
        assertEquals(TOKEN, decode(renderer.matrix(TOKEN, ScanCodeFormat.BARCODE), BarcodeFormat.CODE_128));
    }

    @Test
    void svgIsSelfContainedAndHasNoLinks() {
        String svg = renderer.svg(TOKEN, ScanCodeFormat.QR);
        assertTrue(svg.startsWith("<svg"));
        assertTrue(svg.contains("shape-rendering=\"crispEdges\""));
        assertTrue(!svg.contains("href") && !svg.contains("http://www.w3.org/1999/xlink"));
    }

    private String decode(BitMatrix matrix, BarcodeFormat format) throws Exception {
        int scale = 4;
        int height = format == BarcodeFormat.CODE_128 ? 40 : matrix.getHeight() * scale;
        int width = matrix.getWidth() * scale;
        int[] pixels = new int[width * height];
        for (int y = 0; y < height; y++) {
            int row = format == BarcodeFormat.CODE_128 ? 0 : y / scale;
            for (int x = 0; x < width; x++) {
                pixels[y * width + x] = matrix.get(x / scale, row) ? 0xFF000000 : 0xFFFFFFFF;
            }
        }
        BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(width, height, pixels)));
        MultiFormatReader reader = new MultiFormatReader();
        reader.setHints(Map.of(DecodeHintType.POSSIBLE_FORMATS, java.util.List.of(format), DecodeHintType.TRY_HARDER, Boolean.TRUE));
        return reader.decode(bitmap).getText();
    }
}
