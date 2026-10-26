package br.com.navitasassist.service;

import java.time.LocalDate;
import java.util.List;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.kanban.KanbanView;
import br.com.navitasassist.kanban.KanbanViewFilters;
import br.com.navitasassist.kanban.KanbanViewRequest;
import br.com.navitasassist.kanban.KanbanViewResponse;
import br.com.navitasassist.repository.KanbanViewRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.user.UserAccount;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class KanbanViewService {

    private final KanbanViewRepository kanbanViewRepository;
    private final UserAccountRepository userAccountRepository;

    @Transactional(readOnly = true)
    public List<KanbanViewResponse> list(String username) {
        UserAccount owner = getOwner(username);
        return kanbanViewRepository.findAllByOwnerIdOrderByNameAsc(owner.getId())
            .stream()
            .map(KanbanViewResponse::from)
            .toList();
    }

    public KanbanViewResponse create(String username, KanbanViewRequest request) {
        UserAccount owner = getOwnerForUpdate(username);
        String name = request.name().trim();
        validate(owner.getId(), null, name, request.filters());

        if (request.defaultView()) {
            kanbanViewRepository.clearDefaultByOwnerId(owner.getId());
        }

        KanbanView view = new KanbanView();
        view.setOwner(owner);
        apply(view, name, request);
        return KanbanViewResponse.from(kanbanViewRepository.save(view));
    }

    public KanbanViewResponse update(String username, Long id, KanbanViewRequest request) {
        UserAccount owner = getOwnerForUpdate(username);
        KanbanView view = getOwnedView(owner.getId(), id);
        String name = request.name().trim();
        validate(owner.getId(), id, name, request.filters());

        if (request.defaultView()) {
            kanbanViewRepository.clearOtherDefaults(owner.getId(), id);
        }

        apply(view, name, request);
        return KanbanViewResponse.from(kanbanViewRepository.save(view));
    }

    public KanbanViewResponse setDefault(String username, Long id) {
        UserAccount owner = getOwnerForUpdate(username);
        KanbanView view = getOwnedView(owner.getId(), id);
        kanbanViewRepository.clearOtherDefaults(owner.getId(), id);
        view.setDefaultView(true);
        return KanbanViewResponse.from(kanbanViewRepository.save(view));
    }

    public void delete(String username, Long id) {
        UserAccount owner = getOwnerForUpdate(username);
        kanbanViewRepository.delete(getOwnedView(owner.getId(), id));
    }

    private void validate(Long ownerId, Long existingId, String name, KanbanViewFilters filters) {
        boolean duplicate = existingId == null
            ? kanbanViewRepository.existsByOwnerIdAndNameIgnoreCase(ownerId, name)
            : kanbanViewRepository.existsByOwnerIdAndNameIgnoreCaseAndIdNot(ownerId, name, existingId);
        if (duplicate) {
            throw new BusinessException("A Kanban view with this name already exists.");
        }
        if (filters.assigneeId() != null && filters.unassignedOnly()) {
            throw new BusinessException("Assignee and unassigned filters cannot be combined.");
        }
        validateRange(filters.entryFrom(), filters.entryTo(), "entry");
        validateRange(filters.updatedFrom(), filters.updatedTo(), "updated");
    }

    private void validateRange(LocalDate from, LocalDate to, String field) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new BusinessException("The " + field + " start date cannot be after the end date.");
        }
    }

    private void apply(KanbanView view, String name, KanbanViewRequest request) {
        KanbanViewFilters filters = request.filters();
        view.setName(name);
        view.setDefaultView(request.defaultView());
        view.setQuery(trimToNull(filters.query()));
        view.setPriority(filters.priority());
        view.setStatus(filters.status());
        view.setWarranty(filters.warranty());
        view.setAssigneeId(filters.assigneeId());
        view.setUnassignedOnly(filters.unassignedOnly());
        view.setEntryFrom(filters.entryFrom());
        view.setEntryTo(filters.entryTo());
        view.setUpdatedFrom(filters.updatedFrom());
        view.setUpdatedTo(filters.updatedTo());
        view.setBlocked(filters.blocked());
    }

    private UserAccount getOwner(String username) {
        return userAccountRepository.findByUsernameIgnoreCase(username)
            .orElseThrow(() -> new ResourceNotFoundException("User not found: " + username));
    }

    private UserAccount getOwnerForUpdate(String username) {
        return userAccountRepository.findByUsernameIgnoreCaseForUpdate(username)
            .orElseThrow(() -> new ResourceNotFoundException("User not found: " + username));
    }

    private KanbanView getOwnedView(Long ownerId, Long id) {
        return kanbanViewRepository.findByIdAndOwnerId(id, ownerId)
            .orElseThrow(() -> new ResourceNotFoundException("Kanban view not found: " + id));
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
