package br.com.navitasassist.repository;

import java.util.List;

import br.com.navitasassist.diagnosis.Diagnosis;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface DiagnosisRepository extends JpaRepository<Diagnosis, Long> {

    @Query("select trim(d.failureType) from Diagnosis d where trim(coalesce(d.failureType, '')) <> '' group by trim(d.failureType) order by min(d.id)")
    List<String> findDistinctFailureTypes();

    @Query("select trim(d.probableCause) from Diagnosis d where trim(coalesce(d.probableCause, '')) <> '' group by trim(d.probableCause) order by min(d.id)")
    List<String> findDistinctProbableCauses();
}
