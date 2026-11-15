package br.com.navitasassist.repository;

import br.com.navitasassist.config.RmaDeadlineProperties;
import br.com.navitasassist.rma.*;
import br.com.navitasassist.service.RmaDeadlineService;
import java.time.Instant;
import java.time.ZoneId;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/** Página e agregações usam o mesmo predicado e EXISTS, sem multiplicar OS pelos itens. */
@Repository
@RequiredArgsConstructor
public class RmaBoardQueryRepository {
    public static final String ORDER = "r.board_position asc nulls last, case r.priority when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end, r.updated_at desc, r.id asc";
    private static final String FROM = " from rmas r join clients c on c.id = r.client_id join products p on p.id = r.product_id ";
    private static final String CLOSED = "r.status in ('COMPLETED', 'RETURNED', 'IRREPARABLE')";
    private final NamedParameterJdbcTemplate jdbc;
    private final RmaDeadlineProperties properties;

    public List<Long> ids(RmaBoardFilters filters, int page, int size) {
        var params = new MapSqlParameterSource();
        String where = where(filters, params);
        params.addValue("limit", size).addValue("offset", (long) page * size);
        return jdbc.queryForList("select r.id" + FROM + where + " order by " + ORDER + " limit :limit offset :offset", params, Long.class);
    }

    public RmaBoardCountsResponse counts(RmaBoardFilters filters) {
        var params = new MapSqlParameterSource();
        String where = where(filters, params);
        Map<RmaStatus, Long> statuses = new EnumMap<>(RmaStatus.class);
        for (var status : RmaStatus.values()) statuses.put(status, 0L);
        long total = 0, high = 0, closed = 0;
        for (var row : jdbc.queryForList("select r.status, count(*) as total, count(*) filter (where r.priority = 'HIGH') as high" + FROM + where + " group by r.status", params)) {
            var status = RmaStatus.valueOf((String) row.get("status"));
            long count = ((Number) row.get("total")).longValue();
            statuses.put(status, count); total += count; high += ((Number) row.get("high")).longValue();
            if (Set.of(RmaStatus.COMPLETED, RmaStatus.RETURNED, RmaStatus.IRREPARABLE).contains(status)) closed += count;
        }
        return new RmaBoardCountsResponse(statuses, total, high, total - closed, closed, statuses.get(RmaStatus.WAITING_PART));
    }

    private String where(RmaBoardFilters f, MapSqlParameterSource p) {
        f.validate();
        var clauses = new ArrayList<String>();
        clauses.add("true");
        if (f.status() != null) { clauses.add("r.status = :status"); p.addValue("status", f.status().name()); }
        if (f.priority() != null) { clauses.add("r.priority = :priority"); p.addValue("priority", f.priority().name()); }
        if (f.assigneeId() != null) { clauses.add("r.assignee_id = :assignee"); p.addValue("assignee", f.assigneeId()); }
        if (Boolean.TRUE.equals(f.unassignedOnly())) clauses.add("r.assignee_id is null");
        if (f.blocked() != null) clauses.add((f.blocked() ? "" : "not ") + "exists (select 1 from rma_blocks b where b.rma_id = r.id and b.resolved_at is null)");
        if (f.entryFrom() != null) { clauses.add("r.entry_date >= :entryFrom"); p.addValue("entryFrom", f.entryFrom()); }
        if (f.entryTo() != null) { clauses.add("r.entry_date <= :entryTo"); p.addValue("entryTo", f.entryTo()); }
        var zone = ZoneId.of("America/Sao_Paulo");
        if (f.updatedFrom() != null) { clauses.add("r.updated_at >= :updatedFrom"); p.addValue("updatedFrom", f.updatedFrom().atStartOfDay(zone).toOffsetDateTime()); }
        if (f.updatedTo() != null) { clauses.add("r.updated_at < :updatedTo"); p.addValue("updatedTo", f.updatedTo().plusDays(1).atStartOfDay(zone).toOffsetDateTime()); }
        if (f.query() != null && !f.query().isBlank()) {
            p.addValue("query", "%" + f.query().trim().replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%");
            clauses.add("(" + search("concat_ws(' ', r.code, c.legal_name, c.trade_name, p.name, p.sku, r.batch_number, r.serial_number)")
                + " or exists (select 1 from rma_items i join products ip on ip.id = i.product_id where i.rma_id = r.id and "
                + search("concat_ws(' ', ip.name, ip.sku, i.batch_number, i.serial_number)") + "))");
        }
        if (f.warranty() != null) {
            p.addValue("warranty", f.warranty().name());
            clauses.add("(exists (select 1 from rma_items i join products ip on ip.id = i.product_id where i.rma_id = r.id and coalesce(i.warranty_override, "
                + warranty("coalesce(i.warranty_months, ip.default_warranty_months)") + ") = :warranty) or (not exists (select 1 from rma_items i where i.rma_id = r.id) and "
                + warranty("p.default_warranty_months") + " = :warranty))");
        }
        if (f.deadline() != null) {
            var today = RmaDeadlineService.businessDate(Instant.now());
            p.addValue("today", today).addValue("warningEnd", today.plusDays(properties.getWarningDays()));
            clauses.add("not (" + CLOSED + ")");
            clauses.add(switch (f.deadline()) {
                case OVERDUE -> "r.due_date < :today";
                case DUE_SOON -> "r.due_date >= :today and r.due_date <= :warningEnd";
                case ON_TRACK -> "r.due_date > :warningEnd";
                case NO_DUE_DATE -> "r.due_date is null";
                default -> throw new IllegalArgumentException();
            });
        }
        return " where " + String.join(" and ", clauses);
    }

    private static String search(String expression) { return "lower(unaccent(" + expression + ")) like lower(unaccent(:query)) escape '!'"; }
    private static String warranty(String months) {
        return "case when r.purchase_date_unknown or r.purchase_date is null then 'PENDING' when (r.purchase_date + (" + months + ") * interval '1 month')::date < r.entry_date then 'OUT_OF_WARRANTY' else 'IN_WARRANTY' end";
    }
}
