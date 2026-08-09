// Netlify Function — Αποστολή παραστατικού στο myDATA
// Τα credentials είναι Netlify env vars — δεν εκτίθενται στον browser
exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const MYDATA_USER = process.env.MYDATA_USER_ID;
  const MYDATA_KEY  = process.env.MYDATA_SUBSCRIPTION_KEY;
  const SANDBOX     = process.env.MYDATA_SANDBOX !== "false"; // default: sandbox

  if (!MYDATA_USER || !MYDATA_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "myDATA credentials not configured on server" }) };
  }

  let xml;
  try { xml = JSON.parse(event.body || "{}").xml; }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request" }) }; }
  if (!xml) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing XML" }) };

  const BASE = SANDBOX
    ? "https://mydataapidev.aade.gr/AADE-Public-api-myDATA-v1_0_8"
    : "https://mydataapi.aade.gr/AADE-Public-api-myDATA-v1_0_8";

  try {
    const res = await fetch(`${BASE}/SendInvoices`, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
        "aade-user-id": MYDATA_USER,
        "Ocp-Apim-Subscription-Key": MYDATA_KEY,
      },
      body: xml,
    });

    const txt = await res.text();
    const mark = txt.match(/<mark>(\d+)<\/mark>/)?.[1] || null;
    const uid  = txt.match(/<uid>([^<]+)<\/uid>/)?.[1]  || null;
    const err  = txt.match(/<message>([^<]+)<\/message>/)?.[1] || null;

    if (mark) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, mark, uid }) };
    } else {
      return { statusCode: 200, headers, body: JSON.stringify({ error: err || "Σφάλμα αποστολής myDATA" }) };
    }
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Σφάλμα σύνδεσης: " + e.message }) };
  }
};
