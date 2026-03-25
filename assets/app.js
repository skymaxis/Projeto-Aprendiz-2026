import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const STORAGE_KEY = 'projeto_aprendiz_github_supabase_settings_v1';
const defaults = {
  supabaseUrl: '',
  supabaseAnon: '',
  ownerEmail: '',
  bucket: 'documentos-alunos',
  theme: 'light'
};

const pages = {
  dashboard: { title: 'Dashboard', desc: 'Indicadores executivos, ranking de igrejas e evolução das inscrições.' },
  alunos: { title: 'Alunos', desc: 'Cadastro completo, contatos, igreja, região e observações.' },
  turmas: { title: 'Turmas', desc: 'Capacidade, status e alunos vinculados por turma.' },
  aulas: { title: 'Aulas', desc: 'Planejamento, calendário e local das aulas.' },
  presencas: { title: 'Presenças', desc: 'Controle de presença com justificativa e frequência.' },
  permissoes: { title: 'Permissões', desc: 'Controle de acesso por e-mail e por módulo.' }
};

const state = {
  currentPage: 'dashboard',
  settings: loadSettings(),
  supabase: null,
  currentUser: null,
  currentProfile: null,
  demoMode: false,
  seedStudents: [],
  students: [],
  classes: [],
  lessons: [],
  attendance: [],
  allowedUsers: []
};

const $ = (selector) => document.querySelector(selector);
const uid = () => crypto.randomUUID();
const todayIso = () => new Date().toISOString().slice(0, 10);
const formatDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '—';
const formatDateTime = (value) => value ? new Date(value).toLocaleString('pt-BR') : '—';
const brToIso = (value) => {
  if (!value || !value.includes('/')) return '';
  const [d, m, y] = value.split('/');
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
};
const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
}

function setNotice(text) {
  $('#loginNotice').textContent = text;
}

function applyLoginConfigInputs() {
  $('#cfgSupabaseUrl').value = state.settings.supabaseUrl || '';
  $('#cfgSupabaseAnon').value = state.settings.supabaseAnon || '';
  $('#cfgOwnerEmail').value = state.settings.ownerEmail || '';
}

function readLoginConfigInputs() {
  state.settings.supabaseUrl = $('#cfgSupabaseUrl').value.trim();
  state.settings.supabaseAnon = $('#cfgSupabaseAnon').value.trim();
  state.settings.ownerEmail = $('#cfgOwnerEmail').value.trim();
  saveSettings();
}

function connectSupabase() {
  readLoginConfigInputs();
  if (!state.settings.supabaseUrl || !state.settings.supabaseAnon) return null;
  try {
    state.supabase = createClient(state.settings.supabaseUrl, state.settings.supabaseAnon, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    return state.supabase;
  } catch (error) {
    console.error(error);
    setNotice('Não foi possível conectar ao Supabase. Revise a URL e a anon key.');
    return null;
  }
}

async function loadSeedData() {
  if (state.seedStudents.length) return;
  const response = await fetch('./data/seed_students.json');
  state.seedStudents = await response.json();
}

function calcAge(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function ageBand(age) {
  if (age == null || Number.isNaN(age)) return 'Não informado';
  if (age <= 12) return 'Infantil';
  if (age <= 17) return 'Adolescente';
  if (age <= 29) return 'Jovem';
  if (age <= 59) return 'Adulto';
  return 'Sênior';
}

function normalizeStudent(student) {
  const dataNascimento = student.data_nascimento && student.data_nascimento.includes('/')
    ? brToIso(student.data_nascimento)
    : student.data_nascimento;
  const idade = calcAge(dataNascimento);
  const telefone = String(student.telefone || '').replace(/\D/g, '');
  const ddd = String(student.ddd || '').replace(/\D/g, '').slice(0, 2);
  const whatsapp = ddd && telefone ? `https://wa.me/55${ddd}${telefone}` : (student.whatsapp_url || '');
  return {
    ...student,
    data_nascimento: dataNascimento,
    idade,
    faixa_etaria: ageBand(idade),
    telefone,
    ddd,
    whatsapp_url: whatsapp,
    created_at: student.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function ensureOwnerPermission() {
  const email = (state.currentUser?.email || state.settings.ownerEmail || '').toLowerCase();
  if (!email) return;
  const found = state.allowedUsers.find(item => item.email?.toLowerCase() === email);
  if (found) {
    state.currentProfile = found;
    return;
  }
  const owner = {
    id: uid(),
    email,
    status: 'ativo',
    modules: {
      students: 'admin',
      classes: 'admin',
      lessons: 'admin',
      attendance: 'admin',
      dashboard: 'admin',
      permissions: 'admin'
    },
    created_at: new Date().toISOString()
  };
  state.allowedUsers.unshift(owner);
  state.currentProfile = owner;
}

function can(moduleKey) {
  if (state.demoMode) return true;
  if (!state.currentProfile) return false;
  return ['viewer', 'editor', 'admin'].includes(state.currentProfile.modules?.[moduleKey]);
}

function canEdit(moduleKey) {
  if (state.demoMode) return true;
  if (!state.currentProfile) return false;
  return ['editor', 'admin'].includes(state.currentProfile.modules?.[moduleKey]);
}

function canAdmin(moduleKey) {
  if (state.demoMode) return true;
  if (!state.currentProfile) return false;
  return state.currentProfile.modules?.[moduleKey] === 'admin';
}

async function checkSession() {
  if (!state.supabase) return null;
  const { data } = await state.supabase.auth.getSession();
  state.currentUser = data?.session?.user || null;
  return state.currentUser;
}

async function loginEmailPassword() {
  const supabase = connectSupabase();
  if (!supabase) return setNotice('Informe a URL e a anon key do Supabase.');
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return setNotice(error.message);
  await startApp(false);
}

async function sendMagicLink() {
  const supabase = connectSupabase();
  if (!supabase) return setNotice('Informe a URL e a anon key do Supabase.');
  const email = $('#loginEmail').value.trim();
  if (!email) return setNotice('Informe o e-mail para receber o link mágico.');
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
  setNotice(error ? error.message : 'Link mágico enviado. Verifique sua caixa de entrada.');
}

async function logout() {
  if (state.supabase) await state.supabase.auth.signOut();
  state.currentUser = null;
  state.currentProfile = null;
  $('#appRoot').classList.add('hidden');
  $('#loginScreen').classList.remove('hidden');
}

async function loadAll() {
  await loadSeedData();

  if (state.demoMode) {
    state.students = state.seedStudents.map(normalizeStudent);
    state.classes = [
      { id: uid(), nome: 'Turma Bateria Norte', igreja: 'Praia Da Costa 1', capacidade: 15, status: 'Ativa', descricao: 'Turma inicial', inscritos: [] },
      { id: uid(), nome: 'Turma Bateria Sul', igreja: 'Ataíde 3', capacidade: 18, status: 'Ativa', descricao: 'Turma intermediária', inscritos: [] }
    ];
    state.classes[0].inscritos = state.students.slice(0, 3).map(item => item.id);
    state.classes[1].inscritos = state.students.slice(3, 6).map(item => item.id);
    state.lessons = [
      { id: uid(), turma_id: state.classes[0].id, titulo: 'Fundamentos de ritmo', data: todayIso(), hora_inicio: '19:00', hora_fim: '20:30', local: 'Sala 1', descricao: 'Aula introdutória', status: 'Planejada' },
      { id: uid(), turma_id: state.classes[1].id, titulo: 'Rudimentos básicos', data: todayIso(), hora_inicio: '20:30', hora_fim: '22:00', local: 'Sala 2', descricao: 'Exercícios práticos', status: 'Planejada' }
    ];
    state.attendance = state.students.slice(0, 10).map((student, index) => ({
      id: uid(),
      student_id: student.id,
      class_id: index < 5 ? state.classes[0].id : state.classes[1].id,
      lesson_id: index < 5 ? state.lessons[0].id : state.lessons[1].id,
      date: todayIso(),
      status: index % 4 === 0 ? 'Falta justificada' : 'Presente',
      justification: index % 4 === 0 ? 'Aviso registrado previamente.' : ''
    }));
    state.allowedUsers = [{
      id: uid(),
      email: state.settings.ownerEmail || 'admin@exemplo.com',
      status: 'ativo',
      modules: { students: 'admin', classes: 'admin', lessons: 'admin', attendance: 'admin', dashboard: 'admin', permissions: 'admin' }
    }];
    ensureOwnerPermission();
    return;
  }

  const email = state.currentUser?.email?.toLowerCase() || '';
  const [studentsRes, classesRes, lessonsRes, attendanceRes, allowedUsersRes] = await Promise.all([
    state.supabase.from('students').select('*').order('codigo'),
    state.supabase.from('classes').select('*').order('nome'),
    state.supabase.from('lessons').select('*').order('data'),
    state.supabase.from('attendance').select('*').order('date', { ascending: false }),
    state.supabase.from('allowed_users').select('*').order('email')
  ]);

  if (studentsRes.error || classesRes.error || lessonsRes.error || attendanceRes.error || allowedUsersRes.error) {
    const message = studentsRes.error?.message || classesRes.error?.message || lessonsRes.error?.message || attendanceRes.error?.message || allowedUsersRes.error?.message;
    throw new Error(message);
  }

  state.students = (studentsRes.data || []).map(normalizeStudent);
  state.classes = classesRes.data || [];
  state.lessons = lessonsRes.data || [];
  state.attendance = attendanceRes.data || [];
  state.allowedUsers = allowedUsersRes.data || [];
  state.currentProfile = state.allowedUsers.find(item => item.email?.toLowerCase() === email) || null;

  if (!state.currentProfile || state.currentProfile.status === 'bloqueado') {
    await logout();
    throw new Error('Seu e-mail não possui autorização ativa para acessar o sistema.');
  }
}

async function startApp(demo = false) {
  state.demoMode = demo;
  if (!demo) {
    connectSupabase();
    await checkSession();
  }
  try {
    await loadAll();
    $('#loginScreen').classList.add('hidden');
    $('#appRoot').classList.remove('hidden');
    $('#userBox').textContent = state.demoMode ? 'Modo demonstração' : `Usuário: ${state.currentUser?.email || ''}`;
    renderMenu();
    renderPage();
  } catch (error) {
    console.error(error);
    setNotice(error.message || 'Falha ao iniciar o sistema.');
  }
}

function renderMenu() {
  const items = [
    ['dashboard', 'Dashboard', 'dashboard'],
    ['alunos', 'Alunos', 'students'],
    ['turmas', 'Turmas', 'classes'],
    ['aulas', 'Aulas', 'lessons'],
    ['presencas', 'Presenças', 'attendance'],
    ['permissoes', 'Permissões', 'permissions']
  ].filter(([, , moduleKey]) => can(moduleKey));

  $('#menu').innerHTML = items.map(([key, label]) => `
    <button class="${state.currentPage === key ? 'active' : ''}" data-page="${key}">${label}</button>
  `).join('');

  $('#menu').querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      state.currentPage = button.dataset.page;
      renderMenu();
      renderPage();
    });
  });
}

function updatePageHeader() {
  const current = pages[state.currentPage];
  $('#pageEyebrow').textContent = state.demoMode ? 'Demonstração' : 'Supabase online';
  $('#pageTitle').textContent = current.title;
  $('#pageDesc').textContent = current.desc;
  $('#btnNewPrimary').classList.toggle('hidden', state.currentPage === 'dashboard');
}

function renderPage() {
  updatePageHeader();
  const page = state.currentPage;
  if (page === 'dashboard') return renderDashboard();
  if (page === 'alunos') return renderStudents();
  if (page === 'turmas') return renderClasses();
  if (page === 'aulas') return renderLessons();
  if (page === 'presencas') return renderAttendance();
  if (page === 'permissoes') return renderPermissions();
}

function stats() {
  const byChurchMap = new Map();
  const byRegionMap = new Map();
  const byDateMap = new Map();
  for (const student of state.students) {
    const church = student.igreja || 'Sem igreja';
    const region = student.regiao || 'Sem região';
    const date = student.data_inscricao || student.created_at?.slice(0, 10) || 'Sem data';
    byChurchMap.set(church, (byChurchMap.get(church) || 0) + 1);
    byRegionMap.set(region, (byRegionMap.get(region) || 0) + 1);
    byDateMap.set(date, (byDateMap.get(date) || 0) + 1);
  }
  const sortDesc = (a, b) => b.value - a.value;
  return {
    totalStudents: state.students.length,
    totalChurches: byChurchMap.size,
    totalClasses: state.classes.length,
    totalLessons: state.lessons.length,
    topChurches: [...byChurchMap.entries()].map(([name, value]) => ({ name, value })).sort(sortDesc),
    byRegion: [...byRegionMap.entries()].map(([name, value]) => ({ name, value })).sort(sortDesc),
    byDate: [...byDateMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'))
  };
}

let dashboardChart = null;
let timelineChart = null;

function renderDashboard() {
  const st = stats();
  $('#pageContent').innerHTML = `
    <section class="kpi-grid">
      <article class="card kpi-card"><p class="eyebrow">Alunos</p><h3>${st.totalStudents}</h3><p class="muted">Base atual de inscritos.</p></article>
      <article class="card kpi-card"><p class="eyebrow">Igrejas</p><h3>${st.totalChurches}</h3><p class="muted">Congregações com alunos registrados.</p></article>
      <article class="card kpi-card"><p class="eyebrow">Turmas</p><h3>${st.totalClasses}</h3><p class="muted">Turmas operacionais ou planejadas.</p></article>
      <article class="card kpi-card"><p class="eyebrow">Aulas</p><h3>${st.totalLessons}</h3><p class="muted">Planejamento lançado no sistema.</p></article>
    </section>

    <section class="dashboard-grid">
      <article class="card panel">
        <div class="toolbar"><strong>Ranking de igrejas</strong><span class="badge">Top 10</span></div>
        <div class="chart-box"><canvas id="dashboardChart"></canvas></div>
      </article>
      <article class="card panel">
        <div class="toolbar"><strong>Top 5 clicável</strong><span class="badge">Base original preservada</span></div>
        <div class="list-clean">
          ${st.topChurches.slice(0, 5).map(item => `
            <button class="list-item church-filter" data-church="${escapeHtml(item.name)}">
              <span><strong>${escapeHtml(item.name)}</strong><br><small class="muted">Ver alunos da igreja</small></span>
              <span class="badge">${item.value}</span>
            </button>
          `).join('') || '<div class="empty-state">Nenhuma igreja encontrada.</div>'}
        </div>
      </article>
    </section>

    <section class="dashboard-grid">
      <article class="card panel">
        <div class="toolbar"><strong>Evolução por data</strong><span class="badge">Timeline</span></div>
        <div class="chart-box"><canvas id="timelineChart"></canvas></div>
      </article>
      <article class="card panel">
        <div class="toolbar"><strong>Regiões</strong><span class="badge">Segmentação</span></div>
        <div class="list-clean">
          ${st.byRegion.slice(0, 8).map(item => `
            <div class="list-item">
              <span>${escapeHtml(item.name)}</span>
              <span class="badge">${item.value}</span>
            </div>
          `).join('') || '<div class="empty-state">Sem regiões cadastradas.</div>'}
        </div>
      </article>
    </section>
  `;

  if (dashboardChart) dashboardChart.destroy();
  if (timelineChart) timelineChart.destroy();

  dashboardChart = new Chart(document.getElementById('dashboardChart'), {
    type: 'bar',
    data: {
      labels: st.topChurches.slice(0, 10).map(item => item.name),
      datasets: [{ label: 'Inscritos', data: st.topChurches.slice(0, 10).map(item => item.value) }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  timelineChart = new Chart(document.getElementById('timelineChart'), {
    type: 'line',
    data: {
      labels: st.byDate.map(item => item.name),
      datasets: [{ label: 'Inscrições', data: st.byDate.map(item => item.value), fill: false, tension: .25 }]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });

  document.querySelectorAll('.church-filter').forEach((button) => {
    button.addEventListener('click', () => openChurchView(button.dataset.church));
  });
}

function renderStudents() {
  const rows = state.students.map(student => `
    <tr>
      <td><strong>${escapeHtml(student.nome || 'Sem nome')}</strong><br><small class="muted">${escapeHtml(student.email || '')}</small></td>
      <td>${escapeHtml(student.igreja || '—')}</td>
      <td>${escapeHtml(student.regiao || '—')}</td>
      <td>${escapeHtml(student.instrumento || '—')}</td>
      <td>${student.whatsapp_url ? `<a href="${student.whatsapp_url}" target="_blank">WhatsApp</a>` : '—'}</td>
      <td>${escapeHtml(student.faixa_etaria || '—')}</td>
      <td class="actions-row wrap">
        <button class="btn btn-secondary action-edit-student" data-id="${student.id}">Editar</button>
        <button class="btn btn-secondary action-student-pdf" data-id="${student.id}">Ficha PDF</button>
        <button class="btn btn-danger action-delete-student" data-id="${student.id}">Excluir</button>
      </td>
    </tr>
  `).join('');

  $('#pageContent').innerHTML = `
    <section class="card panel">
      <div class="toolbar">
        <input class="search" id="searchStudents" placeholder="Pesquisar por nome, igreja, região ou instrumento" />
        <span class="badge">${state.students.length} alunos</span>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Aluno</th><th>Igreja</th><th>Região</th><th>Instrumento</th><th>Contato</th><th>Faixa</th><th>Ações</th></tr></thead>
          <tbody id="studentsBody">${rows || `<tr><td colspan="7"><div class="empty-state">Nenhum aluno encontrado.</div></td></tr>`}</tbody>
        </table>
      </div>
    </section>
  `;

  bindStudentActions();
  $('#searchStudents').addEventListener('input', (event) => {
    const q = event.target.value.trim().toLowerCase();
    const filtered = state.students.filter(student => [student.nome, student.igreja, student.regiao, student.instrumento, student.email].join(' ').toLowerCase().includes(q));
    $('#studentsBody').innerHTML = filtered.map(student => `
      <tr>
        <td><strong>${escapeHtml(student.nome || 'Sem nome')}</strong><br><small class="muted">${escapeHtml(student.email || '')}</small></td>
        <td>${escapeHtml(student.igreja || '—')}</td>
        <td>${escapeHtml(student.regiao || '—')}</td>
        <td>${escapeHtml(student.instrumento || '—')}</td>
        <td>${student.whatsapp_url ? `<a href="${student.whatsapp_url}" target="_blank">WhatsApp</a>` : '—'}</td>
        <td>${escapeHtml(student.faixa_etaria || '—')}</td>
        <td class="actions-row wrap">
          <button class="btn btn-secondary action-edit-student" data-id="${student.id}">Editar</button>
          <button class="btn btn-secondary action-student-pdf" data-id="${student.id}">Ficha PDF</button>
          <button class="btn btn-danger action-delete-student" data-id="${student.id}">Excluir</button>
        </td>
      </tr>
    `).join('') || `<tr><td colspan="7"><div class="empty-state">Nenhum aluno localizado.</div></td></tr>`;
    bindStudentActions();
  });
}

function bindStudentActions() {
  document.querySelectorAll('.action-edit-student').forEach(button => button.onclick = () => openStudentModal(button.dataset.id));
  document.querySelectorAll('.action-student-pdf').forEach(button => button.onclick = () => exportStudentPdf(button.dataset.id));
  document.querySelectorAll('.action-delete-student').forEach(button => button.onclick = () => deleteStudent(button.dataset.id));
}

function renderClasses() {
  $('#pageContent').innerHTML = `
    <section class="card panel">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Turma</th><th>Igreja</th><th>Capacidade</th><th>Inscritos</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            ${state.classes.map(item => `
              <tr>
                <td><strong>${escapeHtml(item.nome)}</strong><br><small class="muted">${escapeHtml(item.descricao || '')}</small></td>
                <td>${escapeHtml(item.igreja || '—')}</td>
                <td>${item.capacidade || 0}</td>
                <td>${Array.isArray(item.inscritos) ? item.inscritos.length : 0}</td>
                <td><span class="badge">${escapeHtml(item.status || '—')}</span></td>
                <td class="actions-row wrap">
                  <button class="btn btn-secondary edit-class" data-id="${item.id}">Editar</button>
                  <button class="btn btn-danger delete-class" data-id="${item.id}">Excluir</button>
                </td>
              </tr>
            `).join('') || `<tr><td colspan="6"><div class="empty-state">Nenhuma turma cadastrada.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
  document.querySelectorAll('.edit-class').forEach(button => button.onclick = () => openClassModal(button.dataset.id));
  document.querySelectorAll('.delete-class').forEach(button => button.onclick = () => deleteClass(button.dataset.id));
}

function renderLessons() {
  $('#pageContent').innerHTML = `
    <section class="card panel">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Aula</th><th>Turma</th><th>Data</th><th>Horário</th><th>Local</th><th>Ações</th></tr></thead>
          <tbody>
            ${state.lessons.map(item => {
              const className = state.classes.find(cls => cls.id === item.turma_id)?.nome || 'Sem turma';
              return `
                <tr>
                  <td><strong>${escapeHtml(item.titulo)}</strong><br><small class="muted">${escapeHtml(item.descricao || '')}</small></td>
                  <td>${escapeHtml(className)}</td>
                  <td>${formatDate(item.data)}</td>
                  <td>${escapeHtml(item.hora_inicio || '')} - ${escapeHtml(item.hora_fim || '')}</td>
                  <td>${escapeHtml(item.local || '—')}</td>
                  <td class="actions-row wrap">
                    <button class="btn btn-secondary edit-lesson" data-id="${item.id}">Editar</button>
                    <button class="btn btn-danger delete-lesson" data-id="${item.id}">Excluir</button>
                  </td>
                </tr>
              `;
            }).join('') || `<tr><td colspan="6"><div class="empty-state">Nenhuma aula cadastrada.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
  document.querySelectorAll('.edit-lesson').forEach(button => button.onclick = () => openLessonModal(button.dataset.id));
  document.querySelectorAll('.delete-lesson').forEach(button => button.onclick = () => deleteLesson(button.dataset.id));
}

function attendanceSummary() {
  const map = { presente: 0, falta: 0, justificada: 0 };
  state.attendance.forEach(item => {
    const status = (item.status || '').toLowerCase();
    if (status.includes('just')) map.justificada += 1;
    else if (status.includes('pres')) map.presente += 1;
    else map.falta += 1;
  });
  return map;
}

function renderAttendance() {
  const sum = attendanceSummary();
  $('#pageContent').innerHTML = `
    <section class="kpi-grid">
      <article class="card kpi-card"><p class="eyebrow">Presentes</p><h3>${sum.presente}</h3><p class="muted">Registros marcados como presença.</p></article>
      <article class="card kpi-card"><p class="eyebrow">Faltas</p><h3>${sum.falta}</h3><p class="muted">Ausências sem justificativa.</p></article>
      <article class="card kpi-card"><p class="eyebrow">Justificadas</p><h3>${sum.justificada}</h3><p class="muted">Ausências justificadas.</p></article>
      <article class="card kpi-card"><p class="eyebrow">Total</p><h3>${state.attendance.length}</h3><p class="muted">Histórico geral.</p></article>
    </section>
    <section class="card panel">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Aluno</th><th>Turma</th><th>Data</th><th>Status</th><th>Justificativa</th><th>Ações</th></tr></thead>
          <tbody>
            ${state.attendance.map(item => {
              const student = state.students.find(student => student.id === item.student_id);
              const className = state.classes.find(cls => cls.id === item.class_id)?.nome || 'Sem turma';
              return `
                <tr>
                  <td>${escapeHtml(student?.nome || '—')}</td>
                  <td>${escapeHtml(className)}</td>
                  <td>${formatDate(item.date)}</td>
                  <td><span class="badge">${escapeHtml(item.status || '—')}</span></td>
                  <td>${escapeHtml(item.justification || '—')}</td>
                  <td class="actions-row wrap">
                    <button class="btn btn-secondary edit-attendance" data-id="${item.id}">Editar</button>
                    <button class="btn btn-danger delete-attendance" data-id="${item.id}">Excluir</button>
                  </td>
                </tr>
              `;
            }).join('') || `<tr><td colspan="6"><div class="empty-state">Nenhum registro de presença.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
  document.querySelectorAll('.edit-attendance').forEach(button => button.onclick = () => openAttendanceModal(button.dataset.id));
  document.querySelectorAll('.delete-attendance').forEach(button => button.onclick = () => deleteAttendance(button.dataset.id));
}

function renderPermissions() {
  $('#pageContent').innerHTML = `
    <section class="card panel">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>E-mail</th><th>Status</th><th>Módulos</th><th>Ações</th></tr></thead>
          <tbody>
            ${state.allowedUsers.map(item => `
              <tr>
                <td><strong>${escapeHtml(item.email || '—')}</strong></td>
                <td><span class="badge">${escapeHtml(item.status || '—')}</span></td>
                <td><small>${Object.entries(item.modules || {}).map(([k, v]) => `${k}:${v}`).join(' • ')}</small></td>
                <td class="actions-row wrap">
                  <button class="btn btn-secondary edit-permission" data-id="${item.id}">Editar</button>
                  <button class="btn btn-danger delete-permission" data-id="${item.id}">Excluir</button>
                </td>
              </tr>
            `).join('') || `<tr><td colspan="4"><div class="empty-state">Nenhuma permissão registrada.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
  document.querySelectorAll('.edit-permission').forEach(button => button.onclick = () => openPermissionModal(button.dataset.id));
  document.querySelectorAll('.delete-permission').forEach(button => button.onclick = () => deletePermission(button.dataset.id));
}

function openDialog(title, eyebrow, html) {
  $('#dialogTitle').textContent = title;
  $('#dialogEyebrow').textContent = eyebrow;
  $('#dialogBody').innerHTML = html;
  $('#entityDialog').showModal();
}

function closeDialog() {
  $('#entityDialog').close();
}

function studentForm(student = {}) {
  return `
    <form id="studentForm" class="form-grid">
      <div class="form-grid cols-3">
        <label><span>Código</span><input name="codigo" type="number" value="${escapeHtml(student.codigo || state.students.length + 1)}"></label>
        <label><span>Status</span><select name="status"><option ${student.status === 'Ativo' ? 'selected' : ''}>Ativo</option><option ${student.status === 'Inativo' ? 'selected' : ''}>Inativo</option></select></label>
        <label><span>Instrumento</span><input name="instrumento" value="${escapeHtml(student.instrumento || 'Bateria')}"></label>
      </div>
      <div class="form-grid cols-2">
        <label><span>Nome</span><input name="nome" required value="${escapeHtml(student.nome || '')}"></label>
        <label><span>E-mail</span><input name="email" type="email" value="${escapeHtml(student.email || '')}"></label>
      </div>
      <div class="form-grid cols-3">
        <label><span>DDD</span><input name="ddd" value="${escapeHtml(student.ddd || '')}"></label>
        <label><span>Telefone</span><input name="telefone" value="${escapeHtml(student.telefone || '')}"></label>
        <label><span>Nascimento</span><input name="data_nascimento" type="date" value="${escapeHtml(student.data_nascimento || '')}"></label>
      </div>
      <div class="form-grid cols-2">
        <label><span>Igreja</span><input name="igreja" value="${escapeHtml(student.igreja || '')}"></label>
        <label><span>Região</span><input name="regiao" value="${escapeHtml(student.regiao || '')}"></label>
      </div>
      <div class="form-grid cols-2">
        <label><span>Pastor</span><input name="pastor_nome" value="${escapeHtml(student.pastor_nome || '')}"></label>
        <label><span>Telefone do pastor</span><input name="pastor_telefone" value="${escapeHtml(student.pastor_telefone || '')}"></label>
      </div>
      <label><span>Observações</span><textarea name="observacoes" rows="4">${escapeHtml(student.observacoes || '')}</textarea></label>
      <div class="actions-row"><button class="btn" type="submit">Salvar aluno</button></div>
    </form>
  `;
}

function openStudentModal(id = null) {
  if (!canEdit('students')) return alert('Sem permissão para editar alunos.');
  const student = id ? state.students.find(item => item.id === id) : null;
  openDialog(student ? 'Editar aluno' : 'Novo aluno', 'Alunos', studentForm(student || {}));
  $('#studentForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const payload = normalizeStudent(Object.fromEntries(form.entries()));
    payload.id = student?.id || uid();
    payload.updated_at = new Date().toISOString();
    payload.created_at = student?.created_at || new Date().toISOString();
    if (!student) state.students.unshift(payload);
    else Object.assign(student, payload);
    await persist('students', payload);
    closeDialog();
    renderPage();
  });
}

function classForm(item = {}) {
  return `
    <form id="classForm" class="form-grid">
      <div class="form-grid cols-2">
        <label><span>Nome</span><input name="nome" required value="${escapeHtml(item.nome || '')}"></label>
        <label><span>Igreja</span><input name="igreja" value="${escapeHtml(item.igreja || '')}"></label>
      </div>
      <div class="form-grid cols-3">
        <label><span>Capacidade</span><input name="capacidade" type="number" value="${escapeHtml(item.capacidade || 0)}"></label>
        <label><span>Status</span><select name="status"><option ${item.status === 'Ativa' ? 'selected' : ''}>Ativa</option><option ${item.status === 'Planejada' ? 'selected' : ''}>Planejada</option><option ${item.status === 'Encerrada' ? 'selected' : ''}>Encerrada</option></select></label>
        <label><span>Inscritos (IDs separados por vírgula)</span><input name="inscritos" value="${escapeHtml((item.inscritos || []).join(', '))}"></label>
      </div>
      <label><span>Descrição</span><textarea name="descricao" rows="4">${escapeHtml(item.descricao || '')}</textarea></label>
      <div class="actions-row"><button class="btn" type="submit">Salvar turma</button></div>
    </form>
  `;
}

function openClassModal(id = null) {
  if (!canEdit('classes')) return alert('Sem permissão para editar turmas.');
  const item = id ? state.classes.find(entry => entry.id === id) : null;
  openDialog(item ? 'Editar turma' : 'Nova turma', 'Turmas', classForm(item || {}));
  $('#classForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const payload = Object.fromEntries(form.entries());
    payload.id = item?.id || uid();
    payload.capacidade = Number(payload.capacidade || 0);
    payload.inscritos = String(payload.inscritos || '').split(',').map(v => v.trim()).filter(Boolean);
    if (!item) state.classes.unshift(payload); else Object.assign(item, payload);
    await persist('classes', payload);
    closeDialog();
    renderPage();
  });
}

function lessonForm(item = {}) {
  return `
    <form id="lessonForm" class="form-grid">
      <div class="form-grid cols-2">
        <label><span>Título</span><input name="titulo" required value="${escapeHtml(item.titulo || '')}"></label>
        <label><span>Turma</span><select name="turma_id">${state.classes.map(cls => `<option value="${cls.id}" ${item.turma_id === cls.id ? 'selected' : ''}>${escapeHtml(cls.nome)}</option>`).join('')}</select></label>
      </div>
      <div class="form-grid cols-3">
        <label><span>Data</span><input type="date" name="data" value="${escapeHtml(item.data || todayIso())}"></label>
        <label><span>Hora inicial</span><input name="hora_inicio" value="${escapeHtml(item.hora_inicio || '19:00')}"></label>
        <label><span>Hora final</span><input name="hora_fim" value="${escapeHtml(item.hora_fim || '20:30')}"></label>
      </div>
      <div class="form-grid cols-2">
        <label><span>Local</span><input name="local" value="${escapeHtml(item.local || '')}"></label>
        <label><span>Status</span><select name="status"><option ${item.status === 'Planejada' ? 'selected' : ''}>Planejada</option><option ${item.status === 'Realizada' ? 'selected' : ''}>Realizada</option><option ${item.status === 'Cancelada' ? 'selected' : ''}>Cancelada</option></select></label>
      </div>
      <label><span>Descrição</span><textarea name="descricao" rows="4">${escapeHtml(item.descricao || '')}</textarea></label>
      <div class="actions-row"><button class="btn" type="submit">Salvar aula</button></div>
    </form>
  `;
}

function openLessonModal(id = null) {
  if (!canEdit('lessons')) return alert('Sem permissão para editar aulas.');
  const item = id ? state.lessons.find(entry => entry.id === id) : null;
  openDialog(item ? 'Editar aula' : 'Nova aula', 'Aulas', lessonForm(item || {}));
  $('#lessonForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const payload = Object.fromEntries(form.entries());
    payload.id = item?.id || uid();
    if (!item) state.lessons.unshift(payload); else Object.assign(item, payload);
    await persist('lessons', payload);
    closeDialog();
    renderPage();
  });
}

function attendanceForm(item = {}) {
  return `
    <form id="attendanceForm" class="form-grid">
      <div class="form-grid cols-2">
        <label><span>Aluno</span><select name="student_id">${state.students.map(student => `<option value="${student.id}" ${item.student_id === student.id ? 'selected' : ''}>${escapeHtml(student.nome)}</option>`).join('')}</select></label>
        <label><span>Turma</span><select name="class_id">${state.classes.map(cls => `<option value="${cls.id}" ${item.class_id === cls.id ? 'selected' : ''}>${escapeHtml(cls.nome)}</option>`).join('')}</select></label>
      </div>
      <div class="form-grid cols-3">
        <label><span>Aula</span><select name="lesson_id">${state.lessons.map(lesson => `<option value="${lesson.id}" ${item.lesson_id === lesson.id ? 'selected' : ''}>${escapeHtml(lesson.titulo)}</option>`).join('')}</select></label>
        <label><span>Data</span><input type="date" name="date" value="${escapeHtml(item.date || todayIso())}"></label>
        <label><span>Status</span><select name="status"><option ${item.status === 'Presente' ? 'selected' : ''}>Presente</option><option ${item.status === 'Falta' ? 'selected' : ''}>Falta</option><option ${item.status === 'Falta justificada' ? 'selected' : ''}>Falta justificada</option></select></label>
      </div>
      <label><span>Justificativa</span><textarea name="justification" rows="4">${escapeHtml(item.justification || '')}</textarea></label>
      <div class="actions-row"><button class="btn" type="submit">Salvar presença</button></div>
    </form>
  `;
}

function openAttendanceModal(id = null) {
  if (!canEdit('attendance')) return alert('Sem permissão para editar presença.');
  const item = id ? state.attendance.find(entry => entry.id === id) : null;
  openDialog(item ? 'Editar presença' : 'Nova presença', 'Presenças', attendanceForm(item || {}));
  $('#attendanceForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const payload = Object.fromEntries(form.entries());
    payload.id = item?.id || uid();
    if (!item) state.attendance.unshift(payload); else Object.assign(item, payload);
    await persist('attendance', payload);
    closeDialog();
    renderPage();
  });
}

function permissionForm(item = {}) {
  const moduleSelect = (name, value='viewer') => `
    <label><span>${name}</span><select name="${name}"><option ${value === 'viewer' ? 'selected' : ''}>viewer</option><option ${value === 'editor' ? 'selected' : ''}>editor</option><option ${value === 'admin' ? 'selected' : ''}>admin</option></select></label>`;
  return `
    <form id="permissionForm" class="form-grid">
      <div class="form-grid cols-2">
        <label><span>E-mail</span><input name="email" type="email" required value="${escapeHtml(item.email || '')}"></label>
        <label><span>Status</span><select name="status"><option ${item.status === 'ativo' ? 'selected' : ''}>ativo</option><option ${item.status === 'convidado' ? 'selected' : ''}>convidado</option><option ${item.status === 'bloqueado' ? 'selected' : ''}>bloqueado</option></select></label>
      </div>
      <div class="form-grid cols-3">
        ${moduleSelect('students', item.modules?.students || 'viewer')}
        ${moduleSelect('classes', item.modules?.classes || 'viewer')}
        ${moduleSelect('lessons', item.modules?.lessons || 'viewer')}
      </div>
      <div class="form-grid cols-3">
        ${moduleSelect('attendance', item.modules?.attendance || 'viewer')}
        ${moduleSelect('dashboard', item.modules?.dashboard || 'viewer')}
        ${moduleSelect('permissions', item.modules?.permissions || 'viewer')}
      </div>
      <div class="actions-row"><button class="btn" type="submit">Salvar permissão</button></div>
    </form>
  `;
}

function openPermissionModal(id = null) {
  if (!canAdmin('permissions')) return alert('Sem permissão para administrar acessos.');
  const item = id ? state.allowedUsers.find(entry => entry.id === id) : null;
  openDialog(item ? 'Editar permissão' : 'Nova permissão', 'Permissões', permissionForm(item || {}));
  $('#permissionForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const values = Object.fromEntries(form.entries());
    const payload = {
      id: item?.id || uid(),
      email: values.email,
      status: values.status,
      modules: {
        students: values.students,
        classes: values.classes,
        lessons: values.lessons,
        attendance: values.attendance,
        dashboard: values.dashboard,
        permissions: values.permissions
      }
    };
    if (!item) state.allowedUsers.unshift(payload); else Object.assign(item, payload);
    await persist('allowed_users', payload);
    closeDialog();
    renderPage();
  });
}

function openSettingsModal() {
  openDialog('Configurações de conexão', 'Sistema', `
    <form id="settingsForm" class="form-grid">
      <label><span>URL do Supabase</span><input name="supabaseUrl" value="${escapeHtml(state.settings.supabaseUrl || '')}"></label>
      <label><span>Anon key</span><textarea name="supabaseAnon" rows="5">${escapeHtml(state.settings.supabaseAnon || '')}</textarea></label>
      <label><span>E-mail do owner</span><input name="ownerEmail" type="email" value="${escapeHtml(state.settings.ownerEmail || '')}"></label>
      <div class="actions-row"><button class="btn" type="submit">Salvar configurações</button></div>
    </form>
  `);
  $('#settingsForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    Object.assign(state.settings, Object.fromEntries(form.entries()));
    saveSettings();
    applyLoginConfigInputs();
    closeDialog();
  });
}

function openChurchView(church) {
  const filtered = state.students.filter(student => (student.igreja || '') === church);
  openDialog(`Alunos de ${church}`, 'Igrejas', `
    <div class="list-clean">
      ${filtered.map(student => `
        <div class="list-item">
          <span><strong>${escapeHtml(student.nome)}</strong><br><small class="muted">${escapeHtml(student.email || 'Sem e-mail')}</small></span>
          <span class="badge">${escapeHtml(student.instrumento || '—')}</span>
        </div>
      `).join('') || '<div class="empty-state">Nenhum aluno nesta igreja.</div>'}
    </div>
  `);
}

async function persist(table, payload) {
  if (state.demoMode) return;
  if (!state.supabase) return;
  const { error } = await state.supabase.from(table).upsert(payload).select();
  if (error) {
    console.error(error);
    alert(error.message);
  }
}

async function removeRecord(table, id) {
  if (state.demoMode) return;
  if (!state.supabase) return;
  const { error } = await state.supabase.from(table).delete().eq('id', id);
  if (error) {
    console.error(error);
    alert(error.message);
  }
}

async function deleteStudent(id) {
  if (!canEdit('students')) return alert('Sem permissão para excluir alunos.');
  if (!confirm('Excluir este aluno?')) return;
  state.students = state.students.filter(item => item.id !== id);
  await removeRecord('students', id);
  renderPage();
}

async function deleteClass(id) {
  if (!canEdit('classes')) return alert('Sem permissão para excluir turmas.');
  if (!confirm('Excluir esta turma?')) return;
  state.classes = state.classes.filter(item => item.id !== id);
  await removeRecord('classes', id);
  renderPage();
}

async function deleteLesson(id) {
  if (!canEdit('lessons')) return alert('Sem permissão para excluir aulas.');
  if (!confirm('Excluir esta aula?')) return;
  state.lessons = state.lessons.filter(item => item.id !== id);
  await removeRecord('lessons', id);
  renderPage();
}

async function deleteAttendance(id) {
  if (!canEdit('attendance')) return alert('Sem permissão para excluir presença.');
  if (!confirm('Excluir este registro?')) return;
  state.attendance = state.attendance.filter(item => item.id !== id);
  await removeRecord('attendance', id);
  renderPage();
}

async function deletePermission(id) {
  if (!canAdmin('permissions')) return alert('Sem permissão para excluir permissões.');
  if (!confirm('Excluir esta permissão?')) return;
  state.allowedUsers = state.allowedUsers.filter(item => item.id !== id);
  await removeRecord('allowed_users', id);
  renderPage();
}

function exportExcel() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.students), 'Alunos');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.classes), 'Turmas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.lessons), 'Aulas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(state.attendance), 'Presencas');
  XLSX.writeFile(wb, 'projeto_aprendiz_export.xlsx');
}

function exportPdf() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  const st = stats();
  const lines = [
    'Projeto Aprendiz - Relatório executivo',
    `Emitido em: ${new Date().toLocaleString('pt-BR')}`,
    '',
    `Alunos: ${st.totalStudents}`,
    `Igrejas: ${st.totalChurches}`,
    `Turmas: ${st.totalClasses}`,
    `Aulas: ${st.totalLessons}`,
    '',
    'Top igrejas:',
    ...st.topChurches.slice(0, 10).map(item => `- ${item.name}: ${item.value}`)
  ];
  pdf.text(lines, 14, 18);
  pdf.save('projeto_aprendiz_relatorio.pdf');
}

function exportStudentPdf(id) {
  const student = state.students.find(item => item.id === id);
  if (!student) return;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  const lines = [
    'Ficha do aluno',
    '',
    `Nome: ${student.nome || ''}`,
    `E-mail: ${student.email || ''}`,
    `Igreja: ${student.igreja || ''}`,
    `Região: ${student.regiao || ''}`,
    `Instrumento: ${student.instrumento || ''}`,
    `Telefone: ${student.ddd || ''} ${student.telefone || ''}`,
    `Pastor: ${student.pastor_nome || ''}`,
    `Status: ${student.status || ''}`,
    '',
    `Observações: ${student.observacoes || 'Sem observações.'}`
  ];
  pdf.text(lines, 14, 18);
  pdf.save(`ficha_${(student.nome || 'aluno').replace(/\s+/g, '_').toLowerCase()}.pdf`);
}

function handlePrimaryAction() {
  if (state.currentPage === 'alunos') return openStudentModal();
  if (state.currentPage === 'turmas') return openClassModal();
  if (state.currentPage === 'aulas') return openLessonModal();
  if (state.currentPage === 'presencas') return openAttendanceModal();
  if (state.currentPage === 'permissoes') return openPermissionModal();
}

async function manualSync() {
  if (state.demoMode) return alert('No modo demonstração não há sincronização remota.');
  await loadAll();
  renderMenu();
  renderPage();
}

function bindGlobalEvents() {
  $('#btnLogin').addEventListener('click', loginEmailPassword);
  $('#btnMagicLink').addEventListener('click', sendMagicLink);
  $('#btnDemo').addEventListener('click', () => startApp(true));
  $('#btnLogout').addEventListener('click', logout);
  $('#btnSync').addEventListener('click', manualSync);
  $('#btnExportExcel').addEventListener('click', exportExcel);
  $('#btnExportPdf').addEventListener('click', exportPdf);
  $('#btnCloseDialog').addEventListener('click', closeDialog);
  $('#btnOpenSettings').addEventListener('click', openSettingsModal);
  $('#btnNewPrimary').addEventListener('click', handlePrimaryAction);
}

async function boot() {
  applyLoginConfigInputs();
  bindGlobalEvents();
  if (state.settings.supabaseUrl && state.settings.supabaseAnon) {
    connectSupabase();
    const session = await checkSession();
    if (session) await startApp(false);
  }
}

boot();
