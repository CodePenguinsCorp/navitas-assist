package br.com.navitasassist.repository;

import java.util.Optional;

import br.com.navitasassist.scan.RmaScanCode;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RmaScanCodeRepository extends JpaRepository<RmaScanCode, Long> {

    @EntityGraph(attributePaths = { "rma" })
    Optional<RmaScanCode> findByTokenAndActiveTrue(String token);

    @EntityGraph(attributePaths = { "rma" })
    Optional<RmaScanCode> findFirstByRma_IdAndActiveTrueOrderByIdDesc(Long rmaId);
}
