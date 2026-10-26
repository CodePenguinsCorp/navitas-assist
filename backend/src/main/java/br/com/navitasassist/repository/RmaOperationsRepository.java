package br.com.navitasassist.repository;

import br.com.navitasassist.approval.ApprovalModels.Approval;
import br.com.navitasassist.checklist.ChecklistModels.*;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.Statement;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Repository
@RequiredArgsConstructor
public class RmaOperationsRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public List<Template> templates() {
        return jdbc.query(
                "select document from checklist_templates order by id",
                (rs, n) -> read(rs.getString(1), Template.class));
    }

    public Optional<Template> templateForUpdate(long id) {
        return jdbc
                .query(
                        "select document from checklist_templates where id=? for update",
                        (rs, n) -> read(rs.getString(1), Template.class),
                        id)
                .stream()
                .findFirst();
    }

    public boolean templateExists(String code) {
        return jdbc.queryForObject(
                        "select count(*) from checklist_templates where code=?", Long.class, code)
                > 0;
    }

    public long insertTemplate(String code) {
        return insert("insert into checklist_templates(code,document) values (?,?)", code, "{}");
    }

    public void saveTemplate(Template value) {
        String json = write(value);
        jdbc.update("update checklist_templates set document=? where id=?", json, value.id());
        jdbc.update(
                "insert into checklist_template_versions(template_id,version,document) values"
                    + " (?,?,?)",
                value.id(),
                value.version(),
                json);
    }

    public List<Execution> checklists(long rmaId) {
        return jdbc.query(
                "select document from rma_checklists where rma_id=? order by id",
                (rs, n) -> read(rs.getString(1), Execution.class),
                rmaId);
    }

    public long insertChecklist(long rmaId, String templateCode) {
        return insert(
                "insert into rma_checklists(rma_id,template_code,document) values (?,?,?)",
                rmaId,
                templateCode,
                "{}");
    }

    public void saveExecution(Execution execution) {
        jdbc.update(
                "update rma_checklists set document=? where id=?",
                write(execution),
                execution.id());
    }

    public List<Approval> approvals(long rmaId) {
        return jdbc.query(
                "select document from rma_approvals where rma_id=? order by id",
                (rs, n) -> read(rs.getString(1), Approval.class),
                rmaId);
    }

    public long insertApproval(long rmaId, String code) {
        return insert(
                "insert into rma_approvals(rma_id,code,document) values (?,?,?)",
                rmaId,
                code,
                "{}");
    }

    public void saveApproval(Approval approval) {
        jdbc.update(
                "update rma_approvals set document=? where id=?", write(approval), approval.id());
    }

    public Optional<Execution> latestChecklist(long rmaId, String code) {
        return jdbc
                .query(
                        "select document from rma_checklists where rma_id=? and template_code=?"
                            + " order by id desc limit 1",
                        (rs, n) -> read(rs.getString(1), Execution.class),
                        rmaId,
                        code)
                .stream()
                .findFirst();
    }

    public Optional<Approval> latestApproval(long rmaId, String code) {
        return jdbc
                .query(
                        "select document from rma_approvals where rma_id=? and code=? order by id"
                            + " desc limit 1",
                        (rs, n) -> read(rs.getString(1), Approval.class),
                        rmaId,
                        code)
                .stream()
                .findFirst();
    }

    private <T> T read(String json, Class<T> type) {
        try {
            return mapper.readValue(json, type);
        } catch (Exception e) {
            throw new IllegalStateException("Invalid stored operational document", e);
        }
    }

    private String write(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Cannot serialize operational document", e);
        }
    }

    private long insert(String sql, Object... args) {
        GeneratedKeyHolder key = new GeneratedKeyHolder();
        jdbc.update(
                connection -> {
                    var statement =
                            connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
                    for (int i = 0; i < args.length; i++) statement.setObject(i + 1, args[i]);
                    return statement;
                },
                key);
        return Objects.requireNonNull(key.getKey()).longValue();
    }
}
