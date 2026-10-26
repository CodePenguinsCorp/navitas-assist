package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;

import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
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

    boolean existsByUsernameIgnoreCase(String username);

    List<UserAccount> findAllByActiveTrueAndRoleOrderByFullNameAsc(UserRole role);

    @Query("""
        select account
        from UserAccount account
        where (
            :query is null
            or lower(account.fullName) like lower(concat('%', :query, '%'))
            or lower(account.username) like lower(concat('%', :query, '%'))
          )
          and (:role is null or account.role = :role)
          and (:active is null or account.active = :active)
        order by lower(account.fullName), account.id
        """)
    Page<UserAccount> search(
        @Param("query") String query,
        @Param("role") UserRole role,
        @Param("active") Boolean active,
        Pageable pageable
    );

    long countByActiveTrue();

    long countByRole(UserRole role);

    @Query("select count(distinct account.role) from UserAccount account")
    long countDistinctRoles();
}
