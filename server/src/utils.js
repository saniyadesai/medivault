import crypto from 'crypto';

export function normalizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

/**
 * fetch() with retries on transient upstream failures (503 "high demand"
 * from the AI provider, 429 rate limits). Verified this isn't about request
 * size or a hard rejection: the identical request shape/size sometimes
 * 503s in ~20s and sometimes succeeds in ~50s — genuine intermittent
 * capacity variance on the provider's side, not a bug in what we send.
 * With a 240s AI_TIMEOUT_MS budget (see app.js/chat.js/embeddings.js) there's
 * real room to just try again rather than surface the first failure. Same
 * call signature as fetch(); returns the final response (success or last
 * failure) for the caller to handle exactly as it already does with a bare
 * fetch() — no other code changes needed at call sites.
 */
export async function fetchWithRetry(url, options, { retries = 3, retryDelayMs = 2500, retryableStatuses = [503, 429] } = {}) {
  let res;
  for (let attempt = 0; attempt <= retries; attempt++) {
    res = await fetch(url, options);
    if (res.ok || !retryableStatuses.includes(res.status)) return res;
    if (attempt < retries) {
      console.warn(`Upstream ${url} returned ${res.status}, retrying (${attempt + 1}/${retries}) in ${retryDelayMs * (attempt + 1)}ms...`);
      await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
    }
  }
  return res;
}

/**
 * Chat-completions call with retry (fetchWithRetry) on the primary model,
 * then one attempt on a fallback model if the primary is still failing
 * with a retryable status after all its retries. Verified this is worth
 * having: the primary model (gemini-3.6-flash, a reasoning model) has
 * real intermittent capacity problems, while a lighter fallback model
 * answered the identical request in ~2s with no retries needed.
 * `buildBody(model)` lets each call site's message/prompt construction
 * stay in the call site — this just handles which model goes in and
 * when to give up on it.
 */
export async function callAIChatCompletion({ url, headers, buildBody, primaryModel, fallbackModel, signal, retryOptions }) {
  const attempt = (model) => fetchWithRetry(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildBody(model)),
    signal,
  }, retryOptions);

  const primaryRes = await attempt(primaryModel);
  if (primaryRes.ok || !fallbackModel || ![503, 429].includes(primaryRes.status)) {
    return primaryRes;
  }
  console.warn(`Primary model "${primaryModel}" still failing (${primaryRes.status}) after retries, trying fallback "${fallbackModel}"...`);
  return attempt(fallbackModel);
}

/**
 * Age in whole years as of today, from a date_of_birth column value.
 * Doctors read age directly, not a raw DOB they have to do math on — this
 * is what actually surfaces the "age" a doctor asked for, not just storing
 * date_of_birth (which was already collected before that request).
 * @param {Date|string|null} dateOfBirth
 * @returns {number|null}
 */
export function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasNotHadBirthdayYet =
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
  if (hasNotHadBirthdayYet) age--;
  return age;
}

/* ── snake_case → camelCase row mapper ── */
function toCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function camelRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const camelKey = toCamel(k);
    // Parse JSON fields if they appear to be JSON strings
    if (camelKey === 'documentIds' && typeof v === 'string') {
      try {
        out[camelKey] = JSON.parse(v);
      } catch {
        out[camelKey] = v;
      }
    } else {
      out[camelKey] = v;
    }
  }
  return out;
}

export function camelRows(rows) {
  return rows.map(camelRow);
}

/* ── HMAC-signed token (survives server restarts) ── */
const TOKEN_SECRET = process.env.SESSION_SECRET;
if (!TOKEN_SECRET) {
  throw new Error(
    'FATAL: SESSION_SECRET environment variable is not set. ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
  );
}

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export function issueToken(userId, role) {
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    role,
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function resolveSession(token) {
  try {
    const parts = (token || '').split('.');
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
    // Timing-safe comparison
    const sigBuf = Buffer.from(sig, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    // Enforce token expiry
    if (!data.exp || Date.now() > data.exp) return null;
    return { userId: data.sub, role: data.role };
  } catch {
    return null;
  }
}

export function revokeToken() {
  // Stateless tokens expire after TOKEN_TTL_MS (8 hours).
  // For immediate revocation: add token signature to a DB `revoked_tokens` table
  // and check it in resolveSession before returning the session.
}

export function makeSafeUser(userRow, profile = {}) {
  return {
    id: userRow.id,
    email: userRow.email,
    role: userRow.role,
    profile,
  };
}

/* ── Auth middleware ── */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  const session = resolveSession(token);
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized. Please log in.' });
  }
  req.userId = session.userId;
  req.userRole = session.role;
  next();
}
