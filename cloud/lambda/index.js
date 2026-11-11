// Estudei Cloud API — salva/recupera o estado do app no DynamoDB (tabela estudei-data)
// GET  /state  -> { ok, state: { appData, flow, updatedAt } | null }
// PUT  /state  -> body { appData, flow, updatedAt }
// Autenticação: header "x-estudei-token" deve bater com a variável de ambiente API_TOKEN.
const zlib = require('zlib');
const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, BatchGetCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE = process.env.TABLE_NAME || 'estudei-data';
const TOKEN = process.env.API_TOKEN || '';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

const pack = (obj) => zlib.gzipSync(Buffer.from(JSON.stringify(obj)));
const unpack = (bin) => JSON.parse(zlib.gunzipSync(Buffer.from(bin)).toString('utf8'));

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

exports.handler = async (event) => {
  const method = (event.requestContext && event.requestContext.http && event.requestContext.http.method) || 'GET';
  // CORS é tratado pela configuração da Function URL
  if (method === 'OPTIONS') return { statusCode: 204 };

  const headers = event.headers || {};
  if (!TOKEN || !safeEqual(headers['x-estudei-token'] || '', TOKEN)) {
    return json(401, { ok: false, error: 'unauthorized' });
  }

  try {
    if (method === 'GET') {
      const meta = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: 'meta' } }));
      if (!meta.Item) return json(200, { ok: true, state: null });
      const m = unpack(meta.Item.data);
      const keys = (m.planIds || []).map((id) => ({ pk: `plan#${id}` }));
      const plans = [];
      if (keys.length) {
        const res = await ddb.send(new BatchGetCommand({ RequestItems: { [TABLE]: { Keys: keys } } }));
        const byPk = {};
        (res.Responses[TABLE] || []).forEach((it) => { byPk[it.pk] = unpack(it.data); });
        (m.planIds || []).forEach((id) => { if (byPk[`plan#${id}`]) plans.push(byPk[`plan#${id}`]); });
      }
      return json(200, {
        ok: true,
        state: { appData: { ...m.appDataRest, plans }, flow: m.flow || null, updatedAt: m.updatedAt || 0 }
      });
    }

    if (method === 'PUT' || method === 'POST') {
      const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '{}';
      const body = JSON.parse(raw);
      const appData = body.appData;
      if (!appData || !Array.isArray(appData.plans)) return json(400, { ok: false, error: 'invalid appData' });
      const updatedAt = Number(body.updatedAt) || Date.now();

      // Evita sobrescrever um estado mais novo com um mais antigo
      const cur = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: 'meta' } }));
      if (cur.Item && Number(cur.Item.updatedAt || 0) > updatedAt) {
        return json(409, { ok: false, error: 'stale', updatedAt: Number(cur.Item.updatedAt) });
      }

      const { plans, ...appDataRest } = appData;
      for (const p of plans) {
        await ddb.send(new PutCommand({ TableName: TABLE, Item: { pk: `plan#${p.id}`, data: pack(p) } }));
      }
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          pk: 'meta',
          updatedAt,
          data: pack({ appDataRest, planIds: plans.map((p) => p.id), flow: body.flow || null, updatedAt })
        }
      }));
      return json(200, { ok: true, updatedAt });
    }

    return json(405, { ok: false, error: 'method not allowed' });
  } catch (err) {
    console.error(err);
    return json(500, { ok: false, error: 'server error' });
  }
};
