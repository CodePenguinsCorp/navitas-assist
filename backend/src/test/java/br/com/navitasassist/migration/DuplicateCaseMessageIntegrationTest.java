package br.com.navitasassist.migration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.Locale;
import java.util.Set;

import br.com.navitasassist.access.AccessProfile;
import br.com.navitasassist.access.ProfileRequest;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.part.PartRequest;
import br.com.navitasassist.product.ProductRequest;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.service.AccessProfileService;
import br.com.navitasassist.service.PartService;
import br.com.navitasassist.service.ProductService;
import br.com.navitasassist.service.UserAccountService;
import br.com.navitasassist.user.UserAccount;
import br.com.navitasassist.user.UserAccountRequest;
import br.com.navitasassist.user.UserAccountTestSupport;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/** Duplicatas que diferem só na caixa devolvem a mensagem de negócio, e o nome do índice chega ao Hibernate. */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class DuplicateCaseMessageIntegrationTest {

    @Autowired ProductService products;
    @Autowired PartService parts;
    @Autowired AccessProfileService profiles;
    @Autowired UserAccountService users;
    @Autowired UserAccountRepository userRepository;
    @Autowired AccessProfileRepository profileRepository;
    @Autowired PasswordEncoder passwordEncoder;

    /** Perfis e usuários só podem conceder permissões que o autor tem: o autor é o administrador. */
    @BeforeEach
    void ensureAdmin() {
        UserAccountTestSupport.ensureAdmin(userRepository, profileRepository, passwordEncoder);
    }

    @Test
    void productSkuDifferingOnlyByCaseIsRejected() {
        products.create(new ProductRequest("CASE-SKU-1", "Produto", null, null, null, 12, null));
        assertThatThrownBy(() -> products.create(new ProductRequest("case-sku-1", "Outro", null, null, null, 12, null)))
            .isInstanceOf(BusinessException.class).hasMessage("SKU already registered: case-sku-1");
    }

    @Test
    void partCodeDifferingOnlyByCaseIsRejected() {
        parts.create(new PartRequest("CASE-PART-1", "Peça", "un", null, BigDecimal.ZERO, BigDecimal.ONE, true));
        assertThatThrownBy(() -> parts.create(new PartRequest("case-part-1", "Peça", "un", null, BigDecimal.ZERO, BigDecimal.ONE, true)))
            .isInstanceOf(BusinessException.class).hasMessage("Part code already registered: case-part-1");
    }

    @Test
    void profileNameDifferingOnlyByCaseIsRejectedButAccentIsDistinct() {
        profiles.create(new ProfileRequest("Revisão de casos", Set.of("rma.ver")), "admin");
        assertThatThrownBy(() -> profiles.create(new ProfileRequest("REVISÃO DE CASOS", Set.of("rma.ver")), "admin"))
            .isInstanceOf(BusinessException.class).hasMessage("Já existe um perfil com o nome REVISÃO DE CASOS.");
        assertThat(profiles.create(new ProfileRequest("Revisao de casos", Set.of("rma.ver")), "admin").name()).isEqualTo("Revisao de casos");
    }

    @Test
    void usernameAndEmailDifferingOnlyByCaseAreRejected() {
        Long profileId = profileRepository.findByLegacyCode("VIEWER").orElseThrow().getId();
        users.create(new UserAccountRequest("Case.User", "Usuário", "password123", profileId, Set.of(), true, "Case.User@Example.invalid"), "admin");
        assertThatThrownBy(() -> users.create(new UserAccountRequest("case.user", "Outro", "password123", profileId, Set.of(), true, null), "admin"))
            .isInstanceOf(BusinessException.class).hasMessage("Username already registered: case.user");
        assertThatThrownBy(() -> users.create(new UserAccountRequest("case.other", "Outro", "password123", profileId, Set.of(), true, "CASE.USER@example.INVALID"), "admin"))
            .isInstanceOf(BusinessException.class).hasMessage("Email already registered.");
    }

    /**
     * O caminho da corrida (sem a pré-checagem do serviço) depende do nome do índice em getConstraintName(), que o
     * UserAccountService usa para traduzir a violação em "Email already registered.".
     */
    @Test
    void emailIndexNameReachesHibernateConstraintViolation() {
        AccessProfile viewer = profileRepository.findByLegacyCode("VIEWER").orElseThrow();
        userRepository.saveAndFlush(account("race.one", "Race@Example.invalid", viewer));

        assertThatThrownBy(() -> userRepository.saveAndFlush(account("race.two", "race@example.invalid", viewer)))
            .isInstanceOf(DataIntegrityViolationException.class)
            .satisfies(error -> assertThat(constraintName(error)).isEqualTo("uk_user_accounts_email"));
    }

    private static UserAccount account(String username, String email, AccessProfile profile) {
        UserAccount account = new UserAccount();
        account.setUsername(username);
        account.setFullName("Corrida");
        account.setPasswordHash("hash");
        account.setActive(true);
        account.setEmail(email);
        account.setProfile(profile);
        return account;
    }

    private static String constraintName(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException violation && violation.getConstraintName() != null) {
                return violation.getConstraintName().toLowerCase(Locale.ROOT);
            }
        }
        return null;
    }
}
