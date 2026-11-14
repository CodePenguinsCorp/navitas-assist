package br.com.navitasassist.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import br.com.navitasassist.access.AccessProfile;
import br.com.navitasassist.user.UserAccount;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {

    Optional<UserAccount> findByUsernameIgnoreCase(String username);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select account from UserAccount account where upper(account.username) = upper(:username)")
    Optional<UserAccount> findByUsernameIgnoreCaseForUpdate(@Param("username") String username);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select account from UserAccount account where account.active = true order by account.id")
    List<UserAccount> findAllActiveForUpdate();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select account from UserAccount account where account.id = :id")
    Optional<UserAccount> findByIdForUpdate(@Param("id") Long id);

    /** Conta, perfil e as duas coleções de permissões numa só consulta, sem lock (recálculo por requisição). */
    @Query("""
        select account
        from UserAccount account
        join fetch account.profile profile
        left join fetch profile.permissions
        left join fetch account.extraPermissions
        where account.id = :id
        """)
    Optional<UserAccount> findWithAccessById(@Param("id") Long id);

    Optional<UserAccount> findByEmailIgnoreCase(String email);

    boolean existsByUsernameIgnoreCase(String username);

    List<UserAccount> findAllByActiveTrueAndProfileInOrderByFullNameAsc(Collection<AccessProfile> profiles);

    List<UserAccount> findAllByActiveTrueOrderByFullNameAsc();

    @Query("""
        select account
        from UserAccount account
        where (
            :query is null
            or lower(unaccent(account.fullName)) like lower(unaccent(concat('%', cast(:query as String), '%')))
            or lower(unaccent(account.username)) like lower(unaccent(concat('%', cast(:query as String), '%')))
          )
          and (:profileId is null or account.profile.id = :profileId)
          and (:active is null or account.active = :active)
        order by lower(unaccent(account.fullName)), account.id
        """)
    Page<UserAccount> search(
        @Param("query") String query,
        @Param("profileId") Long profileId,
        @Param("active") Boolean active,
        Pageable pageable
    );

    long countByProfile_Id(Long profileId);
}
