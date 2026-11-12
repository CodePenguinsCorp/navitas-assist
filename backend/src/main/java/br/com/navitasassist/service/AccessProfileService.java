package br.com.navitasassist.service;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

import br.com.navitasassist.access.AccessProfile;
import br.com.navitasassist.access.Permission;
import br.com.navitasassist.access.ProfileOptionResponse;
import br.com.navitasassist.access.ProfileRequest;
import br.com.navitasassist.access.ProfileResponse;
import br.com.navitasassist.controller.BusinessException;
import br.com.navitasassist.controller.ResourceNotFoundException;
import br.com.navitasassist.pagination.PageParams;
import br.com.navitasassist.pagination.PageResponse;
import br.com.navitasassist.repository.AccessProfileRepository;
import br.com.navitasassist.repository.UserAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class AccessProfileService {

    private final AccessProfileRepository accessProfileRepository;
    private final UserAccountRepository userAccountRepository;
    private final AdministratorGuard administratorGuard;
    private final PermissionGrantPolicy permissionGrantPolicy;

    @Transactional(readOnly = true)
    public PageResponse<ProfileResponse> search(String query, Integer page, Integer size) {
        String normalizedQuery = query == null || query.isBlank() ? null : query.trim();
        return PageResponse.from(accessProfileRepository.search(normalizedQuery, PageParams.of(page, size)), this::toResponse);
    }

    @Transactional(readOnly = true)
    public List<ProfileOptionResponse> options() {
        return accessProfileRepository.findAllByOrderByNameAscIdAsc().stream().map(ProfileOptionResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public ProfileResponse get(Long id) {
        return toResponse(accessProfileRepository.findById(id).orElseThrow(() -> notFound(id)));
    }

    public ProfileResponse create(ProfileRequest request, String actor) {
        String name = request.name().trim();
        Set<Permission> permissions = validateCodes(request.permissions());
        validateName(null, name);
        permissionGrantPolicy.ensureCanGrant(actor, permissions);

        AccessProfile profile = new AccessProfile();
        profile.setName(name);
        profile.setPermissions(new HashSet<>(Permission.codes(permissions)));
        return toResponse(save(profile));
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ProfileResponse update(Long id, ProfileRequest request, String actor) {
        // Mesma ordem de locks de toda redução de acesso: perfis, usuários ativos e só então o alvo. O lock precisa vir
        // antes de qualquer leitura, inclusive das permissões do ator: assim duas edições cruzadas (cada administrador
        // tirando perfis.gerir do perfil do outro) se serializam, e a segunda já vê o ator rebaixado.
        administratorGuard.lockAccessGraph();
        AccessProfile profile = accessProfileRepository.findByIdForUpdate(id).orElseThrow(() -> notFound(id));
        String name = request.name().trim();
        Set<Permission> permissions = validateCodes(request.permissions());
        validateName(profile, name);
        // Anti-escalada sobre o conjunto atual e o novo: quem não é administrador não mexe em perfil com mais acesso.
        Set<Permission> touched = Permission.fromCodes(profile.getPermissions());
        touched.addAll(permissions);
        permissionGrantPolicy.ensureCanGrant(actor, touched);

        Set<String> codes = new HashSet<>(Permission.codes(permissions));
        if (!codes.equals(profile.getPermissions())) {
            administratorGuard.ensureRemainsAfterProfileChange(profile, codes);
        }
        profile.setName(name);
        profile.getPermissions().clear();
        profile.getPermissions().addAll(codes);
        // D8: sem revogação de sessões; as permissões são recalculadas na próxima requisição de cada usuário.
        return toResponse(save(profile));
    }

    public void delete(Long id, String actor) {
        AccessProfile profile = accessProfileRepository.findByIdForUpdate(id).orElseThrow(() -> notFound(id));
        permissionGrantPolicy.ensureCanGrant(actor, Permission.fromCodes(profile.getPermissions()));
        // Enquanto a coluna legada role existir, os perfis migrados sustentam o role provisório da API e o rollback (spec §6).
        if (profile.getLegacyCode() != null) {
            throw new BusinessException("Perfil migrado não pode ser excluído.");
        }
        if (userAccountRepository.countByProfile_Id(id) > 0) {
            throw new BusinessException("Perfil possui usuários vinculados e não pode ser excluído.");
        }
        accessProfileRepository.delete(profile);
    }

    /** Perfil referenciado por outro cadastro (usuário, regra): id inexistente é erro de validação (400). */
    @Transactional(readOnly = true)
    public AccessProfile getEntity(Long id) {
        return accessProfileRepository.findById(id)
            .orElseThrow(() -> new BusinessException("Perfil não encontrado: " + id + "."));
    }

    /** Recusa códigos fora do catálogo com 400 {@code "Permissão desconhecida: {código}."}. */
    public Set<Permission> validateCodes(Set<String> codes) {
        for (String code : new TreeSet<>(codes)) {
            if (Permission.fromCode(code).isEmpty()) {
                throw new BusinessException("Permissão desconhecida: " + code + ".");
            }
        }
        return Permission.fromCodes(codes);
    }

    private void validateName(AccessProfile existing, String name) {
        boolean duplicate = accessProfileRepository.findByNameIgnoreCase(name)
            .filter(other -> existing == null || !Objects.equals(other.getId(), existing.getId()))
            .isPresent();
        if (duplicate) {
            throw duplicate(name);
        }
    }

    /** O índice único pega a corrida (e, no MySQL, nomes que diferem só por acento). */
    private AccessProfile save(AccessProfile profile) {
        try {
            return accessProfileRepository.saveAndFlush(profile);
        } catch (DataIntegrityViolationException exception) {
            throw duplicate(profile.getName());
        }
    }

    private ProfileResponse toResponse(AccessProfile profile) {
        return ProfileResponse.from(profile, userAccountRepository.countByProfile_Id(profile.getId()));
    }

    private static BusinessException duplicate(String name) {
        return new BusinessException("Já existe um perfil com o nome " + name + ".");
    }

    private static ResourceNotFoundException notFound(Long id) {
        return new ResourceNotFoundException("Perfil não encontrado: " + id + ".");
    }
}
