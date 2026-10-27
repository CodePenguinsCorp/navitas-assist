package br.com.navitasassist.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import br.com.navitasassist.client.Client;
import br.com.navitasassist.diagnosis.Diagnosis;
import br.com.navitasassist.diagnosis.FailureCause;
import br.com.navitasassist.diagnosis.FailureType;
import br.com.navitasassist.kanban.KanbanView;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.rma.RmaPriority;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.rma.RmaStatusHistory;
import br.com.navitasassist.rma.WarrantyStatus;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class EnumPersistenceIntegrationTest {

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private Long userId;
    private Long rmaId;
    private Long viewId;
    private Long diagnosisId;
    private Long historyId;

    @BeforeEach
    void prepareRecords() {
        String suffix = UUID.randomUUID().toString();
        UserAccount owner = new UserAccount();
        owner.setUsername("enum-" + suffix);
        owner.setFullName("Enum persistence");
        owner.setPasswordHash("unused-test-password-hash");
        owner.setRole(UserRole.VIEWER);
        entityManager.persist(owner);
        userId = owner.getId();

        Client client = new Client();
        client.setLegalName("Enum persistence");
        entityManager.persist(client);
        Product product = new Product();
        product.setSku("enum-" + suffix);
        product.setName("Enum persistence");
        entityManager.persist(product);

        RmaRecord rma = new RmaRecord();
        rma.setCode(suffix.substring(0, 20));
        rma.setClient(client);
        rma.setProduct(product);
        rma.getItemIdentification().setSerialNumber(suffix);
        rma.setEntryDate(LocalDate.of(2026, 10, 27));
        rma.setPurchaseDateUnknown(true);
        rma.setReceivedBy("Enum persistence");
        rma.setReportedFailure("Enum persistence");
        entityManager.persist(rma);
        rmaId = rma.getId();

        Diagnosis diagnosis = new Diagnosis();
        diagnosis.setRma(rma);
        diagnosis.setFoundFailure("Enum persistence");
        diagnosis.setDiagnosedAt(rma.getEntryDate());
        diagnosis.setTechnicianName("Enum persistence");
        entityManager.persist(diagnosis);
        diagnosisId = diagnosis.getId();

        KanbanView view = new KanbanView();
        view.setOwner(owner);
        view.setName("Enum persistence");
        entityManager.persist(view);
        viewId = view.getId();

        RmaStatusHistory history = new RmaStatusHistory();
        history.setRma(rma);
        history.setStatus(RmaStatus.RECEIVED);
        history.setChangedBy("Enum persistence");
        history.setChangedAt(Instant.parse("2026-10-27T12:00:00Z"));
        entityManager.persist(history);
        historyId = history.getId();
        flushAndClear();
    }

    @Test
    void shouldStoreEveryRoleAsItsName() {
        for (UserRole role : UserRole.values()) {
            entityManager.find(UserAccount.class, userId).setRole(role);
            flushAndClear();
            assertThat(entityManager.find(UserAccount.class, userId).getRole()).isEqualTo(role);
            assertThat(column("user_accounts", "role", userId)).isEqualTo(role.name());
        }
    }

    @Test
    void shouldStoreEveryPriorityInRmasAndViewsAsItsName() {
        for (RmaPriority priority : RmaPriority.values()) {
            entityManager.find(RmaRecord.class, rmaId).setPriority(priority);
            entityManager.find(KanbanView.class, viewId).setPriority(priority);
            flushAndClear();
            assertThat(entityManager.find(RmaRecord.class, rmaId).getPriority()).isEqualTo(priority);
            assertThat(entityManager.find(KanbanView.class, viewId).getPriority()).isEqualTo(priority);
            assertThat(column("rmas", "priority", rmaId)).isEqualTo(priority.name());
            assertThat(column("kanban_views", "priority", viewId)).isEqualTo(priority.name());
        }
    }

    @Test
    void shouldStoreEveryStatusInRmasViewsAndHistoryAsItsName() {
        for (RmaStatus status : RmaStatus.values()) {
            entityManager.find(RmaRecord.class, rmaId).setStatus(status);
            entityManager.find(KanbanView.class, viewId).setStatus(status);
            entityManager.find(RmaStatusHistory.class, historyId).setStatus(status);
            flushAndClear();
            assertThat(entityManager.find(RmaRecord.class, rmaId).getStatus()).isEqualTo(status);
            assertThat(entityManager.find(KanbanView.class, viewId).getStatus()).isEqualTo(status);
            assertThat(entityManager.find(RmaStatusHistory.class, historyId).getStatus()).isEqualTo(status);
            assertThat(column("rmas", "status", rmaId)).isEqualTo(status.name());
            assertThat(column("kanban_views", "status", viewId)).isEqualTo(status.name());
            assertThat(column("rma_status_history", "status", historyId)).isEqualTo(status.name());
        }
    }

    @Test
    void shouldStoreEveryWarrantyStatusAsItsName() {
        for (WarrantyStatus warranty : WarrantyStatus.values()) {
            entityManager.find(KanbanView.class, viewId).setWarranty(warranty);
            flushAndClear();
            assertThat(entityManager.find(KanbanView.class, viewId).getWarranty()).isEqualTo(warranty);
            assertThat(column("kanban_views", "warranty_status", viewId)).isEqualTo(warranty.name());
        }
    }

    @Test
    void shouldStoreEveryFailureTypeAndCauseAsTheirNames() {
        for (FailureType type : FailureType.values()) {
            entityManager.find(Diagnosis.class, diagnosisId).setFailureType(type);
            flushAndClear();
            assertThat(entityManager.find(Diagnosis.class, diagnosisId).getFailureType()).isEqualTo(type);
            assertThat(column("diagnoses", "failure_type", diagnosisId)).isEqualTo(type.name());
        }
        for (FailureCause cause : FailureCause.values()) {
            entityManager.find(Diagnosis.class, diagnosisId).setProbableCause(cause);
            flushAndClear();
            assertThat(entityManager.find(Diagnosis.class, diagnosisId).getProbableCause()).isEqualTo(cause);
            assertThat(column("diagnoses", "probable_cause", diagnosisId)).isEqualTo(cause.name());
        }
    }

    @Test
    void shouldClearOptionalEnumsToNull() {
        KanbanView view = entityManager.find(KanbanView.class, viewId);
        view.setPriority(RmaPriority.HIGH);
        view.setStatus(RmaStatus.RECEIVED);
        view.setWarranty(WarrantyStatus.PENDING);
        Diagnosis diagnosis = entityManager.find(Diagnosis.class, diagnosisId);
        diagnosis.setFailureType(FailureType.OTHER);
        diagnosis.setProbableCause(FailureCause.OTHER);
        flushAndClear();

        view = entityManager.find(KanbanView.class, viewId);
        view.setPriority(null);
        view.setStatus(null);
        view.setWarranty(null);
        diagnosis = entityManager.find(Diagnosis.class, diagnosisId);
        diagnosis.setFailureType(null);
        diagnosis.setProbableCause(null);
        flushAndClear();

        view = entityManager.find(KanbanView.class, viewId);
        assertThat(view.getPriority()).isNull();
        assertThat(view.getStatus()).isNull();
        assertThat(view.getWarranty()).isNull();
        diagnosis = entityManager.find(Diagnosis.class, diagnosisId);
        assertThat(diagnosis.getFailureType()).isNull();
        assertThat(diagnosis.getProbableCause()).isNull();
        assertThat(column("kanban_views", "priority", viewId)).isNull();
        assertThat(column("kanban_views", "status", viewId)).isNull();
        assertThat(column("kanban_views", "warranty_status", viewId)).isNull();
        assertThat(column("diagnoses", "failure_type", diagnosisId)).isNull();
        assertThat(column("diagnoses", "probable_cause", diagnosisId)).isNull();
    }

    private void flushAndClear() {
        entityManager.flush();
        entityManager.clear();
    }

    private String column(String table, String column, Long id) {
        return jdbcTemplate.queryForObject("SELECT " + column + " FROM " + table + " WHERE id = ?", String.class, id);
    }
}
