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
  for (const name of ['Atendimento', 'Técnico', 'Consulta']) {
    if (!profiles.some(p => p.name === name)) throw new Error(`Perfil obrigatório ausente: ${name}`);
  }
  const users = await list('/api/users');
  const demoUsers = [];
  for (const [username, fullName, profile] of [
    ['demo.atendimento', 'Mariana Costa [DEMO]', 'Atendimento'],
    ['demo.tecnico', 'Rafael Almeida [DEMO]', 'Técnico'],
    ['demo.consulta', 'Camila Santos [DEMO]', 'Consulta'],
  ]) {
    demoUsers.push(await ensure('Usuários', '/api/users', users, 'username', {
      username, fullName, password, profileId: profiles.find(p => p.name === profile).id, extraPermissions: [], active: true,
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
  const date = daysAgo => {
    const now = new Date();
    now.setUTCDate(now.getUTCDate() - daysAgo);
    return now.toISOString().slice(0, 10);
  };
  for (let i = 0; i < stages.length; i++) {
    const serialNumber = `DEMO-SN-${String(i + 1).padStart(4, '0')}`;
    let rma = rmas.find(r => r.items.some(item => item.serialNumber === serialNumber));
    const created = !rma;
    count('ordens de serviço', created);
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
      const { reservations } = await api(`${path}/parts`);
      const note = `[DEMO] Reserva ${serialNumber}`;
      const exists = reservations.some(r => r.note === note);
      if (!exists && !['COMPLETED', 'RETURNED', 'IRREPARABLE'].includes(rma.status)) {
        await api(`${path}/parts`, 'POST', { partId: demoParts[i % 3].id, quantity: 1, note });
        count('Reservas', true);
      } else count('Reservas', false);
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
    console.log(`${rma.code}: ${rma.status} — ${serialNumber}`);
  }
  console.table(counts);
  console.log(`Usuários de demonstração: ${demoUsers.map(u => u.username).join(', ')}`);
  console.log(`Senha inicial dos usuários criados: ${password} (contas existentes não têm a senha alterada).`);
}

main().catch(error => {
  console.error(`Carga interrompida: ${error.message}`);
  console.table(counts);
  console.error('Corrija a causa e execute novamente; os registros já gravados serão consultados e reutilizados.');
  process.exitCode = 1;
});
