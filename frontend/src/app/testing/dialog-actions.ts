/**
 * Confere o rodapé do diálogo aberto: Cancelar vem antes da ação principal.
 * Não depende de globais de teste; falha lançando um Error.
 */
export function expectCancelBeforePrimary(container: HTMLElement): void {
  const owner = container.tagName.toLowerCase();
  const blocks = Array.from(container.querySelectorAll<HTMLElement>('.form-actions')).filter(
    (block) => findCancel(block) !== null && block.querySelector('.button-primary') !== null
  );

  if (blocks.length === 0) {
    throw new Error(`${owner}: nenhum .form-actions com Cancelar e .button-primary foi encontrado.`);
  }

  for (const block of blocks) {
    const cancel = findCancel(block)!;
    const primary = block.querySelector<HTMLButtonElement>('.button-primary')!;
    const label = primary.textContent?.trim() ?? '';

    if (!(cancel.compareDocumentPosition(primary) & Node.DOCUMENT_POSITION_FOLLOWING)) {
      throw new Error(`${owner}: Cancelar deveria vir antes de "${label}" no rodapé do diálogo.`);
    }

    if (cancel.getAttribute('type') !== 'button') {
      throw new Error(`${owner}: Cancelar deveria ter type="button".`);
    }

    const form = block.closest('form');
    if (form) {
      const submits = form.querySelectorAll('[type="submit"]');
      if (submits.length !== 1 || submits[0] !== primary) {
        throw new Error(`${owner}: o formulário deveria ter um único [type="submit"], o botão "${label}".`);
      }
    }
  }
}

function findCancel(block: HTMLElement): HTMLButtonElement | null {
  return Array.from(block.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === 'Cancelar'
  ) ?? null;
}
