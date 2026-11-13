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
    private static final String LIMIT_MESSAGE = "Reduza o período: o relatório passa de 5.000 RMAs.";
    private final RmaRecordRepository repository = mock(RmaRecordRepository.class);
    private final RmaReportService reports = new RmaReportService(repository, mock(RmaStageTimeService.class));
    private final RmaReportCsvService service = new RmaReportCsvService(reports, repository);
    private final RmaReportRequest year = new RmaReportRequest(LocalDate.parse("2026-01-01"), LocalDate.parse("2026-12-31"), null, null, null, null);

    private void aboveTheLimit() {
        when(repository.countReport(any(), any(), isNull(), isNull())).thenReturn((long) RmaReportService.MAX_REPORT_RMAS + 1);
    }

    @Test
    void refusesExportsAboveTheRowLimitInsteadOfTruncating() {
        aboveTheLimit();
        BusinessException error = assertThrows(BusinessException.class, () -> service.rmas(year));
        assertEquals(LIMIT_MESSAGE, error.getMessage());
        verify(repository, never()).searchReport(any(), any(), any(), any());
    }

    @Test
    void refusesTheSummaryAboveTheSameLimitBeforeLoadingRmas() {
        aboveTheLimit();
        BusinessException error = assertThrows(BusinessException.class, () -> reports.summary(year));
        assertEquals(LIMIT_MESSAGE, error.getMessage());
        assertEquals(LIMIT_MESSAGE, assertThrows(BusinessException.class, () -> service.summary(year)).getMessage());
        verify(repository, never()).searchReport(any(), any(), any(), any());
        verify(repository, never()).findRecurrentSerials(any(), any());
    }
}
