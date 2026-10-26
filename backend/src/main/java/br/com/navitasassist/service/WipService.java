package br.com.navitasassist.service;

import java.util.EnumSet;
import java.util.List;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.kanban.WipLimit;
import br.com.navitasassist.kanban.WipLimitRequest;
import br.com.navitasassist.kanban.WipLimitResponse;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.WipLimitRepository;
import br.com.navitasassist.rma.RmaStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class WipService {
    private static final EnumSet<RmaStatus> ACTIVE = EnumSet.of(RmaStatus.RECEIVED, RmaStatus.TRIAGE, RmaStatus.IN_DIAGNOSIS, RmaStatus.WAITING_PART, RmaStatus.IN_REPAIR, RmaStatus.IN_TESTS);
    private final WipLimitRepository limits;
    private final RmaRecordRepository rmas;

    @Transactional(readOnly = true)
    public List<WipLimitResponse> list() {
        return limits.findAll().stream().map(this::response).toList();
    }

    public WipLimitResponse update(String column, WipLimitRequest request) {
        RmaStatus status;
        try { status = RmaStatus.valueOf(column); }
        catch (IllegalArgumentException exception) { throw new BusinessException("Invalid WIP column."); }
        if (!ACTIVE.contains(status)) throw new BusinessException("Only active columns support WIP limits.");
        WipLimit limit = getForUpdate(status);
        limit.setMaxItems(request.maxItems() == null ? null : request.maxItems().intValueExact());
        limit.setBlocking(request.blocking());
        return response(limits.save(limit));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public String checkEntry(RmaStatus status, String reason) {
        String justification = reason == null ? null : reason.trim();
        if (justification != null && !justification.isEmpty()) {
            var auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth == null || auth.getAuthorities().stream().noneMatch(role -> role.getAuthority().equals("ROLE_ADMIN"))) {
                throw new AccessDeniedException("Only administrators can override WIP limits.");
            }
        }
        if (!ACTIVE.contains(status)) return null;
        WipLimit limit = getForUpdate(status);
        if (limit.getMaxItems() == null || !limit.isBlocking()) return null;
        long count = rmas.countByStatus(status);
        if (count < limit.getMaxItems()) return null;
        if (justification == null || justification.isBlank()) throw new BusinessException("WIP limit reached for " + status + ".");
        return "WIP override: " + justification;
    }

    private WipLimit getForUpdate(RmaStatus status) {
        return limits.findByStatusForUpdate(status).orElseThrow(() -> new BusinessException("WIP configuration unavailable."));
    }
    private WipLimitResponse response(WipLimit limit) {
        return new WipLimitResponse(limit.getStatus(), limit.getMaxItems(), limit.isBlocking(), rmas.countByStatus(limit.getStatus()));
    }
}
