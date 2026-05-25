const http = require('node:http');
const { spawn } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.MID2YAML_HELPER_PORT || 4317);
const MAX_BODY_SIZE = 1024 * 1024;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const HISTORY_FILE = path.join(PROJECT_ROOT, '.mid2yaml-history.json');
const MAX_HISTORY_LOG_LENGTH = 12000;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_SIZE) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function commandName(base) {
  return process.platform === 'win32' ? `${base}.cmd` : base;
}

function runCommand(command, args, options = {}) {
  return new Promise(resolve => {
    let child;
    try {
      child = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        env: {
          ...process.env,
          ...(options.env || {})
        },
        shell: process.platform === 'win32',
        windowsHide: true
      });
    } catch (error) {
      resolve({
        ok: false,
        error: error.message,
        stdout: '',
        stderr: '',
        exitCode: null
      });
      return;
    }

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', error => {
      resolve({
        ok: false,
        error: error.message,
        stdout,
        stderr,
        exitCode: null
      });
    });
    child.on('close', exitCode => {
      resolve({
        ok: exitCode === 0,
        stdout,
        stderr,
        exitCode
      });
    });
  });
}

function sanitizeModelEnv(modelEnv) {
  const allowedKeys = new Set([
    'MIDSCENE_MODEL_BASE_URL',
    'MIDSCENE_MODEL_API_KEY',
    'MIDSCENE_MODEL_NAME',
    'MIDSCENE_MODEL_FAMILY'
  ]);
  const env = {};

  if (!modelEnv || typeof modelEnv !== 'object') {
    return env;
  }

  Object.entries(modelEnv).forEach(([key, value]) => {
    if (allowedKeys.has(key) && typeof value === 'string' && value.trim()) {
      env[key] = value.trim();
    }
  });

  return env;
}

async function getMidsceneVersion() {
  const result = await runCommand(commandName('midscene'), ['--version']);
  if (result.ok) {
    return {
      installed: true,
      version: (result.stdout || result.stderr).trim(),
      source: 'midscene'
    };
  }

  return {
    installed: false,
    version: '',
    source: 'midscene',
    error: result.error || result.stderr || 'Midscene CLI not found.'
  };
}

function inferReportPath(stdout, stderr) {
  const text = `${stdout}\n${stderr}`;
  const htmlMatch = text.match(/(?:report|报告)[^\n\r]*?([A-Za-z]:\\[^\n\r]+?\.html|\/[^\n\r]+?\.html|\.{1,2}\/[^\n\r]+?\.html)/i);
  if (htmlMatch) {
    return htmlMatch[1].trim();
  }
  const jsonMatch = text.match(/([A-Za-z]:\\[^\n\r]+?index\.json|\/[^\n\r]+?index\.json|\.{1,2}\/[^\n\r]+?index\.json)/i);
  return jsonMatch ? jsonMatch[1].trim() : '';
}

async function runMidsceneYaml(yaml, options) {
  if (!yaml || typeof yaml !== 'string') {
    return {
      ok: false,
      error: 'YAML content is required.',
      exitCode: null,
      stdout: '',
      stderr: ''
    };
  }

  const tempFile = path.join(os.tmpdir(), `mid2yaml-${randomUUID()}.yaml`);
  await fs.writeFile(tempFile, yaml, 'utf8');

  const args = [tempFile];
  if (options?.headed) {
    args.push('--headed');
  }
  if (options?.dotenvOverride) {
    args.push('--dotenv-override');
  }

  try {
    const result = await runCommand(commandName('midscene'), args, {
      cwd: PROJECT_ROOT,
      env: sanitizeModelEnv(options?.modelEnv)
    });
    return {
      ...result,
      reportPath: inferReportPath(result.stdout, result.stderr),
      tempFile
    };
  } finally {
    try {
      await fs.unlink(tempFile);
    } catch {
      // The temp file path is explicit; ignore cleanup failures so the run result remains visible.
    }
  }
}

function hashYaml(yaml) {
  return createHash('sha256').update(yaml, 'utf8').digest('hex');
}

function normalizeHistoryRecord(record) {
  return {
    id: String(record.id || record.yamlHash || randomUUID()),
    yamlHash: String(record.yamlHash || ''),
    taskName: String(record.taskName || 'Untitled run'),
    platform: record.platform === 'computer' ? 'computer' : 'web',
    yaml: String(record.yaml || ''),
    headed: Boolean(record.headed),
    createdAt: String(record.createdAt || record.lastRunAt || new Date().toISOString()),
    lastRunAt: String(record.lastRunAt || new Date().toISOString()),
    runCount: Number.isFinite(Number(record.runCount)) ? Number(record.runCount) : 1,
    lastExitCode: record.lastExitCode ?? null,
    lastReportPath: String(record.lastReportPath || ''),
    lastLog: String(record.lastLog || '').slice(0, MAX_HISTORY_LOG_LENGTH)
  };
}

async function readHistoryRecords() {
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(record => record && typeof record === 'object')
      .map(normalizeHistoryRecord)
      .sort((a, b) => new Date(b.lastRunAt).getTime() - new Date(a.lastRunAt).getTime());
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeHistoryRecords(records) {
  await fs.writeFile(HISTORY_FILE, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
}

async function upsertHistoryRecord(payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.yaml !== 'string' || !payload.yaml.trim()) {
    throw new Error('YAML content is required.');
  }

  const records = await readHistoryRecords();
  const yamlHash = hashYaml(payload.yaml);
  const existingIndex = records.findIndex(record => record.yamlHash === yamlHash);
  const now = new Date().toISOString();
  const existing = existingIndex >= 0 ? records[existingIndex] : null;
  const nextRecord = normalizeHistoryRecord({
    ...existing,
    id: existing?.id || randomUUID(),
    yamlHash,
    taskName: payload.taskName,
    platform: payload.platform,
    yaml: payload.yaml,
    headed: payload.headed,
    createdAt: existing?.createdAt || now,
    lastRunAt: now,
    runCount: existing ? existing.runCount + 1 : 1,
    lastExitCode: payload.lastExitCode ?? null,
    lastReportPath: payload.lastReportPath,
    lastLog: payload.lastLog
  });

  if (existingIndex >= 0) {
    records[existingIndex] = nextRecord;
  } else {
    records.push(nextRecord);
  }

  records.sort((a, b) => new Date(b.lastRunAt).getTime() - new Date(a.lastRunAt).getTime());
  await writeHistoryRecords(records);
  return nextRecord;
}

async function deleteHistoryRecord(id) {
  const records = await readHistoryRecords();
  const nextRecords = records.filter(record => record.id !== id);
  await writeHistoryRecords(nextRecords);
  return records.length !== nextRecords.length;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, name: 'mid2yaml-helper' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/midscene/version') {
      const version = await getMidsceneVersion();
      sendJson(res, 200, { ok: true, ...version });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/midscene/run') {
      const body = await readJsonBody(req);
      const result = await runMidsceneYaml(body.yaml, body.options || {});
      sendJson(res, result.error ? 400 : 200, result);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/history/runs') {
      const records = await readHistoryRecords();
      sendJson(res, 200, { ok: true, records });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/history/runs') {
      const body = await readJsonBody(req);
      const record = await upsertHistoryRecord(body);
      sendJson(res, 200, { ok: true, record });
      return;
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/history/runs/')) {
      const id = decodeURIComponent(url.pathname.slice('/history/runs/'.length));
      const deleted = await deleteHistoryRecord(id);
      sendJson(res, deleted ? 200 : 404, deleted ? { ok: true } : { ok: false, error: 'History record not found.' });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found.' });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Mid2YAML helper listening at http://${HOST}:${PORT}`);
});
