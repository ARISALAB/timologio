// Netlify Function: proxy για ΓΓΠΣ SOAP API (αποφεύγει CORS)
exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  let afmToSearch, calledByAfm, username, password;
  try {
    const body = JSON.parse(event.body || "{}");
    afmToSearch  = body.afm;
    calledByAfm  = body.calledByAfm;
    username     = body.username;
    password     = body.password;
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  if (!afmToSearch || !username || !password) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields: afm, username, password" }) };
  }

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope
  xmlns:env="http://www.w3.org/2003/05/soap-envelope"
  xmlns:ns="http://gr/gsis/rgwspublic/RgWsPublic.wsdl">
  <env:Header>
    <ns:RgWsPublicBasicAuth>
      <ns:UserId>${username}</ns:UserId>
      <ns:UserPassword>${password}</ns:UserPassword>
    </ns:RgWsPublicBasicAuth>
  </env:Header>
  <env:Body>
    <ns:rgWsPublicAfmMethod>
      <ns:INPUT_REC>
        <ns:afm_called_by>${calledByAfm || username}</ns:afm_called_by>
        <ns:afm_called_for>${afmToSearch}</ns:afm_called_for>
      </ns:INPUT_REC>
    </ns:rgWsPublicAfmMethod>
  </env:Body>
</env:Envelope>`;

  try {
    const res = await fetch("https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2", {
      method: "POST",
      headers: {
        "Content-Type": "application/soap+xml;charset=UTF-8",
        "SOAPAction": "",
      },
      body: soapBody,
    });

    const xml = await res.text();

    // Parse XML response
    const get = (tag) => {
      const m = xml.match(new RegExp(`<[^:]*:?${tag}[^>]*>([^<]*)<`));
      return m ? m[1].trim() : "";
    };

    const errorCode = get("error_code") || get("pError_code");
    if (errorCode && errorCode !== "0") {
      const errorDescr = get("error_descr") || get("pError_descr") || "Σφάλμα ΓΓΠΣ";
      return { statusCode: 200, headers, body: JSON.stringify({ error: errorDescr, code: errorCode }) };
    }

    // Extract fields
    const result = {
      afm:           get("afm") || afmToSearch,
      name:          get("onomasia") || get("eponymo"),
      fullName:      get("full_name") || "",
      legalName:     get("legalName") || "",
      address:       get("parodos") ? `${get("odos")} ${get("arithmos")}, ${get("parodos")}`.trim() : `${get("odos")} ${get("arithmos")}`.trim(),
      city:          get("poli") || get("perifereia") || "",
      postalCode:    get("tk") || "",
      doy:           get("doy_descr") || get("doy") || "",
      registDate:    get("regist_date") || "",
      stopDate:      get("stop_date") || "",
      firm_flag:     get("firm_flag") || "",
      i_ni_flag:     get("i_ni_flag") || "",     // Ν=Νομικό Πρόσωπο, Φ=Φυσικό
      deactivated:   get("deactivate_flag") === "1",
      activity:      get("kad_descr") || "",
      activityCode:  get("kad_code") || "",
      raw: xml,
    };

    // Build clean display name
    if (!result.name) {
      const eponymo = get("eponymo");
      const onoma   = get("onoma");
      const patronymo = get("patronymo");
      if (eponymo) result.name = [eponymo, onoma, patronymo].filter(Boolean).join(" ");
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, data: result }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Network error: " + err.message }) };
  }
};
