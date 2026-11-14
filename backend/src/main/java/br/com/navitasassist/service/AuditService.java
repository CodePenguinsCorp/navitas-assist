package br.com.navitasassist.service;

import br.com.navitasassist.audit.AuditEvent;
import br.com.navitasassist.audit.AuditEventResponse;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.pagination.PageParams;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.repository.AuditEventRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import jakarta.persistence.EntityManager;
import java.time.*;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Service
@RequiredArgsConstructor
public class AuditService {
    private final EntityManager entityManager;
    private final UserAccountRepository users;
    private final AuditEventRepository events;
    private final Clock clock;
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(String action, String entityType, Long entityId, String entityLabel, String summary) {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        String username = authentication != null && authentication.isAuthenticated() && !"anonymousUser".equals(authentication.getName())
            ? authentication.getName() : "sistema";
        Long actorId = authentication != null && authentication.getDetails() instanceof br.com.navitasassist.auth.LoginSessionDetails details
            ? details.userId() : users.findByUsernameIgnoreCase(username).map(user -> user.getId()).orElse(null);
        String ip = RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes
            ? attributes.getRequest().getRemoteAddr() : null;
        entityManager.persist(new AuditEvent(clock.instant(), actorId, limit(username, 60), action, entityType,
            entityId, limit(entityLabel, 120), limit(summary, 500), limit(ip, 45)));
        entityManager.flush();
    }

    @Transactional(readOnly = true)
    public PageResponse<AuditEventResponse> search(LocalDate from, LocalDate to, String actor, String action,
                                                   String entityType, Integer page, Integer size) {
        if (from != null && to != null && from.isAfter(to)) throw new BusinessException("A data inicial deve ser anterior à data final.");
        var params = PageParams.of(page, size);
        Specification<AuditEvent> filter = (root, query, cb) -> {
            List<jakarta.persistence.criteria.Predicate> predicates = new ArrayList<>();
            if (from != null) predicates.add(cb.greaterThanOrEqualTo(root.get("occurredAt"), from.atStartOfDay(BUSINESS_ZONE).toInstant()));
            if (to != null) predicates.add(cb.lessThan(root.get("occurredAt"), to.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant()));
            if (actor != null && !actor.isBlank()) predicates.add(cb.equal(cb.lower(root.get("actorUsername")), actor.trim().toLowerCase(Locale.ROOT)));
            if (action != null && !action.isBlank()) predicates.add(cb.equal(root.get("action"), action.trim()));
            if (entityType != null && !entityType.isBlank()) predicates.add(cb.equal(root.get("entityType"), entityType.trim()));
            return cb.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
        return PageResponse.from(events.findAll(filter, PageRequest.of(params.getPageNumber(), params.getPageSize(),
            Sort.by(Sort.Direction.DESC, "occurredAt", "id"))), AuditEventResponse::from);
    }

    @Transactional
    public void recordEmailTest(Long userId) {
        record("EMAIL_TEST", "EMAIL", userId, "E-mail de teste", "Envio de e-mail de teste solicitado.");
    }

    public static String safeNote(String text) {
        return safeNote(text, 200);
    }

    public static String safeNote(String text, int max) {
        if (text == null) return "(vazia)";
        String safe = text.replaceAll("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+", "[e-mail omitido]")
            .replaceAll("(?i)\\b(senha|password|token|segredo|secret|api[_ -]?key|authorization|bearer)\\b\\s*(?:[:=]\\s*|\\s+)[^;\\r\\n]+", "$1 [omitido]")
            .replaceAll("(?iu)\\b(?:rua|avenida|av\\.?|alameda|travessa|rodovia|estrada|praça)\\s+[^;\\r\\n]+", "[endereço omitido]")
            .replaceAll("(?<![A-Za-z0-9])(?:[+]?\\d[\\d .()/+-]{6,}\\d)", "[número omitido]");
        return limit(safe, max);
    }

    public static String limit(String value, int max) {
        if (value == null) return null;
        return value.substring(0, value.offsetByCodePoints(0, Math.min(value.codePointCount(0, value.length()), max)));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void recordPermissionChanges(String type, Long id, String label, Set<String> before, Set<String> after) {
        recordPermissionChanges(type, id, label, before, after, "");
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void recordPermissionChanges(String type, Long id, String label, Set<String> before, Set<String> after, String qualifier) {
        Set<String> added = new TreeSet<>(after); added.removeAll(before);
        Set<String> removed = new TreeSet<>(before); removed.removeAll(after);
        for (String permission : added) record("UPDATE", type, id, label, "Permissão " + qualifier + "adicionada: " + permission + ".");
        for (String permission : removed) record("UPDATE", type, id, label, "Permissão " + qualifier + "removida: " + permission + ".");
    }

    public static String changedFields(Object before, Object after) {
        // Only record component names, never values, including free-text or personal fields.
        List<String> fields = new ArrayList<>();
        try {
            for (var component : before.getClass().getRecordComponents()) {
                if (!Set.of("id", "createdAt", "updatedAt").contains(component.getName())
                    && !Objects.equals(component.getAccessor().invoke(before), component.getAccessor().invoke(after))) fields.add(component.getName());
            }
        } catch (ReflectiveOperationException error) { throw new IllegalStateException(error); }
        return "Campos alterados: " + String.join(", ", fields) + ".";
    }
}
