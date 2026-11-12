import {
  FailureCause,
  FailureType,
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
  RECEIVED: 'Recebido',
  TRIAGE: 'Triagem',
  IN_DIAGNOSIS: 'Diagnóstico',
  WAITING_PART: 'Aguardando peça',
  IN_REPAIR: 'Reparo',
  IN_TESTS: 'Testes',
  COMPLETED: 'Concluído',
  RETURNED: 'Devolvido',
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

export const FAILURE_TYPE_OPTIONS: FailureType[] = [
  'POWER_SUPPLY',
  'PWM',
  'SENSOR',
  'COMMUNICATION',
  'DISPLAY',
  'FIRMWARE',
  'MECHANICAL',
  'OTHER'
];

export const FAILURE_TYPE_LABELS: Record<FailureType, string> = {
  POWER_SUPPLY: 'Fonte',
  PWM: 'PWM',
  SENSOR: 'Sensor',
  COMMUNICATION: 'Comunicação',
  DISPLAY: 'Display',
  FIRMWARE: 'Firmware',
  MECHANICAL: 'Mecânica',
  OTHER: 'Outro'
};

export const FAILURE_CAUSE_OPTIONS: FailureCause[] = [
  'COMPONENT',
  'SOLDER',
  'HUMIDITY',
  'OVERLOAD',
  'ESD',
  'INCORRECT_USAGE',
  'OTHER'
];

export const FAILURE_CAUSE_LABELS: Record<FailureCause, string> = {
  COMPONENT: 'Componente',
  SOLDER: 'Solda',
  HUMIDITY: 'Umidade',
  OVERLOAD: 'Sobrecarga',
  ESD: 'ESD',
  INCORRECT_USAGE: 'Uso incorreto',
  OTHER: 'Outro'
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { label: 'Dashboard', route: '/dashboard', icon: 'dashboard', permissions: ['rma.ver'] },
      { label: 'RMAs', route: '/rmas', icon: 'clipboard', permissions: ['rma.ver'] },
      { label: 'Kanban', route: '/kanban', icon: 'columns', permissions: ['rma.ver'] },
      { label: 'Notificações', route: '/notificacoes', icon: 'bell', permissions: [] },
      { label: 'Peças', route: '/pecas', icon: 'wrench', permissions: ['pecas.ver'] }
    ]
  },
  {
    label: 'Cadastros',
    items: [
      { label: 'Clientes', route: '/clientes', icon: 'building', permissions: ['cadastros.ver', 'cadastros.editar'] },
      { label: 'Produtos', route: '/produtos', icon: 'box', permissions: ['cadastros.ver', 'cadastros.editar'] },
      { label: 'Protocolos', route: '/protocolos', icon: 'checklist', permissions: ['protocolos.ver', 'protocolos.catalogo'] },
      { label: 'Usuários', route: '/usuarios', icon: 'users', permissions: ['usuarios.gerir'] },
      { label: 'Perfis', route: '/perfis', icon: 'shield', permissions: ['perfis.gerir'] }
    ]
  },
  {
    label: 'Relatórios',
    items: [
      { label: 'Relatórios', route: '/relatorios', icon: 'chart', permissions: ['relatorios.ver'] }
    ]
  }
];
