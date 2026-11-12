import { Provider, Signal, isSignal, signal } from '@angular/core';
import { Permission } from '../core/permissions';
import { PERMISSION_SOURCE } from '../core/services/permission.service';

export type LegacyProfileCode = 'ADMIN' | 'SERVICE_DESK' | 'TECHNICIAN' | 'VIEWER';

/** Permissões dos 4 perfis migrados, copiadas da tabela da spec §3 (A = 19, S = 11, T = 11, V = 5). */
export const LEGACY_PROFILE_PERMISSIONS: Readonly<Record<LegacyProfileCode, readonly Permission[]>> = {
  ADMIN: [
    'rma.ver', 'rma.abrir', 'rma.editar', 'rma.status', 'rma.responsavel', 'rma.diagnosticar', 'rma.impedimentos',
    'cadastros.ver', 'cadastros.editar', 'pecas.ver', 'pecas.movimentar', 'pecas.reservar', 'protocolos.ver',
    'protocolos.executar', 'protocolos.catalogo', 'relatorios.ver', 'usuarios.gerir', 'perfis.gerir',
    'notificacoes.regras'
  ],
  SERVICE_DESK: [
    'rma.ver', 'rma.abrir', 'rma.editar', 'rma.status', 'rma.responsavel', 'rma.impedimentos', 'cadastros.ver',
    'cadastros.editar', 'pecas.ver', 'pecas.movimentar', 'protocolos.ver'
  ],
  TECHNICIAN: [
    'rma.ver', 'rma.status', 'rma.atribuivel', 'rma.diagnosticar', 'rma.impedimentos', 'cadastros.ver', 'pecas.ver',
    'pecas.reservar', 'protocolos.ver', 'protocolos.executar', 'relatorios.ver'
  ],
  VIEWER: ['rma.ver', 'cadastros.ver', 'pecas.ver', 'protocolos.ver', 'relatorios.ver']
};

export function profilePermissions(code: LegacyProfileCode): readonly Permission[] {
  return LEGACY_PROFILE_PERMISSIONS[code];
}

/** Fixa as permissões vistas pelo `PermissionService`, sem depender do `AuthService` do teste. */
export function providePermissions(permissions: readonly Permission[] | Signal<readonly Permission[]>): Provider {
  return { provide: PERMISSION_SOURCE, useValue: isSignal(permissions) ? permissions : signal(permissions).asReadonly() };
}
