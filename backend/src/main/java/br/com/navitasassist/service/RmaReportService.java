package br.com.navitasassist.service;

import java.time.Instant;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaReportRequest;
import br.com.navitasassist.rma.RmaReportResponse;
import br.com.navitasassist.rma.RmaResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RmaReportService {
    private final RmaRecordRepository rmaRecordRepository;
    private final RmaSlaService rmaSlaService;

    public RmaReportResponse search(RmaReportRequest filters) {
        if (filters.entryFrom() != null && filters.entryTo() != null && filters.entryFrom().isAfter(filters.entryTo())) {
            throw new BusinessException("Entry start date must not be after end date.");
        }
        Instant generatedAt = Instant.now();
        var rmas = rmaRecordRepository.searchReport(filters.entryFrom(), filters.entryTo(), filters.status(), filters.clientId())
            .stream().map(rma -> RmaResponse.from(rma, rmaSlaService.calculate(rma, generatedAt))).toList();
        return new RmaReportResponse(generatedAt, rmas);
    }
}
