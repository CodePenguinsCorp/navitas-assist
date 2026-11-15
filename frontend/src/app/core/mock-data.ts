import {
  NavGroup,
  RmaPriority,
  RmaStatus,
  WarrantyStatus
} from './models';

export const RMA_STATUS_FLOW: RmaStatus[] = [
  'RECEIVED',
  'TRIAGE',
  'IN_DIAGNOSIS',
  'WAITING_PART',
  'IN_REPAIR',
  'IN_TESTS',
  'COMPLETED',
  'RETURNED',
  'IRREPARABLE'
];

export const CLOSED_RMA_STATUSES: RmaStatus[] = ['COMPLETED', 'RETURNED', 'IRREPARABLE'];

export const RMA_STATUS_LABELS: Record<RmaStatus, string> = {
  RECEIVED: 'Recebida',
  TRIAGE: 'Triagem',
  IN_DIAGNOSIS: 'Diagnóstico',
  WAITING_PART: 'Aguardando peça',
  IN_REPAIR: 'Reparo',
  IN_TESTS: 'Testes',
  COMPLETED: 'Concluída',
  RETURNED: 'Devolvida',
  IRREPARABLE: 'Sem conserto'
};

export const RMA_PRIORITY_LABELS: Record<RmaPriority, string> = {
  HIGH: 'Alta',
  MEDIUM: 'Média',
  LOW: 'Baixa'
};

export const WARRANTY_STATUS_LABELS: Record<WarrantyStatus, string> = {
  [WarrantyStatus.PENDING]: 'Pendente',
  [WarrantyStatus.IN_WARRANTY]: 'Em garantia',
  [WarrantyStatus.OUT_OF_WARRANTY]: 'Fora de garantia'
};

/** Tamanho máximo do tipo de falha e da causa provável (texto livre, como a categoria do produto). */
export const FAILURE_TEXT_MAX_LENGTH = 80;

/** Sugestões iniciais; as já usadas em outros diagnósticos são somadas a elas. */
export const FAILURE_TYPE_SUGGESTIONS: readonly string[] = [
  'Fonte de alimentação', 'PWM', 'Sensor', 'Comunicação', 'Display', 'Firmware', 'Mecânica', 'Outro'
];

export const FAILURE_CAUSE_SUGGESTIONS: readonly string[] = [
  'Componente', 'Solda', 'Umidade', 'Sobrecarga', 'ESD', 'Uso incorreto', 'Outro'
];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { label: 'Dashboard', route: '/dashboard', icon: 'dashboard', permissions: ['rma.ver'] },
      { label: 'Ordens de serviço', route: '/rmas', icon: 'clipboard', permissions: ['rma.ver'] },
      { label: 'Kanban', route: '/kanban', icon: 'columns', permissions: ['rma.ver'] },
      { label: 'Notificações', route: '/notificacoes', icon: 'bell', permissions: [] },
      { label: 'Peças', route: '/pecas', icon: 'chip', permissions: ['pecas.ver'] }
    ]
  },
  {
    label: 'Cadastros',
    items: [
      { label: 'Clientes', route: '/clientes', icon: 'building', permissions: ['cadastros.ver', 'cadastros.editar'], alternativePermissions: ['cadastros.importar'] },
      { label: 'Produtos', route: '/produtos', icon: 'box', permissions: ['cadastros.ver', 'cadastros.editar'], alternativePermissions: ['cadastros.importar'] },
      { label: 'Protocolos', route: '/protocolos', icon: 'checklist', permissions: ['protocolos.ver', 'protocolos.catalogo'] },
      { label: 'Usuários', route: '/usuarios', icon: 'users', permissions: ['usuarios.gerir'] },
      { label: 'Perfis', route: '/perfis', icon: 'shield', permissions: ['perfis.gerir'] },
      { label: 'Auditoria', route: '/auditoria', icon: 'checklist', permissions: ['auditoria.ver'] }
    ]
  },
  {
    label: 'Relatórios',
    items: [
      { label: 'Relatórios', route: '/relatorios', icon: 'chart', permissions: ['relatorios.ver'] }
    ]
  }
];

export const INTERVENTION_TYPE_SUGGESTIONS: readonly string[] = [
  'Ressolda', 'Limpeza', 'Regravação', 'Atualização de firmware', 'Troca de chicote', 'Outro'
];
export const INTERVENTION_TYPE_MAX_LENGTH = 80;

export const PART_UNIT_SUGGESTIONS: readonly string[] = ['UN', 'PC', 'PAR', 'KIT', 'CX', 'KG', 'G', 'M', 'CM', 'MM', 'L', 'ML'];
