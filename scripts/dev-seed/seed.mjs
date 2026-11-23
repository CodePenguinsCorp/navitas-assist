// Node 18+, somente APIs nativas. Execute uma instância por vez.
const base = new URL(process.env.SEED_BASE_URL || 'http://localhost:4201');
const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
if (!['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) {
  throw new Error('SEED_BASE_URL deve ser uma origem HTTP(S), sem caminho ou credenciais.');
}
if (!local && (process.env.SEED_ALLOW_REMOTE !== '1' || base.protocol !== 'https:' || !process.env.SEED_USER?.trim() || !process.env.SEED_PASSWORD?.trim())) {
  throw new Error('Carga remota exige HTTPS, SEED_ALLOW_REMOTE=1, SEED_USER e SEED_PASSWORD explícitos. Use somente ambiente de testes.');
}
const password = 'DemoNavitas123!';
const cookies = new Map();
const counts = {};
function count(kind, created) {
  const row = counts[kind] ||= { criados: 0, reutilizados: 0 };
  row[created ? 'criados' : 'reutilizados']++;
}

async function api(path, method = 'GET', body, allowUnauthorized = false) {
  const headers = { Origin: base.origin, Accept: 'application/json' };
  if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const token = cookies.get('XSRF-TOKEN');
    if (!token) throw new Error('Cookie XSRF-TOKEN ausente; nenhuma escrita enviada.');
    headers['X-XSRF-TOKEN'] = decodeURIComponent(token);
  }
  const response = await fetch(new URL(path, base), {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  // Node 18 pode juntar Set-Cookie; a separação não pode quebrar a data de Expires.
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') || '').split(/,(?=\s*[^\s;,=]+=)/);
  for (const raw of setCookies) {
    const pair = raw.trim().split(';', 1)[0];
    const equals = pair.indexOf('=');
    if (equals < 1) continue;
    const name = pair.slice(0, equals);
    const value = pair.slice(equals + 1);
    if (!value || /;\s*max-age=0(?:;|$)/i.test(raw)) cookies.delete(name);
    else cookies.set(name, value);
  }
  const text = await response.text();
  if (allowUnauthorized && response.status === 401) return null;
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : null;
}

async function list(path) {
  const rows = [];
  for (let page = 0; ; page++) {
    const result = await api(`${path}${path.includes('?') ? '&' : '?'}page=${page}&size=100`);
    if (Array.isArray(result)) return result;
    if (!Array.isArray(result?.content) || !Number.isInteger(result.totalPages)) throw new Error(`Paginação inesperada: ${path}`);
    rows.push(...result.content);
    if (page + 1 >= result.totalPages) return rows;
  }
}

async function ensure(kind, path, rows, field, body) {
  let row = rows.find(item => item[field] === body[field]);
  count(kind, !row);
  if (!row) {
    row = await api(path, 'POST', body);
    rows.push(row);
  }
  return row;
}

async function main() {
  console.log(`Carga de demonstração ${local ? 'LOCAL' : 'REMOTA (ambiente de testes)'}: ${base.origin}`);
  await api('/api/auth/me', 'GET', undefined, true);
  if (!cookies.has('XSRF-TOKEN')) await api('/api/auth/csrf');
  await api('/api/auth/login', 'POST', {
    username: process.env.SEED_USER || 'admin', password: process.env.SEED_PASSWORD || 'admin123',
  });
  await api('/api/auth/me');
  if (!cookies.has('XSRF-TOKEN')) await api('/api/auth/csrf');

  const profiles = await api('/api/profiles/options');
  const demoProfiles = {
    Atendimento: ['rma.ver', 'rma.abrir', 'rma.editar', 'rma.status', 'rma.responsavel', 'rma.impedimentos',
      'cadastros.ver', 'cadastros.editar', 'pecas.ver', 'pecas.movimentar', 'protocolos.ver'],
    Técnico: ['rma.ver', 'rma.status', 'rma.atribuivel', 'rma.diagnosticar', 'rma.impedimentos',
      'cadastros.ver', 'pecas.ver', 'pecas.usar', 'protocolos.ver', 'protocolos.executar', 'relatorios.ver'],
    Consulta: ['rma.ver', 'cadastros.ver', 'pecas.ver', 'protocolos.ver', 'relatorios.ver'],
  };
  for (const [name, permissions] of Object.entries(demoProfiles)) {
    const existing = profiles.find(profile => profile.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
    count('Perfis', !existing);
    if (!existing) profiles.push(await api('/api/profiles', 'POST', { name, permissions }));
  }
  const users = await list('/api/users');
  const demoUsers = [];
  for (const [username, fullName, profile] of [
    ['demo.atendimento', 'Mariana Costa [DEMO]', 'Atendimento'],
    ['demo.tecnico', 'Rafael Almeida [DEMO]', 'Técnico'],
    ['demo.consulta', 'Camila Santos [DEMO]', 'Consulta'],
  ]) {
    demoUsers.push(await ensure('Usuários', '/api/users', users, 'username', {
      username, fullName, password, profileId: profiles.find(p => p.name.toLocaleLowerCase('pt-BR') === profile.toLocaleLowerCase('pt-BR')).id, extraPermissions: [], active: true,
    }));
  }
  const clients = await list('/api/clients');
  const demoClients = [];
  for (const [name, city, phone] of [
    ['Horizonte Automação Industrial Ltda.', 'Campinas - SP', '(19) 3200-0101'],
    ['Rede Aurora Comércio de Eletrônicos Ltda.', 'Curitiba - PR', '(41) 3300-0202'],
    ['Vale Verde Soluções em Energia Ltda.', 'Belo Horizonte - MG', '(31) 3400-0303'],
  ]) {
    demoClients.push(await ensure('Clientes', '/api/clients', clients, 'legalName', {
      legalName: `[DEMO] ${name}`, tradeName: `[DEMO] ${name.split(' ')[0]}`,
      email: `contato${demoClients.length + 1}@example.com`, phone, address: `Rua das Indústrias, 120, ${city}`,
      notes: 'Empresa fictícia para demonstração local.',
    }));
  }
  const products = await list('/api/products');
  const demoProducts = [];
  for (const [sku, name, category] of [
    ['DEMO-CTRL24', 'Controlador industrial 24 V', 'Automação'],
    ['DEMO-INV1500', 'Inversor senoidal 1500 W', 'Energia'],
    ['DEMO-SW8POE', 'Switch gerenciável 8 portas PoE', 'Redes'],
  ]) {
    demoProducts.push(await ensure('Produtos', '/api/products', products, 'sku', {
      sku, name: `[DEMO] ${name}`, category, hardwareVersion: 'Rev. B', firmwareVersion: '2.4.1',
      defaultWarrantyMonths: 12, technicalNotes: 'Equipamento fictício para bancada de demonstração.',
    }));
  }
  const parts = await api('/api/parts');
  const demoParts = [];
  for (const [code, name, unitCost] of [
    ['DEMO-CAP470', 'Capacitor eletrolítico 470 µF / 35 V', 4.90],
    ['DEMO-FAN80', 'Ventoinha 80 mm / 24 V', 38.50],
    ['DEMO-RJ45', 'Conector RJ45 blindado', 12.80],
  ]) {
    const part = await ensure('Peças', '/api/parts', parts, 'code', {
      code, name: `[DEMO] ${name}`, unit: 'UN', location: 'Bancada DEMO / A1', minimumStock: 5, unitCost, active: true,
    });
    demoParts.push(part);
    const reason = `[DEMO] Estoque inicial ${code}`;
    const exists = (await api(`/api/parts/${part.id}/movements`)).some(m => m.reason === reason);
    if (!exists) await api(`/api/parts/${part.id}/movements`, 'POST', { type: 'ENTRY', quantity: 20, reason });
    count('Entradas de estoque', !exists);
  }
  const templates = await api('/api/protocols/templates');
  const template = await ensure('Modelos de protocolo', '/api/protocols/templates', templates, 'name', {
    name: '[DEMO] Inspeção elétrica e funcional', productId: demoProducts[0].id, active: true, blockedStatuses: [],
    items: [
      { stepName: 'Inspeção', title: 'Conferir conectores e integridade da placa', type: 'CHECK', required: true, evidenceRequired: false },
      { stepName: 'Alimentação', title: 'Medir tensão de alimentação', type: 'MEASUREMENT', required: true, unit: 'V', decimalPlaces: 2, minValue: 23, maxValue: 25, evidenceRequired: false },
    ],
  });

  const rmas = await list('/api/rmas');
  const stages = ['RECEIVED', 'TRIAGE', 'IN_DIAGNOSIS', 'WAITING_PART', 'IN_REPAIR', 'IN_TESTS', 'COMPLETED'];
  const failures = ['Não liga após oscilação de energia.', 'Reinicia durante operação contínua.', 'Portas de rede apresentam desconexões intermitentes.'];
  // Dia civil de São Paulo (não o UTC): à noite o UTC já está no dia seguinte e a API recusa data de entrada futura.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const date = daysAgo => {
    const day = new Date(`${today}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - daysAgo);
    return day.toISOString().slice(0, 10);
  };
  for (let i = 0; i < stages.length; i++) {
    const serialNumber = `DEMO-SN-${String(i + 1).padStart(4, '0')}`;
    let rma = rmas.find(r => r.items.some(item => item.serialNumber === serialNumber));
    const created = !rma;
    count('ordens de serviço', created);
    if (rma && !rma.statusHistory) rma = await api(`/api/rmas/${rma.id}`);
    if (!rma) {
      rma = await api('/api/rmas', 'POST', {
        clientId: demoClients[i % 3].id,
        items: [{ productId: demoProducts[i % 3].id, serialNumber, batchNumber: `DEMO-LT-${i % 3 + 1}`, manufacturedAt: date(180) }],
        purchaseDate: date(90), purchaseDateUnknown: false, entryDate: date(10 - i), invoiceNumber: `DEMO-NF-${1001 + i}`,
        reportedFailure: `[DEMO] ${failures[i % 3]}`, receivedAccessories: 'Fonte e cabo de alimentação.',
        physicalCondition: 'Gabinete íntegro, leves marcas de uso.', priority: ['LOW', 'MEDIUM', 'HIGH'][i % 3],
      });
      rmas.push(rma);
    }
    const path = `/api/rmas/${rma.id}`;
    // Retoma somente etapas nunca aplicadas; preserva alterações manuais posteriores.
    if (created || (rma.statusHistory.every(h => h.status !== stages[i]) && stages.indexOf(rma.status) < i)) {
      for (const status of stages.slice(stages.indexOf(rma.status) + 1, i + 1)) {
        rma = await api(`${path}/status`, 'PATCH', { status, note: '[DEMO] Evolução do atendimento de bancada.' });
      }
    }
    if (!rma.assigneeId && i >= 2) await api(`${path}/assignee`, 'PATCH', { assigneeId: demoUsers[1].id });
    if ([2, 3].includes(i) && !rma.blockHistory.length) {
      await api(`${path}/blocks`, 'POST', { reason: i === 2 ? '[DEMO] Aguardando autorização do orçamento.' : '[DEMO] Aguardando componente do fornecedor.', category: i === 2 ? 'Aprovação do cliente' : 'Peças' });
      count('Impedimentos', true);
    }
    if ([3, 4].includes(i)) {
      const { usages } = await api(`${path}/parts`);
      const notes = `[DEMO] Uso ${serialNumber}`;
      const exists = usages.some(u => u.notes === notes);
      if (!exists && !['COMPLETED', 'RETURNED', 'IRREPARABLE'].includes(rma.status)) {
        await api(`${path}/parts/usages`, 'POST', { partId: demoParts[i % 3].id, quantity: 1, replacementReason: 'Falha identificada na bancada', componentBatch: null, notes });
        count('Usos de peça', true);
      } else count('Usos de peça', false);
    }
    if ([0, 3, 6].includes(i)) {
      const executionPath = `/api/protocols/rmas/${rma.id}/executions`;
      let execution = (await api(executionPath)).find(e => e.templateId === template.id);
      count('Execuções de protocolo', !execution);
      if (!execution) execution = await api(executionPath, 'POST', { templateId: template.id });
      if (i === 6 && execution.status === 'IN_PROGRESS') {
        for (const { item, latest } of execution.items) {
          if (!latest) await api(`/api/protocols/executions/${execution.id}/items/${item.id}/results`, 'POST', {
            outcome: 'PASSED', ...(item.type === 'MEASUREMENT' ? { measuredValue: 24.1 } : {}),
          });
        }
        await api(`/api/protocols/executions/${execution.id}/complete`, 'POST');
      }
    }
    console.log(`${rma.code}: ${rma.status} - ${serialNumber}`);
  }
  const volume = Number.parseInt(process.env.SEED_VOLUME || '0', 10);
  if (volume > 0) {
    const technicians = [demoUsers[1]];
    const roles = ['Técnico', 'Atendimento', 'Consulta'];
    const names = ['Bruno Ferreira', 'Letícia Moreira', 'Diego Martins', 'Fernanda Lima', 'Gustavo Rocha', 'Helena Duarte', 'Igor Nogueira', 'Júlia Campos', 'Kléber Alves', 'Larissa Pinto', 'Marcos Teixeira', 'Natália Ribeiro'];
    for (let n = 0; n < names.length; n++) {
      const role = roles[n % roles.length];
      const user = await ensure('Usuários (volume)', '/api/users', users, 'username', {
        username: `demo.v${String(n + 1).padStart(2, '0')}`, fullName: `${names[n]} [DEMO]`, password,
        profileId: profiles.find(p => p.name.toLocaleLowerCase('pt-BR') === role.toLocaleLowerCase('pt-BR')).id, extraPermissions: [], active: true,
      });
      if (role === 'Técnico') technicians.push(user);
    }
    await seedVolume({ users, volume, demoClients, demoProducts, demoParts, technicians, rmas, stages, date, failures });
  }
  console.table(counts);
  console.log(`Usuários de demonstração: ${demoUsers.map(u => u.username).join(', ')}`);
  console.log(`Senha inicial dos usuários criados: ${password} (contas existentes não têm a senha alterada).`);
}

// Carga de volume (SEED_VOLUME=N): N OS extras com clientes e produtos extras, datas, etapas, prioridades,
// prazos, responsáveis e impedimentos variados, para testar listas, filtros, paginação e relatórios.
async function seedVolume({ users, volume, demoClients, demoProducts, demoParts, technicians, rmas, stages, date, failures }) {
  const extraClients = [...demoClients];
  const clientRows = await list('/api/clients');
  const cities = ['São Paulo - SP', 'Rio de Janeiro - RJ', 'Porto Alegre - RS', 'Recife - PE', 'Goiânia - GO', 'Joinville - SC', 'Salvador - BA', 'Londrina - PR'];
  const clientTotal = Math.max(8, Math.ceil(volume / 2));
  for (let n = 1; n <= clientTotal; n++) {
    const legalName = `[DEMO] Cliente Volume ${String(n).padStart(3, '0')} Ltda.`;
    extraClients.push(await ensure('Clientes (volume)', '/api/clients', clientRows, 'legalName', {
      legalName, tradeName: `[DEMO] Volume ${String(n).padStart(3, '0')}`, email: `volume${n}@example.com`,
      phone: `(11) 4000-${String(1000 + n).slice(-4)}`, address: `Av. Central, ${100 + n}, ${cities[n % cities.length]}`,
      notes: 'Empresa fictícia para teste de volume.',
    }));
  }
  const extraProducts = [...demoProducts];
  const productRows = await list('/api/products');
  const categories = ['Automação', 'Energia', 'Redes', 'Sensores', 'Fontes'];
  const productTotal = Math.max(8, Math.ceil(volume / 2));
  for (let n = 1; n <= productTotal; n++) {
    extraProducts.push(await ensure('Produtos (volume)', '/api/products', productRows, 'sku', {
      sku: `DEMO-V${String(n).padStart(3, '0')}`, name: `[DEMO] Equipamento Volume ${String(n).padStart(3, '0')}`,
      category: categories[n % categories.length], hardwareVersion: `Rev. ${'ABCD'[n % 4]}`, firmwareVersion: `3.${n % 10}.0`,
      defaultWarrantyMonths: [6, 12, 18, 24][n % 4], technicalNotes: 'Equipamento fictício para teste de volume.',
    }));
  }
  const volumeParts = [...demoParts];
  const partRows = await api('/api/parts');
  const partKinds = ['Capacitor', 'Resistor', 'Ventoinha', 'Conector', 'Fusível', 'Relé', 'Display', 'Sensor', 'Cabo', 'Chicote'];
  const partTotal = Math.max(15, Math.ceil(volume / 2));
  for (let n = 1; n <= partTotal; n++) {
    const code = `DEMO-VP${String(n).padStart(3, '0')}`;
    const part = await ensure('Peças (volume)', '/api/parts', partRows, 'code', {
      code, name: `[DEMO] ${partKinds[n % partKinds.length]} modelo ${n}`, unit: n % 7 === 0 ? 'M' : 'UN',
      location: `Estoque DEMO / ${'ABCD'[n % 4]}${1 + (n % 9)}`, minimumStock: 5 + (n % 4) * 5, unitCost: Number((2 + (n * 3.37) % 90).toFixed(2)), active: n % 13 !== 0,
    });
    volumeParts.push(part);
    const reason = `[DEMO] Estoque inicial ${code}`;
    if (!(await api(`/api/parts/${part.id}/movements`)).some(m => m.reason === reason)) {
      await api(`/api/parts/${part.id}/movements`, 'POST', { type: 'ENTRY', quantity: n % 5 === 0 ? 3 : 10 + (n % 6) * 10, reason });
      count('Movimentos de estoque (volume)', true);
    }
  }
  const templates = await api('/api/protocols/templates');
  const volumeTemplates = [];
  for (let n = 1; n <= 8; n++) {
    volumeTemplates.push(await ensure('Modelos de protocolo (volume)', '/api/protocols/templates', templates, 'name', {
      name: `[DEMO] Protocolo de ${['bancada', 'burn-in', 'calibração', 'segurança elétrica', 'comunicação', 'firmware', 'inspeção visual', 'teste final'][n - 1]}`,
      productId: extraProducts[n % extraProducts.length].id, active: n !== 8, blockedStatuses: [],
      items: [
        { stepName: 'Preparação', title: `Conferir identificação do equipamento (${n})`, type: 'CHECK', required: true, evidenceRequired: false },
        { stepName: 'Medições', title: `Medir tensão de saída (${n})`, type: 'MEASUREMENT', required: n % 2 === 0, unit: 'V', decimalPlaces: 2, minValue: 11, maxValue: 13, evidenceRequired: false },
        { stepName: 'Fechamento', title: `Registrar observações finais (${n})`, type: 'CHECK', required: false, evidenceRequired: false },
      ],
    }));
  }
  // Modelos por categoria (sem produto): garantem que toda OS do volume tenha ao menos um modelo aplicável.
  for (const category of categories) {
    volumeTemplates.push(await ensure('Modelos de protocolo (volume)', '/api/protocols/templates', templates, 'name', {
      name: `[DEMO] Protocolo geral de ${category}`, category, active: true, blockedStatuses: [],
      items: [
        { stepName: 'Preparação', title: `Conferir identificação do equipamento (${category})`, type: 'CHECK', required: true, evidenceRequired: false },
        { stepName: 'Fechamento', title: 'Registrar observações finais', type: 'CHECK', required: false, evidenceRequired: false },
      ],
    }));
  }
  const priorities = ['LOW', 'MEDIUM', 'HIGH'];
  for (let i = 0; i < volume; i++) {
    const serialNumber = `DEMO-V-${String(i + 1).padStart(4, '0')}`;
    let rma = rmas.find(r => r.items.some(item => item.serialNumber === serialNumber));
    const created = !rma;
    count('OS (volume)', created);
    const target = stages[(i * 3 + Math.floor(i / 7)) % stages.length];
    const entryAgo = (i * 7) % 100;
    if (!rma) {
      rma = await api('/api/rmas', 'POST', {
        clientId: extraClients[i % extraClients.length].id,
        items: [{ productId: extraProducts[(i * 2) % extraProducts.length].id, serialNumber, batchNumber: `DEMO-V-LT-${i % 9 + 1}`, manufacturedAt: date(900) }],
        purchaseDate: date(entryAgo + 20 + (i * 37) % 700), purchaseDateUnknown: false, entryDate: date(entryAgo),
        invoiceNumber: `DEMO-NFV-${2000 + i}`, reportedFailure: `[DEMO] ${failures[i % 3]} (caso ${i + 1})`,
        receivedAccessories: i % 3 === 0 ? 'Fonte e cabo de alimentação.' : 'Sem acessórios.',
        physicalCondition: i % 4 === 0 ? 'Gabinete com marcas de queda.' : 'Gabinete íntegro.', priority: priorities[i % 3],
      });
      rmas.push(rma);
    }
    const path = `/api/rmas/${rma.id}`;
    if (created) {
      for (const status of stages.slice(stages.indexOf(rma.status) + 1, stages.indexOf(target) + 1)) {
        rma = await api(`${path}/status`, 'PATCH', { status, note: '[DEMO] Evolução (volume).' });
      }
      if (i % 5 !== 4) rma = await api(path, 'PUT', { dueDate: date(entryAgo - (5 + (i * 11) % 45)) });
      if (i % 3 !== 0 && stages.indexOf(target) >= 2) await api(`${path}/assignee`, 'PATCH', { assigneeId: technicians[i % technicians.length].id });
      if (i % 11 === 5 && !['COMPLETED'].includes(rma.status)) {
        await api(`${path}/blocks`, 'POST', { reason: '[DEMO] Aguardando retorno do cliente (volume).', category: 'Aprovação do cliente' });
        count('Impedimentos (volume)', true);
      }
      const stageIdx = stages.indexOf(target);
      if (stageIdx >= 2) {
        await api(`${path}/diagnosis`, 'PUT', {
          foundFailure: `[DEMO] ${['Capacitor de saída estufado.', 'Trilha rompida próxima ao conector.', 'Firmware corrompido após queda de energia.', 'Sensor fora de calibração.', 'Fonte com ripple elevado.'][i % 5]}`,
          failureType: ['Fonte de alimentação', 'PWM', 'Sensor', 'Comunicação', 'Display', 'Firmware', 'Mecânica', 'Outro'][i % 8],
          probableCause: ['Componente defeituoso', 'Solda', 'Umidade', 'Sobrecarga', 'Descarga eletrostática', 'Uso incorreto', 'Outra'][i % 7],
          notes: i % 2 === 0 ? 'Necessária troca de componente.' : null, diagnosedAt: date(Math.max(0, entryAgo - 1)),
          technicianName: technicians[i % technicians.length].fullName,
        });
        count('Diagnósticos (volume)', true);
      }
      if (stageIdx >= 4 && stageIdx < 6) {
        for (let k = 0; k < 1 + (i % 3); k++) {
          await api(`${path}/repair/interventions`, 'POST', {
            type: ['Ressolda', 'Limpeza', 'Reprogramação', 'Atualização de firmware', 'Troca de chicote', 'Outro'][(i + k) % 6],
            description: `[DEMO] Reparo ${k + 1} do caso ${i + 1}.`, performedOn: date(Math.max(0, entryAgo - 1 - k)), hours: [0.5, 1, 1.5, 2.25, 3][(i + k) % 5],
          });
          count('Reparos (volume)', true);
        }
        if (i % 4 === 0) {
          await api(`${path}/repair/external-components`, 'POST', {
            code: `EXT-${i + 1}`, description: `[DEMO] Componente externo ${i + 1}`, quantity: 1 + (i % 3), unit: 'un', replacementReason: 'Componente danificado, sem item no estoque.',
          });
          count('Componentes externos (volume)', true);
        }
      }
      if ([3, 4].includes(stageIdx) && i % 2 === 0) {
        try {
          await api(`${path}/parts/usages`, 'POST', { partId: volumeParts[(i % (volumeParts.length - 1)) + 1].id, quantity: 1 + (i % 2), replacementReason: 'Falha identificada na bancada', componentBatch: null, notes: `[DEMO] Uso volume ${serialNumber}` });
          count('Usos de peça (volume)', true);
        } catch (error) {
          count('Usos de peça (volume)', false);
          console.warn(`  aviso: uso de peça não registrado para ${serialNumber}: ${error.message}`);
        }
      }
      if (i % 4 === 1) {
        // A API só aceita modelo ativo que se aplique à OS: o do mesmo produto ou, sem produto, o da mesma categoria.
        const product = extraProducts.find(p => p.sku === rma.items[0].productSku) ?? extraProducts[(i * 2) % extraProducts.length];
        const applicable = volumeTemplates.filter(t => t.active && (t.productId ? t.productId === product.id : t.category?.toLowerCase() === product.category?.toLowerCase()));
        if (!applicable.length) {
          count('Execuções de protocolo (volume)', false);
          console.warn(`  aviso: nenhum modelo de protocolo aplicável a ${serialNumber} (${product.sku}, ${product.category}).`);
        } else {
          try {
            await api(`/api/protocols/rmas/${rma.id}/executions`, 'POST', { templateId: applicable[i % applicable.length].id });
            count('Execuções de protocolo (volume)', true);
          } catch (error) {
            count('Execuções de protocolo (volume)', false);
            console.warn(`  aviso: execução de protocolo não criada para ${serialNumber}: ${error.message}`);
          }
        }
      }
    }
    if ((i + 1) % 20 === 0) console.log(`  volume: ${i + 1}/${volume} OS`);
  }
}

main().catch(error => {
  console.error(`Carga interrompida: ${error.message}`);
  console.table(counts);
  console.error('Corrija a causa e execute novamente; os registros já gravados serão consultados e reutilizados.');
  process.exitCode = 1;
});
