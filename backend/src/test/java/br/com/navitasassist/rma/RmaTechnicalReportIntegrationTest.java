package br.com.navitasassist.rma;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.diagnosis.Diagnosis;
import br.com.navitasassist.diagnosis.FailureCause;
import br.com.navitasassist.diagnosis.FailureType;
import br.com.navitasassist.part.Part;
import br.com.navitasassist.part.PartReservation;
import br.com.navitasassist.part.PartReservationStatus;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.PartRepository;
import br.com.navitasassist.repository.PartReservationRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class RmaTechnicalReportIntegrationTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private RmaRecordRepository rmas;
    @Autowired private ClientRepository clients;
    @Autowired private ProductRepository products;
    @Autowired private PartRepository parts;
    @Autowired private PartReservationRepository reservations;
    @Autowired private br.com.navitasassist.repository.RmaExternalComponentRepository externalComponents;
    @Autowired private br.com.navitasassist.repository.RmaInterventionRepository interventions;
    private RmaRecord rma;

    @BeforeEach
    void setUp() {
        reservations.deleteAll();
        rmas.deleteAll();
        Client client = new Client();
        client.setLegalName("Cliente Ação Ltda");
        clients.save(client);
        Product product = new Product();
        product.setSku("CTRL-LAUDO");
        product.setName("Controlador térmico");
        products.save(product);

        rma = new RmaRecord();
        rma.setCode("RMA-2026/0001");
        rma.setClient(client);
        rma.setProduct(product);
        rma.setEntryDate(LocalDate.parse("2026-10-05"));
        rma.setPurchaseDateUnknown(true);
        rma.setReceivedBy("admin");
        rma.setReportedFailure("Não liga após queda de energia");
        rma.setPhysicalCondition("Carcaça riscada");
        rma.setReceivedAccessories("Fonte original");
        rma.setRepairSummary("Substituição do regulador");
        rma.setReplacedPartsSummary("Regulador 5V");
        rma.setTestSummary("Teste de bancada aprovado");
        rma.setStatus(RmaStatus.COMPLETED);
        RmaItem item = new RmaItem();
        item.setProduct(product);
        item.getItemIdentification().setSerialNumber("SN-123");
        item.getItemIdentification().setBatchNumber("LOTE-9");
        rma.replaceItems(List.of(item));
        Diagnosis diagnosis = new Diagnosis();
        diagnosis.setFoundFailure("Regulador queimado");
        diagnosis.setFailureType(FailureType.POWER_SUPPLY);
        diagnosis.setProbableCause(FailureCause.OVERLOAD);
        diagnosis.setDiagnosedAt(LocalDate.parse("2026-10-06"));
        diagnosis.setTechnicianName("João Técnico");
        rma.setDiagnosis(diagnosis);
        rmas.saveAndFlush(rma);

        reserve(part("REG-5V", "Regulador de tensão", "12.50"), "2", PartReservationStatus.CONSUMED);
        reserve(part("CAP-10", "Capacitor cancelado", "1.00"), "1", PartReservationStatus.CANCELLED);
    }

    @Test
    void downloadsTheFinalReportAsPdfWithTheRmaData() throws Exception {
        byte[] pdf = mockMvc.perform(get("/api/rmas/{id}/report.pdf", rma.getId()).with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type", "application/pdf"))
            .andExpect(header().string("Content-Disposition", "attachment; filename=\"laudo-RMA-2026-0001.pdf\""))
            .andReturn().getResponse().getContentAsByteArray();

        String text = text(pdf);
        for (String expected : List.of("Laudo técnico", "RMA-2026/0001", "Cliente Ação Ltda", "Controlador térmico", "CTRL-LAUDO", "LOTE-9",
            "SN-123", "Pendente", "Não liga após queda de energia", "Regulador queimado", "Fonte", "Sobrecarga", "João Técnico",
            "Substituição do regulador", "Teste de bancada aprovado", "Regulador 5V", "REG-5V", "Regulador de tensão", "Carcaça riscada",
            "Fonte original", "Concluído", "Motivo não registrado", "Intervenções", "Total de horas")) {
            assertTrue(text.contains(expected), "PDF sem \"" + expected + "\":\n" + text);
        }
        assertFalse(text.contains("Capacitor cancelado"), text);
        assertFalse(text.contains("12,50") || text.contains("25,00"), "O laudo não mostra custo");
    }

    @Test
    void includesStructuredComponentsAndInterventionsWithHours() throws Exception {
        PartReservation consumed = reservations.findByRma_IdOrderByIdAsc(rma.getId()).get(0);
        consumed.setReplacementReason("Curto na alimentação"); consumed.setComponentBatch("REG-LOTE");
        consumed.setAppliedAt(java.time.Instant.now()); consumed.setAppliedBy("maria"); reservations.saveAndFlush(consumed);
        RmaExternalComponent component = new RmaExternalComponent();
        component.setRma(rma); component.setCode("EXT-9"); component.setDescription("Conector externo"); component.setQuantity(new BigDecimal("1.125"));
        component.setUnit("un"); component.setComponentBatch("EXT-LOTE"); component.setReplacementReason("Oxidação dos contatos");
        component.setAppliedAt(java.time.Instant.now()); component.setAppliedBy("maria"); externalComponents.saveAndFlush(component);
        RmaIntervention intervention = new RmaIntervention();
        intervention.setRma(rma); intervention.setType(InterventionType.RESOLDERING); intervention.setDescription("Ressolda do circuito");
        intervention.setPerformedOn(LocalDate.parse("2026-10-07")); intervention.setHours(new BigDecimal("1.125")); intervention.setTechnicianName("maria"); interventions.saveAndFlush(intervention);
        String report = text(mockMvc.perform(get("/api/rmas/{id}/report.pdf", rma.getId()).with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray());
        for (String expected : List.of("Curto na alimentação", "REG-LOTE", "Conector externo", "EXT-9", "EXT-LOTE", "Oxidação dos contatos", "Ressolda", "Ressolda do circuito", "1,125", "maria", "07/10/2026")) {
            assertTrue(report.contains(expected), "PDF sem " + expected + ": " + report);
        }
    }

    @Test
    void returnsNotFoundAndRequiresRmaView() throws Exception {
        mockMvc.perform(get("/api/rmas/{id}/report.pdf", 999999).with(asProfile("admin", "ADMIN"))).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/rmas/{id}/report.pdf", rma.getId())).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/rmas/{id}/report.pdf", rma.getId()).with(user("nobody").authorities(List.of())))
            .andExpect(status().isForbidden());
    }

    private Part part(String code, String name, String cost) {
        Part part = new Part();
        part.setCode(code);
        part.setName(name);
        part.setUnit("un");
        part.setUnitCost(new BigDecimal(cost));
        return parts.save(part);
    }

    private void reserve(Part part, String quantity, PartReservationStatus status) {
        PartReservation reservation = new PartReservation();
        reservation.setPart(part);
        reservation.setRma(rma);
        reservation.setQuantity(new BigDecimal(quantity));
        reservation.setStatus(status);
        reservations.saveAndFlush(reservation);
    }

    private static String text(byte[] pdf) throws Exception {
        PdfReader reader = new PdfReader(pdf);
        try {
            PdfTextExtractor extractor = new PdfTextExtractor(reader);
            StringBuilder text = new StringBuilder();
            for (int page = 1; page <= reader.getNumberOfPages(); page++) {
                text.append(extractor.getTextFromPage(page)).append('\n');
            }
            return text.toString();
        } finally {
            reader.close();
        }
    }
}
