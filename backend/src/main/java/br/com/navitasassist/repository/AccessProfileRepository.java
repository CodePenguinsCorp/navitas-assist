package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;

import br.com.navitasassist.access.AccessProfile;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AccessProfileRepository extends JpaRepository<AccessProfile, Long> {

    Optional<AccessProfile> findByLegacyCode(String legacyCode);

    Optional<AccessProfile> findByNameIgnoreCase(String name);

    List<AccessProfile> findAllByOrderByNameAscIdAsc();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select profile from AccessProfile profile order by profile.id")
    List<AccessProfile> findAllForUpdate();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select profile from AccessProfile profile where profile.id = :id")
    Optional<AccessProfile> findByIdForUpdate(@Param("id") Long id);

    @Query(
        value = """
            select profile
            from AccessProfile profile
            where :query is null or lower(profile.name) like lower(concat('%', :query, '%'))
            order by lower(profile.name), profile.id
            """,
        countQuery = """
            select count(profile)
            from AccessProfile profile
            where :query is null or lower(profile.name) like lower(concat('%', :query, '%'))
            """)
    Page<AccessProfile> search(@Param("query") String query, Pageable pageable);
}
