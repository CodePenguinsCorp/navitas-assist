import { Provider, Signal, isSignal, signal } from '@angular/core';
import { Permission } from '../core/permissions';
import { PERMISSION_SOURCE } from '../core/services/permission.service';

export type TestProfileCode = 'ADMIN' | 'SERVICE_DESK' | 'TECHNICIAN' | 'VIEWER';

/** Conjuntos de permissões usados somente como cenários de teste. */
export const TEST_PROFILE_PERMISSIONS: Readonly<Record<TestProfileCode, readonly Permission[]>> = {
  ADMIN: [
    'rma.ver', 'rma.abrir', 'rma.editar', 'rma.status', 'rma.responsavel', 'rma.atribuivel', 'rma.diagnosticar', 'rma.impedimentos',
    'cadastros.ver', 'cadastros.editar', 'cadastros.importar', 'pecas.ver', 'pecas.movimentar', 'pecas.usar', 'protocolos.ver',
    'protocolos.executar', 'protocolos.catalogo', 'relatorios.ver', 'usuarios.gerir', 'perfis.gerir',
    'notificacoes.regras', 'auditoria.ver'
  ],
  SERVICE_DESK: [
    'rma.ver', 'rma.abrir', 'rma.editar', 'rma.status', 'rma.responsavel', 'rma.impedimentos', 'cadastros.ver',
    'cadastros.editar', 'pecas.ver', 'pecas.movimentar', 'protocolos.ver'
  ],
  TECHNICIAN: [
    'rma.ver', 'rma.status', 'rma.atribuivel', 'rma.diagnosticar', 'rma.impedimentos', 'cadastros.ver', 'pecas.ver',
    'pecas.usar', 'protocolos.ver', 'protocolos.executar', 'relatorios.ver'
  ],
  VIEWER: ['rma.ver', 'cadastros.ver', 'pecas.ver', 'protocolos.ver', 'relatorios.ver']
};

export function profilePermissions(code: TestProfileCode): readonly Permission[] {
  return TEST_PROFILE_PERMISSIONS[code];
}

/** Fixa as permissões vistas pelo `PermissionService`, sem depender do `AuthService` do teste. */
export function providePermissions(permissions: readonly Permission[] | Signal<readonly Permission[]>): Provider {
  return { provide: PERMISSION_SOURCE, useValue: isSignal(permissions) ? permissions : signal(permissions).asReadonly() };
}
