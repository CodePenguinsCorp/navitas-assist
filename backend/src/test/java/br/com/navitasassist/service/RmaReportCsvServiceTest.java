package br.com.navitasassist.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDate;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.RmaReportRequest;
import org.junit.jupiter.api.Test;

class RmaReportCsvServiceTest {

    @Test
    void refusesExportsAboveTheRowLimitInsteadOfTruncating() {
        RmaRecordRepository repository = mock(RmaRecordRepository.class);
        when(repository.countReport(any(), any(), isNull(), isNull())).thenReturn((long) RmaReportCsvService.MAX_EXPORT_RMAS + 1);
        RmaReportCsvService service = new RmaReportCsvService(new RmaReportService(repository, mock(RmaStageTimeService.class)), repository);

        BusinessException error = assertThrows(BusinessException.class, () -> service.rmas(
            new RmaReportRequest(LocalDate.parse("2026-01-01"), LocalDate.parse("2026-12-31"), null, null, null, null)));

        assertEquals("Export is limited to 5000 RMAs. Narrow the period or the filters.", error.getMessage());
        verify(repository, never()).searchReport(any(), any(), any(), any());
    }
}
