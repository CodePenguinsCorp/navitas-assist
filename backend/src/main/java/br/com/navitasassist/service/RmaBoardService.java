package br.com.navitasassist.service;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.repository.RmaBoardQueryRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.rma.*;
import jakarta.persistence.EntityManager;
import java.util.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class RmaBoardService {
    private final RmaBoardQueryRepository queries;
    private final RmaRecordRepository records;
    private final RmaService rmas;
    private final RmaBoardLockService locks;
    private final JdbcTemplate jdbc;
    private final EntityManager em;

    @Transactional(readOnly = true)
    public RmaBoardPageResponse column(RmaBoardFilters filters, Integer page, Integer size) {
        if (filters.status() == null) throw new BusinessException("Informe o status da coluna.");
        int number = page == null ? 0 : page, length = size == null ? 20 : size;
        if (number < 0 || length < 1 || length > 100) throw new BusinessException("Use página a partir de zero e tamanho entre 1 e 100.");
        long total = queries.counts(filters).total();
        List<Long> ids = queries.ids(filters, number, length);
        var byId = new HashMap<Long, RmaRecord>();
        if (!ids.isEmpty()) records.findBoardByIds(ids).forEach(r -> byId.put(r.getId(), r));
        var cards = rmas.boardCards(ids.stream().map(byId::get).toList());
        return new RmaBoardPageResponse(cards, total, (long) number * length + cards.size() < total, number, length);
    }

    @Transactional(readOnly = true)
    public RmaBoardCountsResponse counts(RmaBoardFilters filters) { return queries.counts(filters); }

    public RmaBoardCardResponse position(Long id, RmaBoardPositionRequest request) {
        locks.lock(id, request.status());
        if (id.equals(request.afterId()) || id.equals(request.beforeId())) throw new BusinessException("A OS não pode ser sua própria vizinha.");
        var row = records.findByIdForUpdate(id).orElseThrow();
        em.refresh(row);
        var positions = new HashMap<Long, Long>();
        var ids = jdbc.query("select r.id, r.board_position from rmas r where r.status = ? and r.id <> ? order by " + RmaBoardQueryRepository.ORDER,
            (rs, index) -> {
                long key = rs.getLong("id");
                positions.put(key, rs.getObject("board_position", Long.class));
                return key;
            }, request.status().name(), id);
        var writes = new LinkedHashMap<Long, Long>();
        int after = neighbor(ids, request.afterId()), before = neighbor(ids, request.beforeId());
        if (request.afterId() != null && request.beforeId() != null && after >= before) throw new BusinessException("Os vizinhos estão em ordem invertida.");
        int index = request.beforeId() != null ? before : request.afterId() != null ? after + 1 : 0;
        if (row.getStatus() != request.status()) {
            rmas.updateStatus(id, new RmaStatusUpdateRequest(request.status(), null));
            em.flush();
        }
        // Fixar apenas o prefixo automático anterior mantém a inserção no ponto escolhido.
        long previous = 0;
        boolean renumber = false;
        for (int i = 0; i < index; i++) {
            Long position = positions.get(ids.get(i));
            if (position == null) {
                if (previous > Long.MAX_VALUE - 2048) { renumber = true; break; }
                position = previous + 1024;
                writes.put(ids.get(i), position);
            }
            previous = position;
        }
        Long next = index < ids.size() ? positions.get(ids.get(index)) : null;
        if (previous < 0 || previous > Long.MAX_VALUE - 1024 || next != null && next - previous <= 1) renumber = true;
        if (renumber) {
            // Renumeração excepcional sob o mesmo lock; SQL não aciona a auditoria da entidade.
            for (int i = 0; i < ids.size(); i++) writes.put(ids.get(i), (i + 1L) * 2048);
            previous = index == 0 ? 0 : index * 2048L;
            next = index < ids.size() ? (index + 1L) * 2048 : null;
        }
        writes.put(id, next == null ? previous + 1024 : previous + (next - previous) / 2);
        jdbc.batchUpdate("update rmas set board_position = ? where id = ?",
            writes.entrySet().stream().map(entry -> new Object[] {entry.getValue(), entry.getKey()}).toList());
        em.flush();
        em.refresh(row);
        return rmas.boardCards(List.of(row)).get(0);
    }

    private int neighbor(List<Long> ids, Long id) {
        if (id == null) return -1;
        int index = ids.indexOf(id);
        if (index < 0) throw new BusinessException("O vizinho não pertence à coluna de destino.");
        return index;
    }
}
