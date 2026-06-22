import {
  AccessMatrixItem,
  FailureCause,
  FailureType,
  ModuleCard,
  NavGroup,
  ReportCard,
  RmaPriority,
  RmaStatus,
  UserRole,
  WarrantyStatus
} from './models';

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  TECHNICIAN: 'Técnico',
  SERVICE_DESK: 'Atendimento',
  VIEWER: 'Consulta'
};

export const ROLE_OPTIONS: UserRole[] = ['ADMIN', 'TECHNICIAN', 'SERVICE_DESK', 'VIEWER'];

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
  PENDING: 'Pendente',
  IN_WARRANTY: 'Em garantia',
  OUT_OF_WARRANTY: 'Fora de garantia'
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
      {
        label: 'Dashboard',
        route: '/dashboard',
        roles: ['ADMIN', 'TECHNICIAN', 'SERVICE_DESK', 'VIEWER']
      },
      {
        label: 'RMAs',
        route: '/rmas',
        roles: ['ADMIN', 'TECHNICIAN', 'SERVICE_DESK', 'VIEWER']
      }
    ]
  },
  {
    label: 'Cadastros',
    items: [
      {
        label: 'Clientes',
        route: '/clientes',
        roles: ['ADMIN', 'SERVICE_DESK']
      },
      {
        label: 'Produtos',
        route: '/produtos',
        roles: ['ADMIN', 'SERVICE_DESK']
      },
      {
        label: 'Usuários',
        route: '/usuarios',
        roles: ['ADMIN']
      }
    ]
  },
  {
    label: 'Relatórios',
    items: [
      {
        label: 'Relatórios',
        route: '/relatorios',
        roles: ['ADMIN', 'TECHNICIAN', 'VIEWER']
      }
    ]
  }
];

export const MODULE_CARDS: ModuleCard[] = [
  {
    title: 'RMAs',
    summary: 'Fluxo operacional.',
    route: '/rmas',
    tag: 'Operação',
    roles: ['ADMIN', 'TECHNICIAN', 'SERVICE_DESK', 'VIEWER']
  },
  {
    title: 'Clientes',
    summary: 'Base comercial.',
    route: '/clientes',
    tag: 'Cadastro',
    roles: ['ADMIN', 'SERVICE_DESK']
  },
  {
    title: 'Produtos',
    summary: 'Catálogo técnico.',
    route: '/produtos',
    tag: 'Cadastro',
    roles: ['ADMIN', 'SERVICE_DESK']
  },
  {
    title: 'Usuários',
    summary: 'Perfis e acesso.',
    route: '/usuarios',
    tag: 'Administração',
    roles: ['ADMIN']
  },
  {
    title: 'Relatórios',
    summary: 'Laudos e auditoria.',
    route: '/relatorios',
    tag: 'Consulta',
    roles: ['ADMIN', 'TECHNICIAN', 'VIEWER']
  }
];

export const REPORT_CARDS: ReportCard[] = [
  {
    title: 'Laudo técnico',
    description: 'Diagnóstico e parecer final.',
    frequency: 'Sob demanda',
    format: 'PDF'
  },
  {
    title: 'Aging de RMAs',
    description: 'Fila e tempo por etapa.',
    frequency: 'Diário',
    format: 'Indicador'
  },
  {
    title: 'Garantia',
    description: 'Overrides e justificativas.',
    frequency: 'Semanal',
    format: 'Auditoria'
  },
  {
    title: 'Devoluções',
    description: 'Concluídos e enviados.',
    frequency: 'Diário',
    format: 'Controle'
  }
];

export const SECURITY_POLICIES = [
  'Login por perfil.',
  'Validação de campos obrigatórios.',
  'Rastreabilidade de alterações.',
  'Controle de anexos.',
  'Acesso seguro por HTTPS.'
];

export const ACCESS_MATRIX: AccessMatrixItem[] = [
  {
    role: 'ADMIN',
    access: 'Acesso total.'
  },
  {
    role: 'TECHNICIAN',
    access: 'Diagnóstico e laudos.'
  },
  {
    role: 'SERVICE_DESK',
    access: 'Abertura e acompanhamento.'
  },
  {
    role: 'VIEWER',
    access: 'Consulta e indicadores.'
  }
];
