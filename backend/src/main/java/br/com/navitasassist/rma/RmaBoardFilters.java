package br.com.navitasassist.rma;

import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import br.com.navitasassist.controller.BusinessException;

public record RmaBoardFilters(String query, RmaStatus status, RmaPriority priority, WarrantyStatus warranty,
    Boolean blocked, RmaDeadlineStatus deadline, Long assigneeId, Boolean unassignedOnly,
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate entryFrom,
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate entryTo,
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate updatedFrom,
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate updatedTo) {
    public void validate() {
        if (query != null && query.length() > 100) throw new BusinessException("A busca deve ter no máximo 100 caracteres.");
        if (Boolean.TRUE.equals(unassignedOnly) && assigneeId != null) throw new BusinessException("Escolha um responsável ou somente OS sem responsável.");
        if (assigneeId != null && assigneeId <= 0) throw new BusinessException("O responsável deve ter um identificador positivo.");
        if (entryFrom != null && entryTo != null && entryFrom.isAfter(entryTo)
            || updatedFrom != null && updatedTo != null && updatedFrom.isAfter(updatedTo))
            throw new BusinessException("A data inicial deve ser anterior ou igual à data final.");
        if (deadline == RmaDeadlineStatus.CLOSED) throw new BusinessException("Use o filtro de status para selecionar OS encerradas.");
    }
}
