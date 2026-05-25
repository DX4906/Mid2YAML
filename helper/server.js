const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.MID2YAML_HELPER_PORT || 4317);
const MAX_BODY_SIZE = 1024 * 1024;
const PROJECT_ROOT = path.resolve(__dirname, '..');

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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

    sendJson(res, 404, { ok: false, error: 'Not found.' });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Mid2YAML helper listening at http://${HOST}:${PORT}`);
});
