const HELPER_BASE_URL = 'http://127.0.0.1:4317';
const STORAGE_KEY = 'mid2yaml.formState.v1';

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
    displayId: '',
    osHint: 'windows'
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
  osHint: document.querySelector('#osHint'),
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
  runBtn: document.querySelector('#runBtn')
};

let currentYaml = '';
let helperOnline = false;
let midsceneReady = false;
let lastFormSignature = '';
let lastGeneratedYaml = '';
let yamlEditDirty = false;
let yamlCustomized = false;

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
      displayId: els.displayId.value.trim(),
      osHint: els.osHint.value
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
  els.osHint.value = state.computer.osHint;
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
  const filenameBase = (state.taskName || 'mid2yaml-script')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 48) || 'mid2yaml-script';
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
    const data = await requestJson('/midscene/run', {
      method: 'POST',
      body: JSON.stringify({
        yaml: currentYaml,
        options: {
          headed: state.platform === 'web' && state.web.headed,
          dotenvOverride: state.modelConfig.dotenvOverride,
          modelEnv: buildModelEnv(state)
        }
      })
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
    els.osHint,
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
}

bindEvents();
writeFormState(loadState());
updatePreview();
checkVersion();
