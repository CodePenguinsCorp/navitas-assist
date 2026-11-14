package br.com.navitasassist.audit;

import static org.assertj.core.api.Assertions.assertThat;
import br.com.navitasassist.service.AuditService;
import org.junit.jupiter.api.Test;

class AuditTextTest {
    @Test void masksPersonalDataAndSecretsWhileKeepingTheNoteAndItsLimit() {
        assertThat(AuditService.safeNote("Falha intermitente; Rua Teste 123; old@example.invalid; senha=OldSecret; +55 (11) 99999-9999"))
            .contains("Falha intermitente", "[endereço omitido]", "[e-mail omitido]", "senha [omitido]", "[número omitido]")
            .doesNotContain("Rua Teste", "old@example.invalid", "OldSecret", "99999");
        assertThat(AuditService.safeNote("x".repeat(220))).hasSize(200);
        assertThat(AuditService.safeNote(null)).isEqualTo("(vazia)");
    }

    @Test void masksCredentialsWithOtherCommonMarkers() {
        assertThat(AuditService.safeNote("Falha; senha minhaSenha; api_key=key123; Bearer bearer123"))
            .contains("Falha")
            .doesNotContain("minhaSenha", "key123", "bearer123");
    }

    @Test void truncatesAtUnicodeCharacterBoundariesWithoutSplittingEmoji() {
        String emoji = new String(Character.toChars(0x1F600));
        assertThat(AuditService.limit("a".repeat(119) + emoji + "z", 120)).isEqualTo("a".repeat(119) + emoji);
        assertThat(AuditService.limit(emoji.repeat(120), 120)).isEqualTo(emoji.repeat(120));
        assertThat(AuditService.limit(null, 120)).isNull();
    }
}
