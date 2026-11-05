package br.com.navitasassist.custody;

import java.util.List;

public record RmaCustodyDetailResponse(
    RmaCustodyResponse current,
    List<CustodyMovementResponse> movements
) {
}
