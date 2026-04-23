import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import http from 'node:http';

import { getInboxEventById, loadInboxEvents } from './src/read-model.js';
import { replayInboxEvent, triggerGithubPush } from './src/runtime-store.js';

export function getServerConfig(env = process.env) {
  return {
    port: Number.parseInt(env.PORT ?? '3000', 10),
    tailscaleIp: env.TAILSCALE_IP ?? null
  };
}

export function getListenHosts({ tailscaleIp }) {
  const hosts = ['127.0.0.1'];

  if (tailscaleIp && tailscaleIp !== '127.0.0.1' && tailscaleIp !== 'localhost') {
    hosts.push(tailscaleIp);
  }

  return hosts;
}

const { port: PORT, tailscaleIp: TAILSCALE_IP } = getServerConfig();
const ROOT = process.cwd();

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function resolvePath(urlPathname) {
  const pathname = urlPathname === '/' ? '/index.html' : urlPathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  return join(ROOT, safePath);
}

function jsonResponse(status, body) {
  return {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body)
  };
}

function errorResponse(status, message) {
  return jsonResponse(status, { error: message });
}

function parseJsonBody(body) {
  if (!body) {
    throw new Error('Request body is required');
  }

  return JSON.parse(body);
}

export async function routeRequest({
  method,
  pathname,
  headers = {},
  body = '',
  root = ROOT,
  env = process.env,
  fetchImpl
}) {
  if (method === 'GET' && pathname === '/api/events') {
    return jsonResponse(200, loadInboxEvents({ root, env }));
  }

  if (method === 'GET' && pathname.startsWith('/api/events/')) {
    const eventId = pathname.replace('/api/events/', '');
    const event = getInboxEventById(eventId, { root, env });

    if (!event) {
      return errorResponse(404, 'Event not found');
    }

    return jsonResponse(200, event);
  }

  if (method === 'POST' && pathname === '/api/events/trigger/github/push') {
    try {
      const payload = parseJsonBody(body);
      const deliveryId = headers['x-github-delivery'];
      const event = await triggerGithubPush({
        deliveryId,
        payload,
        root,
        env,
        fetchImpl
      });

      return jsonResponse(202, event);
    } catch (error) {
      return errorResponse(error.statusCode ?? 400, error.message);
    }
  }

  if (method === 'POST' && pathname.startsWith('/api/events/') && pathname.endsWith('/replay')) {
    const eventId = pathname.replace('/api/events/', '').replace('/replay', '');
    const event = replayInboxEvent({
      eventId,
      root,
      env
    });

    if (!event) {
      return errorResponse(404, 'Event not found');
    }

    return jsonResponse(202, event);
  }

  return null;
}

export function createRequestHandler(root = ROOT) {
  return async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const body =
      request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH'
        ? await new Promise((resolve, reject) => {
            const chunks = [];

            request.on('data', (chunk) => chunks.push(chunk));
            request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            request.on('error', reject);
          })
        : '';
    const apiResponse = await routeRequest({
      method: request.method ?? 'GET',
      pathname: url.pathname,
      headers: request.headers,
      body,
      root
    });

    if (apiResponse) {
      response.writeHead(apiResponse.status, apiResponse.headers);
      response.end(apiResponse.body);
      return;
    }

    const filePath = resolvePath(url.pathname);

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const contentType = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream';
    response.writeHead(200, { 'content-type': contentType });
    createReadStream(filePath).pipe(response);
  };
}

const isDirectRun =
  process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url;

if (isDirectRun) {
  const listenHosts = getListenHosts({ tailscaleIp: TAILSCALE_IP });

  for (const host of listenHosts) {
    const server = http.createServer(createRequestHandler());
    server.listen(PORT, host, () => {
      console.log(`Pathway Inbox demo available at http://${host}:${PORT}`);
    });
  }
}
