package br.com.navitasassist.service;

import static br.com.navitasassist.support.RmaTestSupport.addItem;

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
    private static final String LIMIT_MESSAGE = "Reduza o período: o relatório passa de 5.000 ordens de serviço.";
    private final RmaRecordRepository repository = mock(RmaRecordRepository.class);
    private final RmaReportService reports = new RmaReportService(repository, mock(RmaStageTimeService.class));
    private final br.com.navitasassist.repository.PartUsageRepository usages = mock(br.com.navitasassist.repository.PartUsageRepository.class);
    private final RmaReportCsvService service = new RmaReportCsvService(reports, usages, mock(ExportStatementTimeout.class));
    private final RmaReportRequest year = new RmaReportRequest(LocalDate.parse("2026-01-01"), LocalDate.parse("2026-12-31"), null, null, null, null);

    private void aboveTheLimit() {
        when(repository.countReport(any(), any(), isNull(), isNull())).thenReturn((long) RmaReportService.MAX_REPORT_RMAS + 1);
    }

    @Test
    void exportsUsedPartsColumn() {
        when(repository.searchReport(any(), any(), any(), any())).thenReturn(java.util.List.of());
        String csv = new String(service.rmas(year).content(), java.nio.charset.StandardCharsets.UTF_8);
        org.junit.jupiter.api.Assertions.assertTrue(csv.contains("Peças usadas"), csv);
    }

    @Test
    void exportsUsedPartMetadataWithOneBatchQuery() {
        var client = new br.com.navitasassist.client.Client(); client.setLegalName("Cliente");
        var product = new br.com.navitasassist.product.Product(); product.setName("Produto"); product.setSku("SKU");
        var rma = new br.com.navitasassist.rma.RmaRecord(); rma.setId(7L); rma.setCode("OS-7");
        rma.setClient(client); addItem(rma, product); rma.setPurchaseDateUnknown(true);
        rma.setStatus(br.com.navitasassist.rma.RmaStatus.IN_REPAIR); rma.setEntryDate(year.entryFrom());
        var part = new br.com.navitasassist.part.Part(); part.setCode("P1"); part.setName("Capacitor"); part.setUnit("UN");
        var usage = new br.com.navitasassist.part.PartUsage(); usage.setRma(rma); usage.setPart(part);
        usage.setQuantity(new java.math.BigDecimal("2")); usage.setReplacementReason("Curto"); usage.setComponentBatch("L1");
        when(repository.searchReport(any(), any(), any(), any())).thenReturn(java.util.List.of(rma));
        when(usages.findByRma_IdInAndStatusOrderByIdAsc(java.util.List.of(7L), br.com.navitasassist.part.PartUsageStatus.USED))
            .thenReturn(java.util.List.of(usage));
        String csv = new String(service.rmas(year).content(), java.nio.charset.StandardCharsets.UTF_8);
        org.junit.jupiter.api.Assertions.assertTrue(csv.contains("Peça usada: Capacitor (código: P1), 2 UN. Motivo da troca: Curto. Lote: L1."), csv);
        verify(usages).findByRma_IdInAndStatusOrderByIdAsc(java.util.List.of(7L), br.com.navitasassist.part.PartUsageStatus.USED);
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
