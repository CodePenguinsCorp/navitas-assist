package br.com.navitasassist.repository;

import java.util.List;
import java.util.Optional;

import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserRole;
import jakarta.persistence.LockModeType;
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

    List<UserAccount> findAllByActiveTrueAndRoleNotOrderByFullNameAsc(UserRole role);
}
