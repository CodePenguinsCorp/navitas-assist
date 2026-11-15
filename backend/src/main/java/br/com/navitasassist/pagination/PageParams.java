package br.com.navitasassist.pagination;

import br.com.navitasassist.controller.BusinessException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

public final class PageParams {

    public static final int DEFAULT_SIZE = 20;
    public static final int MAX_SIZE = 100;

    private PageParams() {
    }

    public static Pageable of(Integer page, Integer size) {
        int resolvedPage = page == null ? 0 : page;
        int resolvedSize = size == null ? DEFAULT_SIZE : size;

        if (resolvedPage < 0) {
            throw new BusinessException("A página deve ser maior ou igual a 0.");
        }
        if (resolvedSize < 1 || resolvedSize > MAX_SIZE) {
            throw new BusinessException("O tamanho da página deve estar entre 1 e " + MAX_SIZE + ".");
        }

        return PageRequest.of(resolvedPage, resolvedSize);
    }
}
