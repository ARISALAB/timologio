// Netlify Function — ΓΓΠΣ proxy με τους δικούς σου κωδικούς
// Ο χρήστης δεν χρειάζεται δικούς του κωδικούς ΓΓΠΣ
exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Τα credentials σου — αποθηκεύονται ως Netlify env vars
  // ΠΟΤΕ δεν εκτίθενται στο frontend
  const GSIS_USER = process.env.GSIS_USERNAME;
  const GSIS_PASS = process.env.GSIS_PASSWORD;
  const GSIS_AFM  = process.env.GSIS_AFM; // το δικό σου ΑΦΜ

  if (!GSIS_USER || !GSIS_PASS) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "ΓΓΠΣ credentials not configured on server" }) };
  }

  let afmToSearch;
  try {
    const body = JSON.parse(event.body || "{}");
    afmToSearch = body.afm?.trim();
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request" }) };
  }

  if (!afmToSearch || afmToSearch.length < 9) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Εισάγετε έγκυρο ΑΦΜ" }) };
  }

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope
  xmlns:env="http://www.w3.org/2003/05/soap-envelope"
  xmlns:ns="http://gr/gsis/rgwspublic/RgWsPublic.wsdl">
  <env:Header>
    <ns:RgWsPublicBasicAuth>
      <ns:UserId>${GSIS_USER}</ns:UserId>
      <ns:UserPassword>${GSIS_PASS}</ns:UserPassword>
    </ns:RgWsPublicBasicAuth>
  </env:Header>
  <env:Body>
    <ns:rgWsPublicAfmMethod>
      <ns:INPUT_REC>
        <ns:afm_called_by>${GSIS_AFM || GSIS_USER}</ns:afm_called_by>
        <ns:afm_called_for>${afmToSearch}</ns:afm_called_for>
      </ns:INPUT_REC>
    </ns:rgWsPublicAfmMethod>
  </env:Body>
</env:Envelope>`;

  try {
    const res = await fetch("https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2", {
      method: "POST",
      headers: { "Content-Type": "application/soap+xml;charset=UTF-8" },
      body: soapBody,
    });

    const xml = await res.text();
    const get = (tag) => {
      const m = xml.match(new RegExp(`<[^:>]*:?${tag}[^>]*>([^<]*)<`));
      return m ? m[1].trim() : "";
    };

    const errCode = get("error_code") || get("pError_code");
    if (errCode && errCode !== "0") {
      const errMsg = get("error_descr") || get("pError_descr") || `Σφάλμα ΓΓΠΣ (${errCode})`;
      return { statusCode: 200, headers, body: JSON.stringify({ error: errMsg }) };
    }

    const odos     = get("odos");
    const arithmos = get("arithmos");
    const result = {
      afm:         afmToSearch,
      name:        get("onomasia") || [get("eponymo"),get("onoma"),get("patronymo")].filter(Boolean).join(" "),
      address:     [odos, arithmos].filter(Boolean).join(" "),
      city:        get("poli") || get("perifereia"),
      postalCode:  get("tk"),
      doy:         get("doy_descr") || get("doy"),
      activity:    get("kad_descr"),
      activityCode:get("kad_code"),
      deactivated: get("deactivate_flag") === "1",
    };

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, data: result }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Σφάλμα σύνδεσης: " + err.message }) };
  }
};
