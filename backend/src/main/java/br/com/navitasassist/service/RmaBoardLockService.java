package br.com.navitasassist.service;

import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.rma.RmaStatus;
import java.util.TreeSet;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class RmaBoardLockService {
    private final JdbcTemplate jdbc;

    /** Chaves estáveis por nome, sempre na mesma ordem antes do lock da OS. */
    public void lock(Long id, RmaStatus target) {
        var source = jdbc.queryForList("select status from rmas where id = ?", String.class, id);
        if (source.isEmpty()) throw new ResourceNotFoundException("OS não encontrada: " + id + ".");
        var statuses = new TreeSet<String>();
        statuses.add(source.get(0)); statuses.add(target.name());
        for (String status : statuses) jdbc.queryForObject("select pg_advisory_xact_lock(73429, hashtext(?))", Object.class, status);
        String current = jdbc.queryForObject("select status from rmas where id = ? for update", String.class, id);
        if (!source.get(0).equals(current)) throw new BusinessException("A OS mudou de coluna. Atualize o quadro e tente novamente.");
    }
}
