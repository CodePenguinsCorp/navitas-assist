package br.com.navitasassist.controller;

import java.util.List;

import br.com.navitasassist.custody.CustodyFlag;
import br.com.navitasassist.custody.CustodyMovementRequest;
import br.com.navitasassist.custody.CustodySummaryResponse;
import br.com.navitasassist.custody.RmaCustodyDetailResponse;
import br.com.navitasassist.custody.RmaCustodyResponse;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.service.CustodyService;
import br.com.navitasassist.user.AssignableUserResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/custody")
@RequiredArgsConstructor
public class CustodyController {

    private final CustodyService custodyService;

    @GetMapping
    public PageResponse<RmaCustodyResponse> search(
        @RequestParam(required = false) Long locationId,
        @RequestParam(required = false) CustodyFlag flag,
        @RequestParam(required = false) String query,
        @RequestParam(required = false) Integer page,
        @RequestParam(required = false) Integer size
    ) {
        return custodyService.search(locationId, flag, query, page, size);
    }

    @GetMapping("/summary")
    public CustodySummaryResponse summarize(@RequestParam(required = false) Long locationId) {
        return custodyService.summarize(locationId);
    }

    @GetMapping("/custodians")
    public List<AssignableUserResponse> listCustodians() {
        return custodyService.listCustodians();
    }

    @GetMapping("/rmas/{rmaId}")
    public RmaCustodyDetailResponse getDetail(@PathVariable Long rmaId) {
        return custodyService.getDetail(rmaId);
    }

    @PostMapping("/rmas/{rmaId}/movements")
    @ResponseStatus(HttpStatus.CREATED)
    public RmaCustodyDetailResponse move(@PathVariable Long rmaId, @Valid @RequestBody CustodyMovementRequest request) {
        return custodyService.move(rmaId, request);
    }
}
