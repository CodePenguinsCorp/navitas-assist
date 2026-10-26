package br.com.navitasassist.repository;

import br.com.navitasassist.workflow.WorkflowDocument.*;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class WorkflowRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public Published published(boolean forUpdate) {
        String sql =
                "select version, published_document from workflow_config where id=1"
                        + (forUpdate ? " for update" : "");
        return jdbc.queryForObject(
                sql, (rs, n) -> new Published(rs.getLong(1), read(rs.getString(2))));
    }

    public Draft draft() {
        return jdbc.queryForObject(
                "select version, revision, draft_document from workflow_config where id=1",
                (rs, n) -> new Draft(rs.getLong(1), rs.getLong(2), read(rs.getString(3))));
    }

    public void copyPublishedToDraft() {
        jdbc.update(
                "update workflow_config set draft_document=published_document, revision=revision+1"
                    + " where id=1");
    }

    public void saveDraft(Definition definition) {
        jdbc.update(
                "update workflow_config set draft_document=?, revision=revision+1 where id=1",
                write(definition));
    }

    public void discardDraft() {
        jdbc.update(
                "update workflow_config set draft_document=null, revision=revision+1 where id=1");
    }

    public void publish(long version, Definition definition) {
        String document = write(definition);
        jdbc.update(
                "insert into workflow_versions(version, document) values (?,?)", version, document);
        jdbc.update(
                "update workflow_config set version=?, published_document=?, draft_document=null,"
                    + " revision=revision+1 where id=1",
                version,
                document);
    }

    private Definition read(String json) {
        if (json == null) return null;
        try {
            return mapper.readValue(json, Definition.class);
        } catch (Exception e) {
            throw new IllegalStateException("Invalid stored workflow document", e);
        }
    }

    private String write(Definition definition) {
        try {
            return mapper.writeValueAsString(definition);
        } catch (Exception e) {
            throw new IllegalStateException("Cannot serialize workflow", e);
        }
    }
}
