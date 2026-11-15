package br.com.navitasassist.repository;

import java.util.List;

import br.com.navitasassist.rma.RmaBlock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface RmaBlockRepository extends JpaRepository<RmaBlock, Long> {

    @Query("select trim(b.category) from RmaBlock b where trim(coalesce(b.category, '')) <> '' group by trim(b.category) order by min(b.id)")
    List<String> findDistinctCategories();
}
