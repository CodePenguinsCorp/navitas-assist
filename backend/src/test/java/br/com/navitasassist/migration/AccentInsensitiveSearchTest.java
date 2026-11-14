package br.com.navitasassist.migration;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import br.com.navitasassist.access.AccessProfile;
import br.com.navitasassist.client.Client;
import br.com.navitasassist.part.Part;
import br.com.navitasassist.product.Product;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.ClientRepository;
import br.com.navitasassist.repository.PartRepository;
import br.com.navitasassist.repository.ProductRepository;
import br.com.navitasassist.repository.RmaRecordRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import br.com.navitasassist.rma.RmaRecord;
import br.com.navitasassist.rma.RmaStatus;
import br.com.navitasassist.user.UserAccount;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * Buscas ignoram acento e caixa com unaccent no PostgreSQL ("tecnica" encontra "Técnica"), aceitam termo nulo e vazio,
 * e a ordenação por nome é alfabética sem depender da collation do banco.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class AccentInsensitiveSearchTest {

    private static final PageRequest PAGE = PageRequest.of(0, 50);

    @Autowired JdbcTemplate jdbc;
    @Autowired ClientRepository clients;
    @Autowired ProductRepository products;
    @Autowired PartRepository parts;
    @Autowired AccessProfileRepository profiles;
    @Autowired UserAccountRepository users;
    @Autowired RmaRecordRepository rmas;

    @BeforeEach
    void seed() {
        jdbc.update("INSERT INTO clients (legal_name, trade_name, created_at, updated_at) VALUES ('Assistência Técnica Ômega Ltda', 'Ômega', now(), now())");
        jdbc.update("INSERT INTO products (sku, name, category, default_warranty_months, created_at, updated_at) VALUES ('ACC-CAM-1', 'Câmera Térmica', 'Visão', 12, now(), now())");
        jdbc.update("""
            INSERT INTO parts (code, name, unit, location, minimum_stock, unit_cost, on_hand_quantity, reserved_quantity, active, created_at, updated_at)
            VALUES ('ACC-PECA-1', 'Peça Óptica', 'un', 'Prateleira Ç', 0, 0, 0, 0, TRUE, now(), now())
            """);
        jdbc.update("INSERT INTO access_profiles (name, created_at, updated_at) VALUES ('Ábaco ordenação', now(), now()), ('Zebra ordenação', now(), now()), ('abelha ordenação', now(), now())");
        jdbc.update("""
            INSERT INTO user_accounts (username, full_name, password_hash, active, created_at, updated_at, profile_id)
            VALUES ('joao.acento', 'João Acentuação', 'hash', TRUE, now(), now(), (SELECT id FROM access_profiles WHERE legacy_code = 'VIEWER'))
            """);
        jdbc.update("""
            INSERT INTO rmas (code, client_id, product_id, purchase_date_unknown, entry_date, received_by, reported_failure, priority, status, created_at, updated_at)
            VALUES ('ACC-RMA-1', (SELECT id FROM clients WHERE trade_name = 'Ômega'), (SELECT id FROM products WHERE sku = 'ACC-CAM-1'),
                    TRUE, CURRENT_DATE, 'desk', 'Falha', 'MEDIUM', 'RECEIVED', now(), now())
            """);
    }

    @Test
    void clientsAreFoundWithoutAccentAndInAnotherCase() {
        assertThat(clients.search("TECNICA OMEGA", null, null, PAGE).map(Client::getLegalName))
            .containsExactly("Assistência Técnica Ômega Ltda");
        assertThat(clients.search("omega", null, null, PAGE).map(Client::getTradeName)).contains("Ômega");
    }

    @Test
    void productsPartsUsersAndRmasAreFoundWithoutAccent() {
        assertThat(products.search("camera termica", null, null, PAGE).map(Product::getSku)).containsExactly("ACC-CAM-1");
        assertThat(products.search("VISAO", null, null, PAGE).map(Product::getSku)).containsExactly("ACC-CAM-1");
        assertThat(parts.search("peca optica")).extracting(Part::getCode).containsExactly("ACC-PECA-1");
        assertThat(parts.search("prateleira c")).extracting(Part::getCode).containsExactly("ACC-PECA-1");
        assertThat(users.search("joao acentuacao", null, null, PAGE).map(UserAccount::getUsername)).containsExactly("joao.acento");
        assertThat(rmas.search("tecnica omega", null)).extracting(RmaRecord::getCode).containsExactly("ACC-RMA-1");
        assertThat(rmas.searchPage("CAMERA TERMICA", null, PAGE).map(RmaRecord::getCode)).containsExactly("ACC-RMA-1");
        assertThat(rmas.summarize("camera", null, List.of(RmaStatus.RETURNED)).total()).isEqualTo(1);
    }

    @Test
    void nullAndEmptyQueriesListEverything() {
        long total = clients.count();
        assertThat(clients.search(null, null, null, PageRequest.of(0, 1)).getTotalElements()).isEqualTo(total);
        assertThat(clients.search("", null, null, PageRequest.of(0, 1)).getTotalElements()).isEqualTo(total);
        assertThat(products.search(null, null, null, PAGE).getTotalElements()).isEqualTo(products.count());
        assertThat(products.search(null, "visão", null, PAGE).map(Product::getSku)).contains("ACC-CAM-1");
        assertThat(parts.search(null)).hasSize((int) parts.count());
        assertThat(profiles.search(null, PAGE).getTotalElements()).isEqualTo(profiles.count());
        assertThat(users.search(null, null, null, PAGE).getTotalElements()).isEqualTo(users.count());
        assertThat(rmas.search(null, null)).hasSize((int) rmas.count());
        assertThat(rmas.searchPage(null, null, PAGE).getTotalElements()).isEqualTo(rmas.count());
        assertThat(rmas.summarize(null, null, List.of(RmaStatus.RETURNED)).total()).isEqualTo(rmas.count());
    }

    @Test
    void nameOrderingIgnoresAccentAndCase() {
        assertThat(profiles.search("ORDENACAO", PAGE).map(AccessProfile::getName))
            .containsExactly("Ábaco ordenação", "abelha ordenação", "Zebra ordenação");
    }
}
