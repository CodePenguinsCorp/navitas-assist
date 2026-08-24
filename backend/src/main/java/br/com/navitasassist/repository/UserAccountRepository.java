package br.com.navitasassist.repository;

import java.util.Optional;

import br.com.navitasassist.user.UserAccount;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {

    Optional<UserAccount> findByUsernameIgnoreCase(String username);

    boolean existsByUsernameIgnoreCase(String username);
}
