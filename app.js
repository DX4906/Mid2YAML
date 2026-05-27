const HELPER_BASE_URL = 'http://127.0.0.1:4317';
const STORAGE_KEY = 'mid2yaml.formState.v1';
const HISTORY_LOG_LIMIT = 12000;
const STATUS_REFRESH_INTERVAL_MS = 5000;

const defaultState = {
  platform: 'web',
  scriptName: '搜索天气',
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
  tasks: [
    {
      name: '搜索天气',
      stepsText: '搜索 "今日天气"',
      assertion: '结果显示天气信息'
    }
  ]
};

const els = {
  helperStatus: document.querySelector('#helperStatus'),
  versionStatus: document.querySelector('#versionStatus'),
  webFields: document.querySelector('#webFields'),
  computerFields: document.querySelector('#computerFields'),
  scriptName: document.querySelector('#scriptName'),
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
  tasksList: document.querySelector('#tasksList'),
  addTaskBtn: document.querySelector('#addTaskBtn'),
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
let yamlSyntaxError = '';
let historyRecords = [];
let selectedHistoryId = '';
let activeRunId = '';
let isRunning = false;
let stopRequested = false;
let statusCheckInFlight = false;
const defaultRunButtonText = els.runBtn.textContent;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDefaultTask(index) {
  const firstTask = defaultState.tasks[0];
  return {
    name: index === 0 ? firstTask.name : `任务 ${index + 1}`,
    stepsText: index === 0 ? firstTask.stepsText : '',
    assertion: index === 0 ? firstTask.assertion : ''
  };
}

function normalizeTasks(state = {}) {
  if (Array.isArray(state.tasks) && state.tasks.length) {
    return state.tasks.map((task, index) => ({
      name: String(task?.name || '').trim() || `任务 ${index + 1}`,
      stepsText: String(task?.stepsText || ''),
      assertion: String(task?.assertion || '').trim()
    }));
  }

  return [
    {
      name: String(state.taskName || defaultState.tasks[0].name).trim(),
      stepsText: String(state.stepsText || defaultState.tasks[0].stepsText),
      assertion: String(state.assertion || '').trim()
    }
  ];
}

function normalizeState(saved = {}) {
  const tasks = normalizeTasks(saved);
  return {
    ...clone(defaultState),
    ...saved,
    scriptName: String(saved.scriptName || saved.taskName || defaultState.scriptName).trim(),
    web: { ...defaultState.web, ...saved?.web },
    computer: { ...defaultState.computer, ...saved?.computer },
    modelConfig: { ...defaultState.modelConfig, ...saved?.modelConfig },
    tasks
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeState(saved);
  } catch {
    return clone(defaultState);
  }
}

function persistState(state) {
  const safeState = clone(state);
  delete safeState.modelConfig.apiKey;
  delete safeState.taskName;
  delete safeState.stepsText;
  delete safeState.assertion;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
}

function readFormState() {
  const tasks = Array.from(els.tasksList.querySelectorAll('.task-card')).map((card, index) => ({
    name: card.querySelector('[data-task-field="name"]').value.trim(),
    stepsText: card.querySelector('[data-task-field="steps"]').value,
    assertion: card.querySelector('[data-task-field="assertion"]').value.trim()
  }));

  return {
    platform: document.querySelector('input[name="platform"]:checked').value,
    scriptName: els.scriptName.value.trim(),
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
    tasks: tasks.length ? tasks : [createDefaultTask(0)]
  };
}

function writeFormState(state) {
  const normalizedState = normalizeState(state);
  document.querySelector(`input[name="platform"][value="${normalizedState.platform}"]`).checked = true;
  els.scriptName.value = normalizedState.scriptName;
  els.webUrl.value = normalizedState.web.url;
  els.viewportWidth.value = normalizedState.web.viewportWidth;
  els.viewportHeight.value = normalizedState.web.viewportHeight;
  els.bridgeMode.value = String(normalizedState.web.bridgeMode);
  els.headed.checked = Boolean(normalizedState.web.headed);
  els.displayId.value = normalizedState.computer.displayId;
  els.modelBaseUrl.value = normalizedState.modelConfig.baseUrl;
  els.modelApiKey.value = '';
  els.modelName.value = normalizedState.modelConfig.modelName;
  els.modelFamily.value = normalizedState.modelConfig.modelFamily;
  els.dotenvOverride.checked = Boolean(normalizedState.modelConfig.dotenvOverride);
  renderTaskEditors(normalizedState.tasks);
  syncPlatformFields();
}

function renderTaskEditors(tasks) {
  els.tasksList.replaceChildren();

  normalizeTasks({ tasks }).forEach((task, index, normalizedTasks) => {
    const card = document.createElement('section');
    card.className = 'task-card';
    card.dataset.taskIndex = String(index);

    const header = document.createElement('div');
    header.className = 'task-card-header';

    const title = document.createElement('strong');
    title.textContent = `任务 ${index + 1}`;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'ghost-button task-remove-button';
    removeButton.dataset.taskAction = 'remove';
    removeButton.textContent = '删除';
    removeButton.disabled = normalizedTasks.length <= 1;

    header.append(title, removeButton);

    const nameLabel = document.createElement('label');
    nameLabel.className = 'field';
    nameLabel.innerHTML = '<span>任务名称</span>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.autocomplete = 'off';
    nameInput.dataset.taskField = 'name';
    nameInput.value = task.name;
    nameLabel.append(nameInput);

    const stepsLabel = document.createElement('label');
    stepsLabel.className = 'field';
    stepsLabel.innerHTML = '<span>执行步骤（每行一个步骤）</span>';
    const stepsTextarea = document.createElement('textarea');
    stepsTextarea.rows = 5;
    stepsTextarea.dataset.taskField = 'steps';
    stepsTextarea.value = task.stepsText;
    stepsLabel.append(stepsTextarea);

    const assertionLabel = document.createElement('label');
    assertionLabel.className = 'field';
    assertionLabel.innerHTML = '<span>断言（可选）</span>';
    const assertionTextarea = document.createElement('textarea');
    assertionTextarea.rows = 2;
    assertionTextarea.dataset.taskField = 'assertion';
    assertionTextarea.value = task.assertion;
    assertionLabel.append(assertionTextarea);

    card.append(header, nameLabel, stepsLabel, assertionLabel);
    els.tasksList.append(card);
  });
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

function shouldQuoteYamlScalar(text) {
  if (!text || text !== text.trim()) {
    return true;
  }
  if (/[\r\n\t]/.test(text)) {
    return true;
  }
  if (/^(?:true|false|null|~|yes|no|on|off)$/i.test(text)) {
    return true;
  }
  if (/^[\-?:,[\]{}#&*!|>'"%@`]/.test(text)) {
    return true;
  }
  return /:\s|\s#/.test(text);
}

function yamlScalar(value) {
  const text = String(value ?? '');
  return shouldQuoteYamlScalar(text) ? JSON.stringify(text) : text;
}

function yamlBooleanOrString(value) {
  if (value === 'false') {
    return 'false';
  }
  return yamlScalar(value);
}

function getYamlLineContent(line) {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (inDoubleQuote) {
      if (char === '\\') {
        index += 1;
      } else if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inSingleQuote) {
      if (char === "'" && next === "'") {
        index += 1;
      } else if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (char === '#') {
      return { content: line.slice(0, index).trimEnd(), quoteError: '' };
    }
    if (char === '"') {
      inDoubleQuote = true;
    } else if (char === "'") {
      inSingleQuote = true;
    }
  }

  if (inDoubleQuote) {
    return { content: line.trimEnd(), quoteError: '双引号未闭合。' };
  }
  if (inSingleQuote) {
    return { content: line.trimEnd(), quoteError: '单引号未闭合。' };
  }
  return { content: line.trimEnd(), quoteError: '' };
}

function isYamlMapping(content) {
  return /^[A-Za-z_][A-Za-z0-9_-]*\s*:\s*.*$/.test(content);
}

function isYamlSequenceItem(content) {
  if (!content.startsWith('- ')) {
    return false;
  }

  const item = content.slice(2).trim();
  return Boolean(item);
}

function getNextYamlContentLine(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const { content } = getYamlLineContent(lines[index]);
    const trimmed = content.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    return {
      lineNumber: index + 1,
      indent: lines[index].match(/^ */)[0].length,
      trimmed
    };
  }

  return null;
}

function validateYamlSyntax(yaml) {
  if (!String(yaml || '').trim()) {
    return 'YAML 内容不能为空。';
  }

  const lines = String(yaml).split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];

    if (line.includes('\t')) {
      return `第 ${lineNumber} 行：缩进必须使用空格，不能使用 tab。`;
    }

    const indent = line.match(/^ */)[0].length;
    if (indent % 2 !== 0) {
      return `第 ${lineNumber} 行：缩进必须使用 2 个空格的倍数。`;
    }

    const { content, quoteError } = getYamlLineContent(line);
    const trimmed = content.trim();
    if (!trimmed) {
      continue;
    }
    if (quoteError) {
      return `第 ${lineNumber} 行：${quoteError}`;
    }
    if (trimmed.startsWith('#')) {
      continue;
    }
    const isMapping = isYamlMapping(trimmed);
    const isSequenceItem = isYamlSequenceItem(trimmed);
    if (!isMapping && !isSequenceItem) {
      return `第 ${lineNumber} 行：语句需要是 key: value、key:、- key: value 或 - value 格式。`;
    }
    if (isSequenceItem) {
      const item = trimmed.slice(2).trim();
      const nextLine = getNextYamlContentLine(lines, index + 1);
      if (!isYamlMapping(item) && nextLine && nextLine.indent > indent) {
        return `第 ${lineNumber} 行：列表项后面有子字段时，需要写成 - key: value 或 - key:。`;
      }
    }
  }

  return '';
}

const INPUT_ACTION_WORDS = '(?:输入|填写)';
const QUOTED_VALUE_PATTERN = '["“”\'‘’]([^"“”\'‘’]+)["“”\'‘’]';
const KEY_NAME_ALIASES = [
  { pattern: /ctrl\s*\+\s*l/i, keyName: 'Control+L' },
  { pattern: /ctrl\s*\+\s*a/i, keyName: 'Control+A' },
  { pattern: /ctrl\s*\+\s*c/i, keyName: 'Control+C' },
  { pattern: /ctrl\s*\+\s*v/i, keyName: 'Control+V' },
  { pattern: /ctrl\s*\+\s+s/i, keyName: 'Control+S' },
  { pattern: /cmd\s*\+\s*space/i, keyName: 'Meta+Space' },
  { pattern: /回车|enter/i, keyName: 'Enter' },
  { pattern: /tab/i, keyName: 'Tab' },
  { pattern: /escape|esc/i, keyName: 'Escape' },
  { pattern: /空格|space/i, keyName: 'Space' },
  { pattern: /退格|backspace/i, keyName: 'Backspace' },
  { pattern: /删除|delete/i, keyName: 'Delete' },
  { pattern: /windows\s*键|win\s*键/i, keyName: 'Meta' }
];

function cleanPrompt(value) {
  return String(value || '')
    .replace(/^[，,。.\s]+|[，,。.\s]+$/g, '')
    .trim();
}

function createFallbackFlowStep(step, platform) {
  return [`- ${platform === 'web' ? 'ai' : 'aiAct'}: ${yamlScalar(step)}`];
}

function hasCompoundAction(text) {
  return /并|然后|再|点击|单击|回车|enter|tab|escape|esc/i.test(text);
}

function parseCompactInputValue(value) {
  const text = cleanPrompt(value);
  if (!text || hasCompoundAction(text) || /^按/.test(text)) {
    return '';
  }
  if (/^[\u4e00-\u9fa5]+$/.test(text)) {
    return '';
  }
  return text;
}

function parseCompactInputAction(body) {
  const text = cleanPrompt(body);
  if (!text || hasCompoundAction(text)) {
    return null;
  }

  let boundaryIndex = text.search(/[A-Za-z]+:\/\//);
  if (boundaryIndex <= 0) {
    boundaryIndex = text.search(/[A-Za-z0-9*#@$%&+=/\\:_.-]/);
  }
  if (boundaryIndex <= 0) {
    return null;
  }

  const prompt = cleanPrompt(text.slice(0, boundaryIndex));
  const value = parseCompactInputValue(text.slice(boundaryIndex));
  if (!prompt || !value) {
    return null;
  }

  return {
    prompt: `${prompt}输入框`,
    value
  };
}

function parseInputAction(step) {
  const text = String(step || '').trim();
  if (!new RegExp(INPUT_ACTION_WORDS).test(text)) {
    return null;
  }

  const quotedPattern = new RegExp(`^在(.+?)(?:中|里|内)?${INPUT_ACTION_WORDS}\\s*${QUOTED_VALUE_PATTERN}\\s*$`);
  let match = text.match(quotedPattern);
  if (match) {
    return {
      prompt: cleanPrompt(match[1]),
      value: match[2]
    };
  }

  const quotedToPattern = new RegExp(`^${INPUT_ACTION_WORDS}\\s*${QUOTED_VALUE_PATTERN}\\s*(?:到|至|进|在)\\s*(.+?)\\s*$`);
  match = text.match(quotedToPattern);
  if (match) {
    return {
      prompt: cleanPrompt(match[2]),
      value: match[1]
    };
  }

  const plainInPattern = new RegExp(`^在(.+?)(?:中|里|内)?${INPUT_ACTION_WORDS}\\s+(.+?)\\s*$`);
  match = text.match(plainInPattern);
  if (match) {
    return {
      prompt: cleanPrompt(match[1]),
      value: cleanPrompt(match[2])
    };
  }

  const plainToPattern = new RegExp(`^${INPUT_ACTION_WORDS}\\s+(.+?)\\s*(?:到|至|进|在)\\s*(.+?)\\s*$`);
  match = text.match(plainToPattern);
  if (match) {
    return {
      prompt: cleanPrompt(match[2]),
      value: cleanPrompt(match[1])
    };
  }

  const compactMatch = text.match(new RegExp(`^${INPUT_ACTION_WORDS}\\s*(.+?)\\s*$`));
  if (compactMatch) {
    return parseCompactInputAction(compactMatch[1]);
  }

  return null;
}

function parseKeyboardAction(step) {
  const text = String(step || '').trim();
  if (new RegExp(INPUT_ACTION_WORDS).test(text) && !/^(?:按下|按|敲)/.test(text)) {
    return null;
  }

  const key = KEY_NAME_ALIASES.find(item => item.pattern.test(text));
  if (!key) {
    return null;
  }

  const targetMatch = text.match(/(?:在|向|给)(.+?)(?:上|中|里|内)?(?:按下|按|敲|键入|输入)/);
  return {
    prompt: cleanPrompt(targetMatch?.[1] || ''),
    keyName: key.keyName
  };
}

function parseScrollAction(step) {
  const text = String(step || '').trim();
  if (!/滚动/.test(text)) {
    return null;
  }

  let direction = 'down';
  if (/向上|往上|上滚/.test(text)) {
    direction = 'up';
  } else if (/向左|往左|左滚/.test(text)) {
    direction = 'left';
  } else if (/向右|往右|右滚/.test(text)) {
    direction = 'right';
  }

  const target = cleanPrompt(
    text
      .replace(/向[上下左右]滚动|往[上下左右]滚动|滚动/g, '')
      .replace(/页面|一下/g, '')
  );

  return {
    prompt: target || text,
    direction
  };
}

function parseTapAction(step) {
  const text = String(step || '').trim();
  if (!/点击|单击/.test(text)) {
    return null;
  }

  const target = cleanPrompt(
    text
      .replace(/^(?:请|帮我|帮忙)?(?:用鼠标)?(?:鼠标)?(?:点击|单击)\s*/, '')
      .replace(/^(?:一下|这个|该|那个|此)\s*/, '')
      .replace(/\s*(?:按钮|按键|链接|入口|菜单项)\s*$/, '')
      .replace(/\s*(?:一下|这个|该|那个|此)\s*$/, '')
  );

  return target || text;
}

function inferFlowStep(step, platform) {
  const inputAction = parseInputAction(step);
  if (inputAction?.prompt && inputAction?.value) {
    return [
      `- aiInput: ${yamlScalar(inputAction.prompt)}`,
      `  value: ${yamlScalar(inputAction.value)}`
    ];
  }

  const keyboardAction = parseKeyboardAction(step);
  if (keyboardAction?.keyName) {
    return [
      `- aiKeyboardPress: ${yamlScalar(keyboardAction.prompt)}`,
      `  keyName: ${yamlScalar(keyboardAction.keyName)}`
    ];
  }

  const scrollAction = parseScrollAction(step);
  if (scrollAction) {
    return [
      `- aiScroll: ${yamlScalar(scrollAction.prompt)}`,
      `  direction: ${yamlScalar(scrollAction.direction)}`
    ];
  }

  const tapAction = parseTapAction(step);
  if (tapAction) {
    return [`- aiTap: ${yamlScalar(tapAction)}`];
  }

  if (/悬停|移到|移动到/.test(step)) {
    return [`- aiHover: ${yamlScalar(step)}`];
  }

  return createFallbackFlowStep(step, platform);
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

  lines.push('');
  lines.push('agent:');
  lines.push(`  testId: ${yamlScalar(state.scriptName || 'Midscene 自动化脚本')}`);
  lines.push('');
  lines.push('tasks:');
  state.tasks.forEach((task, index) => {
    const taskName = task.name || `任务 ${index + 1}`;
    const steps = parseLines(task.stepsText);

    lines.push(`  - name: ${yamlScalar(taskName)}`);
    lines.push('    flow:');

    steps.forEach(step => {
      inferFlowStep(step, state.platform).forEach(line => {
        lines.push(`      ${line}`);
      });
      lines.push('      - sleep: 100');
    });

    if (task.assertion) {
      lines.push(`      - aiAssert: ${yamlScalar(task.assertion)}`);
    }
  });

  return `${lines.join('\n')}\n`;
}

function getFormSignature(state) {
  return JSON.stringify(state);
}

function validateState(state) {
  const errors = [];
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];

  if (!state.scriptName) {
    errors.push('请填写脚本名称。');
  }
  if (state.platform === 'web' && !state.web.url) {
    errors.push('Web 脚本需要目标 URL。');
  }
  if (!tasks.length) {
    errors.push('请至少添加一个任务。');
  }
  tasks.forEach((task, index) => {
    if (!task.name) {
      errors.push(`请填写任务 ${index + 1} 的名称。`);
    }
    if (parseLines(task.stepsText).length === 0) {
      errors.push(`请至少填写任务 ${index + 1} 的一个执行步骤。`);
    }
  });
  if (!tasks.some(task => parseLines(task.stepsText).length > 0)) {
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

function formatRunDiagnostics(data = {}) {
  const sections = [];
  const warnings = Array.isArray(data.warnings) ? data.warnings : [];

  if (!warnings.length) {
    return '';
  }

  sections.push('[diagnostics]');
  warnings.forEach(warning => {
    sections.push(`- ${warning.message || warning.type || '运行提示'}`);
  });

  if (data.summaryPath) {
    sections.push(`Summary: ${data.summaryPath}`);
  }

  return sections.join('\n');
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
  return formatRunResultLog(data).slice(0, HISTORY_LOG_LIMIT);
}

function createRunId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function beginRun() {
  activeRunId = createRunId();
  isRunning = true;
  stopRequested = false;
  updatePreview();
  return activeRunId;
}

function finishRun(runId) {
  if (runId && activeRunId && runId !== activeRunId) {
    return;
  }
  activeRunId = '';
  isRunning = false;
  stopRequested = false;
  updatePreview();
}

function formatRunResultLog(data) {
  const sections = [];
  const diagnostics = formatRunDiagnostics(data);
  const log = formatExecutionLog(data.stdout, data.stderr);

  if (data.stopped) {
    sections.push('[stopped]\n已手动停止运行。');
  }
  if (diagnostics) {
    sections.push(diagnostics);
  }
  sections.push(log);

  return sections.join('\n\n');
}

function updateRunButtonState(disabled, title) {
  els.runBtn.classList.toggle('danger-button', isRunning);
  els.runBtn.textContent = isRunning
    ? (stopRequested ? '停止中...' : '停止运行')
    : defaultRunButtonText;
  els.runBtn.disabled = isRunning ? stopRequested : disabled;
  els.runBtn.title = isRunning ? '停止当前 YAML 运行' : title;
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
  if (isRunning) {
    return ['YAML 正在运行'];
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

  if (yamlSyntaxError) {
    els.validationMessage.textContent = `YAML 格式错误：${yamlSyntaxError}`;
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
    yamlSyntaxError = '';
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
  updateRunButtonState(
    errors.length > 0 || !runReadiness.ready || yamlEditDirty,
    runReasons.length ? runReasons.join('；') : ''
  );
  updateModelEnvSummary(state);
  renderHistoryDetail();
  persistState(state);
}

function handleYamlEdit() {
  yamlEditDirty = els.yamlPreview.value !== currentYaml;
  yamlSyntaxError = '';
  updateValidationMessage(validateState(readFormState()));
  updateYamlSaveButton();
  updateYamlActionButtons();
  updatePreview();
}

function saveYamlEdit() {
  const syntaxError = validateYamlSyntax(els.yamlPreview.value);
  if (syntaxError) {
    yamlSyntaxError = syntaxError;
    updateValidationMessage(validateState(readFormState()));
    return;
  }

  yamlSyntaxError = '';
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
  const filenameBase = safeFilename(state.scriptName);
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

async function refreshRuntimeStatus(options = {}) {
  const force = Boolean(options.force);
  if (statusCheckInFlight || (isRunning && !force)) {
    return;
  }

  statusCheckInFlight = true;
  try {
    const data = await requestJson('/midscene/version');
    setHelperStatus('online', '本地助手已连接');
    if (data.installed) {
      setVersionStatus('online', `Midscene: ${data.version || '已安装'}`);
    } else {
      setVersionStatus('error', 'Midscene: 未安装');
    }
  } catch (error) {
    if (error.message.includes('Failed to fetch')) {
      setHelperStatus('offline', '本地助手未连接');
      setVersionStatus('offline', 'Midscene: 未检测');
    } else {
      setHelperStatus('error', '助手返回错误');
      setVersionStatus('error', 'Midscene: 检测失败');
    }
  } finally {
    statusCheckInFlight = false;
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
    title.textContent = record.scriptName || record.taskName || 'Untitled run';

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
  anchor.download = `${safeFilename(record.scriptName || record.taskName)}.yaml`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function deleteSelectedHistoryRecord() {
  const record = getSelectedHistoryRecord();
  if (!record || !window.confirm(`删除历史记录「${record.scriptName || record.taskName || 'Untitled run'}」？`)) {
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

async function runYamlContent(yaml, runState, historyMeta, runId) {
  const data = await requestJson('/midscene/run', {
    method: 'POST',
    body: JSON.stringify({
      yaml,
      options: {
        runId,
        headed: historyMeta.platform === 'web' && Boolean(historyMeta.headed),
        dotenvOverride: runState.modelConfig.dotenvOverride,
        modelEnv: buildModelEnv(runState)
      }
    })
  });

  try {
    await saveHistoryRecord({
      yaml,
      scriptName: historyMeta.scriptName,
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

async function stopCurrentRun() {
  if (!isRunning || !activeRunId || stopRequested) {
    return;
  }

  stopRequested = true;
  updatePreview();

  try {
    await requestJson('/midscene/stop', {
      method: 'POST',
      body: JSON.stringify({ runId: activeRunId })
    });
  } catch (error) {
    stopRequested = false;
    els.executionLogBox.textContent = `${els.executionLogBox.textContent}\n\n[stop error]\n${error.message}`;
    updatePreview();
  }
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

  els.executionLogBox.textContent = `再次运行历史记录：${record.scriptName || record.taskName || 'Untitled run'}\n运行中...`;
  els.exitCode.textContent = '-';
  els.reportPath.textContent = '-';
  switchTab('runner');
  const runId = beginRun();

  try {
    const data = await runYamlContent(record.yaml, state, {
      scriptName: record.scriptName || record.taskName,
      platform: record.platform,
      headed: record.headed
    }, runId);
    els.executionLogBox.textContent = formatRunResultLog(data);
    els.exitCode.textContent = data.stopped ? 'stopped' : String(data.exitCode);
    els.reportPath.textContent = data.reportPath || '-';
    setHelperStatus('online', '本地助手已连接');
  } catch (error) {
    els.executionLogBox.textContent = `[error]\n${error.message}`;
    els.exitCode.textContent = 'error';
  } finally {
    finishRun(runId);
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

  els.executionLogBox.textContent = '运行中...';
  els.exitCode.textContent = '-';
  els.reportPath.textContent = '-';
  const runId = beginRun();

  try {
    const data = await runYamlContent(currentYaml, state, {
      scriptName: state.scriptName || 'Midscene 自动化脚本',
      platform: state.platform,
      headed: state.platform === 'web' && state.web.headed
    }, runId);
    els.executionLogBox.textContent = formatRunResultLog(data);
    els.exitCode.textContent = data.stopped ? 'stopped' : String(data.exitCode);
    els.reportPath.textContent = data.reportPath || '-';
    setHelperStatus('online', '本地助手已连接');
  } catch (error) {
    els.executionLogBox.textContent = `[error]\n${error.message}`;
    els.exitCode.textContent = 'error';
  } finally {
    finishRun(runId);
  }
}

function resetForm() {
  localStorage.removeItem(STORAGE_KEY);
  lastFormSignature = '';
  writeFormState(clone(defaultState));
  updatePreview();
}

function addTask() {
  const state = readFormState();
  state.tasks.push(createDefaultTask(state.tasks.length));
  renderTaskEditors(state.tasks);
  updatePreview();
}

function removeTask(index) {
  const state = readFormState();
  if (state.tasks.length <= 1) {
    return;
  }
  state.tasks.splice(index, 1);
  renderTaskEditors(state.tasks);
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
    els.scriptName,
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
    els.dotenvOverride
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
  els.addTaskBtn.addEventListener('click', addTask);
  els.tasksList.addEventListener('input', updatePreview);
  els.tasksList.addEventListener('change', updatePreview);
  els.tasksList.addEventListener('click', event => {
    const button = event.target.closest('[data-task-action="remove"]');
    if (!button) {
      return;
    }
    const card = button.closest('.task-card');
    removeTask(Number(card?.dataset.taskIndex || 0));
  });
  els.downloadBtn.addEventListener('click', downloadYaml);
  els.saveYamlBtn.addEventListener('click', saveYamlEdit);
  els.yamlPreview.addEventListener('input', handleYamlEdit);
  els.resetBtn.addEventListener('click', resetForm);
  els.runBtn.addEventListener('click', () => {
    if (isRunning) {
      stopCurrentRun();
      return;
    }
    runYaml();
  });
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
refreshRuntimeStatus({ force: true });
window.setInterval(() => {
  refreshRuntimeStatus();
}, STATUS_REFRESH_INTERVAL_MS);
