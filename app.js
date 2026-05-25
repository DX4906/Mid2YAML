const HELPER_BASE_URL = 'http://127.0.0.1:4317';
const STORAGE_KEY = 'mid2yaml.formState.v1';
const HISTORY_LOG_LIMIT = 12000;

const defaultState = {
  platform: 'web',
  taskName: '搜索天气',
  web: {
    url: 'https://www.bing.com',
    viewportWidth: 1440,
    viewportHeight: 800,
    bridgeMode: 'false',
    headed: false
  },
  computer: {
    displayId: ''
  },
  modelConfig: {
    baseUrl: '',
    modelName: '',
    modelFamily: '',
    dotenvOverride: false
  },
  stepsText: '搜索 "今日天气"',
  assertion: '结果显示天气信息'
};

const els = {
  helperStatus: document.querySelector('#helperStatus'),
  versionStatus: document.querySelector('#versionStatus'),
  webFields: document.querySelector('#webFields'),
  computerFields: document.querySelector('#computerFields'),
  taskName: document.querySelector('#taskName'),
  webUrl: document.querySelector('#webUrl'),
  viewportWidth: document.querySelector('#viewportWidth'),
  viewportHeight: document.querySelector('#viewportHeight'),
  bridgeMode: document.querySelector('#bridgeMode'),
  headed: document.querySelector('#headed'),
  displayId: document.querySelector('#displayId'),
  modelBaseUrl: document.querySelector('#modelBaseUrl'),
  modelApiKey: document.querySelector('#modelApiKey'),
  modelName: document.querySelector('#modelName'),
  modelFamily: document.querySelector('#modelFamily'),
  dotenvOverride: document.querySelector('#dotenvOverride'),
  stepsText: document.querySelector('#stepsText'),
  assertion: document.querySelector('#assertion'),
  yamlPreview: document.querySelector('#yamlPreview'),
  validationMessage: document.querySelector('#validationMessage'),
  manualCommand: document.querySelector('#manualCommand'),
  executionLogBox: document.querySelector('#executionLogBox'),
  exitCode: document.querySelector('#exitCode'),
  reportPath: document.querySelector('#reportPath'),
  saveYamlBtn: document.querySelector('#saveYamlBtn'),
  copyBtn: document.querySelector('#copyBtn'),
  downloadBtn: document.querySelector('#downloadBtn'),
  resetBtn: document.querySelector('#resetBtn'),
  checkHelperBtn: document.querySelector('#checkHelperBtn'),
  checkVersionBtn: document.querySelector('#checkVersionBtn'),
  runBtn: document.querySelector('#runBtn'),
  historyStatus: document.querySelector('#historyStatus'),
  historyList: document.querySelector('#historyList'),
  historyMeta: document.querySelector('#historyMeta'),
  historyRerunHint: document.querySelector('#historyRerunHint'),
  historyYamlPreview: document.querySelector('#historyYamlPreview'),
  refreshHistoryBtn: document.querySelector('#refreshHistoryBtn'),
  copyHistoryBtn: document.querySelector('#copyHistoryBtn'),
  exportHistoryBtn: document.querySelector('#exportHistoryBtn'),
  rerunHistoryBtn: document.querySelector('#rerunHistoryBtn'),
  deleteHistoryBtn: document.querySelector('#deleteHistoryBtn')
};

let currentYaml = '';
let helperOnline = false;
let midsceneReady = false;
let lastFormSignature = '';
let lastGeneratedYaml = '';
let yamlEditDirty = false;
let yamlCustomized = false;
let historyRecords = [];
let selectedHistoryId = '';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      ...clone(defaultState),
      ...saved,
      web: { ...defaultState.web, ...saved?.web },
      computer: { ...defaultState.computer, ...saved?.computer },
      modelConfig: { ...defaultState.modelConfig, ...saved?.modelConfig }
    };
  } catch {
    return clone(defaultState);
  }
}

function persistState(state) {
  const safeState = clone(state);
  delete safeState.modelConfig.apiKey;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
}

function readFormState() {
  return {
    platform: document.querySelector('input[name="platform"]:checked').value,
    taskName: els.taskName.value.trim(),
    web: {
      url: els.webUrl.value.trim(),
      viewportWidth: toInteger(els.viewportWidth.value, 1440),
      viewportHeight: toInteger(els.viewportHeight.value, 800),
      bridgeMode: els.bridgeMode.value,
      headed: els.headed.checked
    },
    computer: {
      displayId: els.displayId.value.trim()
    },
    modelConfig: {
      baseUrl: els.modelBaseUrl.value.trim(),
      apiKey: els.modelApiKey.value.trim(),
      modelName: els.modelName.value.trim(),
      modelFamily: els.modelFamily.value,
      dotenvOverride: els.dotenvOverride.checked
    },
    stepsText: els.stepsText.value,
    assertion: els.assertion.value.trim()
  };
}

function writeFormState(state) {
  document.querySelector(`input[name="platform"][value="${state.platform}"]`).checked = true;
  els.taskName.value = state.taskName;
  els.webUrl.value = state.web.url;
  els.viewportWidth.value = state.web.viewportWidth;
  els.viewportHeight.value = state.web.viewportHeight;
  els.bridgeMode.value = String(state.web.bridgeMode);
  els.headed.checked = Boolean(state.web.headed);
  els.displayId.value = state.computer.displayId;
  els.modelBaseUrl.value = state.modelConfig.baseUrl;
  els.modelApiKey.value = '';
  els.modelName.value = state.modelConfig.modelName;
  els.modelFamily.value = state.modelConfig.modelFamily;
  els.dotenvOverride.checked = Boolean(state.modelConfig.dotenvOverride);
  els.stepsText.value = state.stepsText;
  els.assertion.value = state.assertion;
  syncPlatformFields();
}

function toInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseLines(text) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function yamlScalar(value) {
  const text = String(value ?? '');
  if (!text) {
    return '""';
  }
  if (/^[A-Za-z0-9_./:@-]+$/.test(text) && !['true', 'false', 'null'].includes(text)) {
    return text;
  }
  return JSON.stringify(text);
}

function yamlBooleanOrString(value) {
  if (value === 'false') {
    return 'false';
  }
  return yamlScalar(value);
}

function usesViewportConfig(state) {
  return state.platform === 'web' && state.web.bridgeMode === 'false';
}

function generateYaml(state) {
  const lines = [];

  if (state.platform === 'web') {
    lines.push('web:');
    lines.push(`  url: ${yamlScalar(state.web.url)}`);
    if (usesViewportConfig(state)) {
      lines.push(`  viewportWidth: ${state.web.viewportWidth}`);
      lines.push(`  viewportHeight: ${state.web.viewportHeight}`);
    }
    lines.push(`  bridgeMode: ${yamlBooleanOrString(state.web.bridgeMode)}`);
  } else {
    lines.push('computer:');
    if (state.computer.displayId) {
      lines.push(`  displayId: ${yamlScalar(state.computer.displayId)}`);
    } else {
      lines.push('  displayId: ""');
    }
  }

  const flowKey = state.platform === 'web' ? 'ai' : 'aiAct';
  const taskName = state.taskName || 'Midscene 自动化任务';
  const steps = parseLines(state.stepsText);

  lines.push('');
  lines.push('tasks:');
  lines.push(`  - name: ${yamlScalar(taskName)}`);
  lines.push('    flow:');

  steps.forEach(step => {
    lines.push(`      - ${flowKey}: ${yamlScalar(step)}`);
    lines.push('      - sleep: 500');
  });

  if (state.assertion) {
    lines.push(`      - aiAssert: ${yamlScalar(state.assertion)}`);
  }

  return `${lines.join('\n')}\n`;
}

function getFormSignature(state) {
  return JSON.stringify(state);
}

function validateState(state) {
  const errors = [];
  const steps = parseLines(state.stepsText);

  if (!state.taskName) {
    errors.push('请填写任务名称。');
  }
  if (state.platform === 'web' && !state.web.url) {
    errors.push('Web 脚本需要目标 URL。');
  }
  if (steps.length === 0) {
    errors.push('请至少填写一个执行步骤。');
  }
  if (usesViewportConfig(state) && (state.web.viewportWidth < 320 || state.web.viewportHeight < 240)) {
    errors.push('视口尺寸过小。');
  }

  return errors;
}

function getRunReadiness(state) {
  const missingEnv = [];
  if (!state.modelConfig.baseUrl) {
    missingEnv.push('MIDSCENE_MODEL_BASE_URL');
  }
  if (!state.modelConfig.apiKey) {
    missingEnv.push('MIDSCENE_MODEL_API_KEY');
  }
  if (!state.modelConfig.modelName) {
    missingEnv.push('MIDSCENE_MODEL_NAME');
  }
  if (!state.modelConfig.modelFamily) {
    missingEnv.push('MIDSCENE_MODEL_FAMILY');
  }

  const reasons = [];
  if (!helperOnline) {
    reasons.push('本地助手未连接');
  }
  if (!midsceneReady) {
    reasons.push('Midscene 版本未检测成功');
  }
  if (missingEnv.length) {
    reasons.push(`缺少模型环境变量：${missingEnv.join('、')}`);
  }

  return {
    ready: reasons.length === 0,
    reasons
  };
}

function buildModelEnv(state) {
  const env = {};
  if (state.modelConfig.baseUrl) {
    env.MIDSCENE_MODEL_BASE_URL = state.modelConfig.baseUrl;
  }
  if (state.modelConfig.apiKey) {
    env.MIDSCENE_MODEL_API_KEY = state.modelConfig.apiKey;
  }
  if (state.modelConfig.modelName) {
    env.MIDSCENE_MODEL_NAME = state.modelConfig.modelName;
  }
  if (state.modelConfig.modelFamily) {
    env.MIDSCENE_MODEL_FAMILY = state.modelConfig.modelFamily;
  }
  return env;
}

function updateModelEnvSummary(state) {
  void state;
}

function formatExecutionLog(stdout = '', stderr = '') {
  const sections = [];
  if (stdout) {
    sections.push(`[stdout]\n${stdout.trimEnd()}`);
  }
  if (stderr) {
    sections.push(`[stderr]\n${stderr.trimEnd()}`);
  }
  return sections.join('\n\n') || '暂无输出';
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function platformLabel(platform) {
  return platform === 'computer' ? 'PC Desktop' : 'Web';
}

function safeFilename(value) {
  return (value || 'mid2yaml-script')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 48) || 'mid2yaml-script';
}

function buildHistoryLog(data = {}) {
  return formatExecutionLog(data.stdout, data.stderr).slice(0, HISTORY_LOG_LIMIT);
}

function setHistoryStatus(message, isError = false) {
  els.historyStatus.textContent = message;
  els.historyStatus.classList.toggle('error-text', isError);
}

function createHistoryEmpty(message) {
  const empty = document.createElement('div');
  empty.className = 'history-empty';
  empty.textContent = message;
  return empty;
}

function getSelectedHistoryRecord() {
  return historyRecords.find(record => record.id === selectedHistoryId) || null;
}

function getHistoryRerunBlockers() {
  if (!getSelectedHistoryRecord()) {
    return ['请选择一条历史记录'];
  }
  return getRunReadiness(readFormState()).reasons;
}

function updateYamlSaveButton() {
  els.saveYamlBtn.disabled = !yamlEditDirty;
}

function updateYamlActionButtons() {
  els.copyBtn.disabled = yamlEditDirty;
  els.downloadBtn.disabled = yamlEditDirty;
}

function updateValidationMessage(errors) {
  els.validationMessage.classList.remove('error', 'warning');

  if (errors.length) {
    els.validationMessage.textContent = errors.join(' ');
    els.validationMessage.classList.add('error');
    return;
  }

  if (yamlEditDirty) {
    els.validationMessage.textContent = 'YAML 有未保存编辑';
    els.validationMessage.classList.add('warning');
  } else if (yamlCustomized) {
    els.validationMessage.textContent = 'YAML 编辑已保存';
  } else {
    els.validationMessage.textContent = 'YAML 已就绪';
  }
}

function syncYamlEditor(generatedYaml, formSignature) {
  const formChanged = formSignature !== lastFormSignature;
  lastGeneratedYaml = generatedYaml;

  if (formChanged) {
    currentYaml = generatedYaml;
    els.yamlPreview.value = generatedYaml;
    yamlEditDirty = false;
    yamlCustomized = false;
    lastFormSignature = formSignature;
  }
}

function updatePreview() {
  const state = readFormState();
  const errors = validateState(state);
  const generatedYaml = generateYaml(state);
  syncYamlEditor(generatedYaml, getFormSignature(state));
  els.manualCommand.textContent = state.web.headed && state.platform === 'web'
    ? 'midscene ./mid2yaml-script.yaml --headed'
    : 'midscene ./mid2yaml-script.yaml';

  updateValidationMessage(errors);
  updateYamlSaveButton();
  updateYamlActionButtons();

  const runReadiness = getRunReadiness(state);
  const runReasons = yamlEditDirty
    ? [...runReadiness.reasons, 'YAML 编辑尚未保存']
    : runReadiness.reasons;
  els.runBtn.disabled = errors.length > 0 || !runReadiness.ready || yamlEditDirty;
  els.runBtn.title = runReasons.length ? runReasons.join('；') : '';
  updateModelEnvSummary(state);
  renderHistoryDetail();
  persistState(state);
}

function handleYamlEdit() {
  yamlEditDirty = els.yamlPreview.value !== currentYaml;
  updateValidationMessage(validateState(readFormState()));
  updateYamlSaveButton();
  updateYamlActionButtons();
  updatePreview();
}

function saveYamlEdit() {
  currentYaml = els.yamlPreview.value;
  yamlEditDirty = false;
  yamlCustomized = currentYaml !== lastGeneratedYaml;
  updateValidationMessage(validateState(readFormState()));
  updateYamlSaveButton();
  updateYamlActionButtons();
  updatePreview();

  const original = els.saveYamlBtn.textContent;
  els.saveYamlBtn.textContent = '已保存';
  window.setTimeout(() => {
    els.saveYamlBtn.textContent = original;
  }, 900);
}

function syncPlatformFields() {
  const platform = document.querySelector('input[name="platform"]:checked').value;
  els.webFields.classList.toggle('hidden', platform !== 'web');
  els.computerFields.classList.toggle('hidden', platform !== 'computer');
  const viewportDisabled = platform !== 'web' || els.bridgeMode.value !== 'false';
  els.viewportWidth.disabled = viewportDisabled;
  els.viewportHeight.disabled = viewportDisabled;
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-page').forEach(page => {
    page.classList.toggle('active', page.id === `${tabName}Tab`);
  });
  if (tabName === 'history') {
    loadHistoryRecords();
  }
}

function setHelperStatus(status, message) {
  helperOnline = status === 'online';
  els.helperStatus.className = `status-dot status-${status}`;
  els.helperStatus.textContent = message;
  updatePreview();
}

function setVersionStatus(status, message) {
  midsceneReady = status === 'online';
  els.versionStatus.className = `version-chip status-${status}`;
  els.versionStatus.textContent = message;
  updatePreview();
}

async function copyYaml() {
  await navigator.clipboard.writeText(currentYaml);
  flashButton(els.copyBtn, '已复制');
}

function downloadYaml() {
  const state = readFormState();
  const filenameBase = safeFilename(state.taskName);
  const blob = new Blob([currentYaml], { type: 'application/x-yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filenameBase}.yaml`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function flashButton(button, text) {
  const original = button.textContent;
  button.textContent = text;
  button.disabled = true;
  window.setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 900);
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${HELPER_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

async function checkHelper() {
  try {
    await requestJson('/health');
    setHelperStatus('online', '本地助手已连接');
  } catch {
    setHelperStatus('offline', '本地助手未连接');
  }
}

async function checkVersion() {
  try {
    const data = await requestJson('/midscene/version');
    setHelperStatus('online', '本地助手已连接');
    if (data.installed) {
      setVersionStatus('online', `Midscene: ${data.version || '已安装'}`);
    } else {
      setVersionStatus('error', 'Midscene: 未安装');
    }
  } catch (error) {
    setVersionStatus('error', 'Midscene: 检测失败');
    setHelperStatus('error', error.message.includes('Failed to fetch') ? '本地助手未连接' : '助手返回错误');
  }
}

function renderHistoryList() {
  els.historyList.replaceChildren();

  if (!historyRecords.length) {
    els.historyList.append(createHistoryEmpty('暂无历史运行记录。'));
    return;
  }

  historyRecords.forEach(record => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-item';
    button.classList.toggle('active', record.id === selectedHistoryId);
    button.dataset.id = record.id;

    const header = document.createElement('span');
    header.className = 'history-item-header';

    const title = document.createElement('strong');
    title.textContent = record.taskName || 'Untitled run';

    const type = document.createElement('span');
    type.className = `history-type history-type-${record.platform === 'computer' ? 'computer' : 'web'}`;
    type.textContent = platformLabel(record.platform);

    header.append(title, type);

    const meta = document.createElement('span');
    meta.className = 'history-item-meta';
    meta.textContent = `最后运行：${formatDateTime(record.lastRunAt)} · ${record.runCount || 1} 次 · 退出码 ${record.lastExitCode ?? '-'}`;

    const report = document.createElement('span');
    report.className = 'history-item-report';
    report.textContent = record.lastReportPath || '无报告路径';

    button.append(header, meta, report);
    button.addEventListener('click', () => selectHistoryRecord(record.id));
    els.historyList.append(button);
  });
}

function renderHistoryDetail() {
  const record = getSelectedHistoryRecord();
  const hasRecord = Boolean(record);
  const rerunBlockers = getHistoryRerunBlockers();
  els.copyHistoryBtn.disabled = !hasRecord;
  els.exportHistoryBtn.disabled = !hasRecord;
  els.rerunHistoryBtn.disabled = rerunBlockers.length > 0;
  els.rerunHistoryBtn.title = rerunBlockers.length ? rerunBlockers.join('；') : '';
  els.deleteHistoryBtn.disabled = !hasRecord;
  els.historyRerunHint.textContent = hasRecord && rerunBlockers.length
    ? `再次运行需先满足：${rerunBlockers.join('；')}`
    : '';

  if (!record) {
    els.historyMeta.textContent = '请选择一条历史记录。';
    els.historyYamlPreview.value = '';
    return;
  }

  els.historyMeta.textContent = `${platformLabel(record.platform)} · 最后运行 ${formatDateTime(record.lastRunAt)} · 运行 ${record.runCount || 1} 次`;
  els.historyYamlPreview.value = record.yaml || '';
}

function selectHistoryRecord(id) {
  selectedHistoryId = id;
  renderHistoryList();
  renderHistoryDetail();
}

async function loadHistoryRecords() {
  try {
    const data = await requestJson('/history/runs');
    historyRecords = Array.isArray(data.records) ? data.records : [];
    if (selectedHistoryId && !historyRecords.some(record => record.id === selectedHistoryId)) {
      selectedHistoryId = '';
    }
    if (!selectedHistoryId && historyRecords.length) {
      selectedHistoryId = historyRecords[0].id;
    }
    setHistoryStatus(`共 ${historyRecords.length} 条历史运行记录。`);
    renderHistoryList();
    renderHistoryDetail();
    setHelperStatus('online', '本地助手已连接');
  } catch (error) {
    setHistoryStatus(error.message.includes('Failed to fetch') ? '本地 helper 未连接，无法读取历史记录。' : `读取历史失败：${error.message}`, true);
    els.historyList.replaceChildren(createHistoryEmpty('无法读取历史记录。'));
    renderHistoryDetail();
  }
}

async function saveHistoryRecord(payload) {
  const data = await requestJson('/history/runs', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (data.record) {
    const existingIndex = historyRecords.findIndex(record => record.id === data.record.id);
    if (existingIndex >= 0) {
      historyRecords[existingIndex] = data.record;
    } else {
      historyRecords.unshift(data.record);
    }
    historyRecords.sort((a, b) => new Date(b.lastRunAt).getTime() - new Date(a.lastRunAt).getTime());
    selectedHistoryId = data.record.id;
    renderHistoryList();
    renderHistoryDetail();
    setHistoryStatus(`共 ${historyRecords.length} 条历史运行记录。`);
  }
}

async function copyHistoryYaml() {
  const record = getSelectedHistoryRecord();
  if (!record) {
    return;
  }
  await navigator.clipboard.writeText(record.yaml);
  flashButton(els.copyHistoryBtn, '已复制');
}

function exportHistoryYaml() {
  const record = getSelectedHistoryRecord();
  if (!record) {
    return;
  }
  const blob = new Blob([record.yaml], { type: 'application/x-yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFilename(record.taskName)}.yaml`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function deleteSelectedHistoryRecord() {
  const record = getSelectedHistoryRecord();
  if (!record || !window.confirm(`删除历史记录「${record.taskName || 'Untitled run'}」？`)) {
    return;
  }

  try {
    await requestJson(`/history/runs/${encodeURIComponent(record.id)}`, { method: 'DELETE' });
    historyRecords = historyRecords.filter(item => item.id !== record.id);
    selectedHistoryId = historyRecords[0]?.id || '';
    renderHistoryList();
    renderHistoryDetail();
    setHistoryStatus(`共 ${historyRecords.length} 条历史运行记录。`);
  } catch (error) {
    setHistoryStatus(`删除失败：${error.message}`, true);
  }
}

function assertCanRunWithCurrentModelEnv() {
  const state = readFormState();
  const runReadiness = getRunReadiness(state);
  if (!runReadiness.ready) {
    throw new Error(runReadiness.reasons.join('\n'));
  }
  return state;
}

async function runYamlContent(yaml, runState, historyMeta) {
  const data = await requestJson('/midscene/run', {
    method: 'POST',
    body: JSON.stringify({
      yaml,
      options: {
        headed: historyMeta.platform === 'web' && Boolean(historyMeta.headed),
        dotenvOverride: runState.modelConfig.dotenvOverride,
        modelEnv: buildModelEnv(runState)
      }
    })
  });

  try {
    await saveHistoryRecord({
      yaml,
      taskName: historyMeta.taskName,
      platform: historyMeta.platform,
      headed: historyMeta.headed,
      lastExitCode: data.exitCode,
      lastReportPath: data.reportPath || '',
      lastLog: buildHistoryLog(data)
    });
  } catch (error) {
    setHistoryStatus(`历史保存失败：${error.message}`, true);
  }

  return data;
}

async function rerunSelectedHistoryRecord() {
  const record = getSelectedHistoryRecord();
  if (!record) {
    return;
  }

  let state;
  try {
    state = assertCanRunWithCurrentModelEnv();
  } catch (error) {
    els.executionLogBox.textContent = `[readiness]\n${error.message}`;
    switchTab('runner');
    updatePreview();
    return;
  }

  els.rerunHistoryBtn.disabled = true;
  els.executionLogBox.textContent = `再次运行历史记录：${record.taskName || 'Untitled run'}\n运行中...`;
  els.exitCode.textContent = '-';
  els.reportPath.textContent = '-';
  switchTab('runner');

  try {
    const data = await runYamlContent(record.yaml, state, {
      taskName: record.taskName,
      platform: record.platform,
      headed: record.headed
    });
    els.executionLogBox.textContent = formatExecutionLog(data.stdout, data.stderr);
    els.exitCode.textContent = String(data.exitCode);
    els.reportPath.textContent = data.reportPath || '-';
    setHelperStatus('online', '本地助手已连接');
  } catch (error) {
    els.executionLogBox.textContent = `[error]\n${error.message}`;
    els.exitCode.textContent = 'error';
  } finally {
    updatePreview();
    renderHistoryDetail();
  }
}

async function runYaml() {
  const state = readFormState();
  const errors = validateState(state);
  if (errors.length) {
    els.executionLogBox.textContent = `[validation]\n${errors.join('\n')}`;
    return;
  }
  if (yamlEditDirty) {
    els.executionLogBox.textContent = '[validation]\n请先保存 YAML 编辑。';
    updatePreview();
    return;
  }
  const runReadiness = getRunReadiness(state);
  if (!runReadiness.ready) {
    els.executionLogBox.textContent = `[readiness]\n${runReadiness.reasons.join('\n')}`;
    updatePreview();
    return;
  }

  els.runBtn.disabled = true;
  els.executionLogBox.textContent = '运行中...';
  els.exitCode.textContent = '-';
  els.reportPath.textContent = '-';

  try {
    const data = await runYamlContent(currentYaml, state, {
      taskName: state.taskName || 'Midscene 自动化任务',
      platform: state.platform,
      headed: state.platform === 'web' && state.web.headed
    });
    els.executionLogBox.textContent = formatExecutionLog(data.stdout, data.stderr);
    els.exitCode.textContent = String(data.exitCode);
    els.reportPath.textContent = data.reportPath || '-';
    setHelperStatus('online', '本地助手已连接');
  } catch (error) {
    els.executionLogBox.textContent = `[error]\n${error.message}`;
    els.exitCode.textContent = 'error';
  } finally {
    updatePreview();
  }
}

function resetForm() {
  localStorage.removeItem(STORAGE_KEY);
  lastFormSignature = '';
  writeFormState(clone(defaultState));
  updatePreview();
}

function bindEvents() {
  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });

  document.querySelectorAll('input[name="platform"]').forEach(input => {
    input.addEventListener('change', () => {
      syncPlatformFields();
      updatePreview();
    });
  });

  [
    els.taskName,
    els.webUrl,
    els.viewportWidth,
    els.viewportHeight,
    els.bridgeMode,
    els.headed,
    els.displayId,
    els.modelBaseUrl,
    els.modelApiKey,
    els.modelName,
    els.modelFamily,
    els.dotenvOverride,
    els.stepsText,
    els.assertion
  ].forEach(input => {
    input.addEventListener('input', () => {
      syncPlatformFields();
      updatePreview();
    });
    input.addEventListener('change', () => {
      syncPlatformFields();
      updatePreview();
    });
  });

  els.copyBtn.addEventListener('click', copyYaml);
  els.downloadBtn.addEventListener('click', downloadYaml);
  els.saveYamlBtn.addEventListener('click', saveYamlEdit);
  els.yamlPreview.addEventListener('input', handleYamlEdit);
  els.resetBtn.addEventListener('click', resetForm);
  els.checkHelperBtn.addEventListener('click', checkHelper);
  els.checkVersionBtn.addEventListener('click', checkVersion);
  els.runBtn.addEventListener('click', runYaml);
  els.refreshHistoryBtn.addEventListener('click', loadHistoryRecords);
  els.copyHistoryBtn.addEventListener('click', copyHistoryYaml);
  els.exportHistoryBtn.addEventListener('click', exportHistoryYaml);
  els.rerunHistoryBtn.addEventListener('click', rerunSelectedHistoryRecord);
  els.deleteHistoryBtn.addEventListener('click', deleteSelectedHistoryRecord);
}

bindEvents();
writeFormState(loadState());
updatePreview();
renderHistoryDetail();
checkVersion();
