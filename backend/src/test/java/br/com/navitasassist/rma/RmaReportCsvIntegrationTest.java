package br.com.navitasassist.rma;

import static br.com.navitasassist.access.AccessTestSupport.asProfile;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.diagnosis.Diagnosis;
import br.com.navitasassist.diagnosis.FailureType;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
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
class RmaReportCsvIntegrationTest {
    @Autowired private MockMvc mockMvc;
    @Autowired private RmaRecordRepository rmas;
    @Autowired private ClientRepository clients;
    @Autowired private ProductRepository products;
    private Client client;
    private Product product;

    @BeforeEach
    void setUp() {
        rmas.deleteAll();
        products.deleteAll();
        clients.deleteAll();
        client = new Client();
        client.setLegalName("=Cliente; \"Alfa\"");
        clients.save(client);
        product = new Product();
        product.setSku("CTRL-1");
        product.setName("Controlador");
        products.save(product);
    }

    @Test
    void exportsOneLinePerItemWithBomSemicolonsAndNeutralizedText() throws Exception {
        RmaRecord rma = new RmaRecord();
        rma.setCode("RMA-1");
        rma.setClient(client);
        rma.setProduct(product);
        rma.setEntryDate(LocalDate.parse("2026-10-05"));
        rma.setPurchaseDateUnknown(true);
        rma.setReceivedBy("admin");
        rma.setReportedFailure("Não liga\nàs vezes");
        rma.setStatus(RmaStatus.IN_DIAGNOSIS);
        RmaItem first = new RmaItem();
        first.setProduct(product);
        first.getItemIdentification().setSerialNumber("S1");
        first.getItemIdentification().setBatchNumber("L1");
        RmaItem second = new RmaItem();
        second.setProduct(product);
        second.getItemIdentification().setSerialNumber("-S2");
        rma.replaceItems(List.of(first, second));
        Diagnosis diagnosis = new Diagnosis();
        diagnosis.setFoundFailure("Conector danificado");
        diagnosis.setFailureType(FailureType.COMMUNICATION);
        diagnosis.setDiagnosedAt(LocalDate.parse("2026-10-06"));
        diagnosis.setTechnicianName("Técnico");
        rma.setDiagnosis(diagnosis);
        rmas.saveAndFlush(rma);

        byte[] body = mockMvc.perform(get("/api/reports/rmas/export.csv").param("entryFrom", "2026-10-01").param("entryTo", "2026-10-31")
                .with(asProfile("viewer", "VIEWER")))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type", "text/csv;charset=UTF-8"))
            .andExpect(header().string("Content-Disposition", "attachment; filename=\"rmas-2026-10-01-a-2026-10-31.csv\""))
            .andReturn().getResponse().getContentAsByteArray();

        assertEquals((byte) 0xEF, body[0]);
        String[] lines = new String(body, 3, body.length - 3, StandardCharsets.UTF_8).split("\r\n");
        assertEquals("Código;Entrada;Status;Cliente;Produto;SKU;Lote;Série;Garantia;Ajuste manual de garantia;Falha relatada;"
            + "Falha encontrada;Tipo de falha;Causa provável;Responsável;Expedição", lines[0]);
        assertEquals("RMA-1;05/10/2026;Diagnóstico;\"'=Cliente; \"\"Alfa\"\"\";Controlador;CTRL-1;L1;S1;Pendente;Não;\"Não liga\nàs vezes\";"
            + "Conector danificado;Comunicação;;;", lines[1]);
        assertTrue(lines[2].contains(";'-S2;"), lines[2]);
        assertEquals(3, lines.length);
    }

    @Test
    void exportsTheSummaryAsALongTable() throws Exception {
        RmaRecord rma = new RmaRecord();
        rma.setCode("RMA-1");
        rma.setClient(client);
        rma.setProduct(product);
        rma.setEntryDate(LocalDate.parse("2026-10-05"));
        rma.setPurchaseDateUnknown(true);
        rma.setReceivedBy("admin");
        rma.setReportedFailure("Não liga");
        rma.setStatus(RmaStatus.RECEIVED);
        rmas.saveAndFlush(rma);

        byte[] body = mockMvc.perform(get("/api/reports/rmas/summary/export.csv").param("entryFrom", "2026-10-01").param("entryTo", "2026-10-31")
                .with(asProfile("tech", "TECHNICIAN")))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Disposition", "attachment; filename=\"resumo-rmas-2026-10-01-a-2026-10-31.csv\""))
            .andReturn().getResponse().getContentAsByteArray();
        String text = new String(body, 3, body.length - 3, StandardCharsets.UTF_8);

        assertTrue(text.startsWith("Seção;Item;Quantidade;Base;Percentual;Tempo médio (h);Maior tempo (h)\r\n"), text);
        assertTrue(text.contains("Total;RMAs;1;;;;\r\n"), text);
        assertTrue(text.contains("Status;Recebido;1;1;100,0;;\r\n"), text);
        assertTrue(text.contains("Garantia;Pendente;1;1;100,0;;\r\n"), text);
        assertTrue(text.contains("Mês de entrada;10/2026;1;;;;\r\n"), text);
        assertTrue(text.contains("Top falhas por produto;Controlador (CTRL-1);1;;;;\r\n"), text);
    }

    @Test
    void requiresTheReportPermission() throws Exception {
        mockMvc.perform(get("/api/reports/rmas/export.csv")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/reports/rmas/export.csv").with(asProfile("desk", "SERVICE_DESK"))).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/reports/rmas/summary/export.csv").with(asProfile("desk", "SERVICE_DESK"))).andExpect(status().isForbidden());
    }
}
