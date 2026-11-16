package br.com.navitasassist.access;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import br.com.navitasassist.repository.AccessProfileRepository;
import org.junit.jupiter.api.Test;

class AccessTestSupportTest {
    @Test
    void createsOnlyMissingProfilesByNameAndReusesThem() {
        AccessProfileRepository repository = mock(AccessProfileRepository.class);
        Map<String, AccessProfile> stored = new HashMap<>();
        when(repository.findByNameIgnoreCase(any())).thenAnswer(call -> Optional.ofNullable(stored.get(call.getArgument(0))));
        when(repository.saveAndFlush(any())).thenAnswer(call -> {
            AccessProfile profile = call.getArgument(0);
            stored.put(profile.getName(), profile);
            return profile;
        });
        for (String code : TestProfiles.PERMISSIONS.keySet()) {
            AccessProfile profile = AccessTestSupport.profile(repository, code);
            assertEquals(TestProfiles.PERMISSIONS.get(code), profile.getPermissions());
            assertSame(profile, AccessTestSupport.profile(repository, code));
        }
        assertEquals(java.util.Set.of("Administrador", "Atendimento", "Técnico", "Consulta"), stored.keySet());
        verify(repository, times(4)).saveAndFlush(any());
    }

    @Test
    void preservesExistingProfilePermissions() {
        AccessProfileRepository repository = mock(AccessProfileRepository.class);
        AccessProfile existing = new AccessProfile();
        existing.setName("Administrador");
        existing.setPermissions(java.util.Set.of("rma.ver"));
        when(repository.findByNameIgnoreCase("Administrador")).thenReturn(Optional.of(existing));
        assertSame(existing, AccessTestSupport.profile(repository, "ADMIN"));
        assertEquals(java.util.Set.of("rma.ver"), existing.getPermissions());
        verify(repository, never()).saveAndFlush(any());
    }
}
