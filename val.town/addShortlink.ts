export const addShortlink = async (
  req: express.Request,
  res: express.Response,
) => {
  const { to } = req.query;
  const shortlink = req.path;
  if (!/^Bearer github_pat_/.test(req.get("Authorization"))) {
    res.status(401).send("Github PAT authentication required");
    return;
  }
  if (!/^\/[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(shortlink)) {
    res.status(400).send("Invalid shortlink code, must be alphanumeric");
    return;
  }
  const check = await fetch(
    `https://${@me.shortlink_domain}${shortlink}`,
    {
      method: "HEAD",
    },
  );
  switch (check.status) {
    case 200:
      res.status(409).send(`The '${shortlink}'' shortlink already exists`);
      return;
    case 404:
      // This is as expected
      break;
    default:
      res.status(500).send(
        `The shortlink service isn't responding as expected (${check.status}): ${check.statusText}`,
      );
      return;
  }
  try {
    const dest = new URL(to);
    if (dest.hostname === @me.shortlink_domain) {
      res.status(400).send("Self-referencing shortlinks aren't allowed");
      return;
    }
  }
  catch (err) {
    res.status(400).send(`Invalid destination URL: ${err.message}}`);
    return;
  }
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: req.get("Authorization"),
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const path =
    `https://api.github.com/repos/${@me.shortlink_repo}/contents/public/_redirects`;
  const getRes = await fetch(path, {
    method: "GET",
    headers,
  });
  switch (getRes.status) {
    case 200:
      // All is well
      break;
    case 403:
      res.status(500).send(
        `Github is reporting a 403; public/_redirects from ${@me.shortlink_repo} isn't accessible by the access token you're using`,
      );
    case 404:
      res.status(500).send(
        `Github is reporting a 404; public/_redirects doesn't exist in ${@me.shortlink_repo}, or the access token you're using doesn't have read/write permissions.`,
      );
    default:
      res.status(500).send(
        `Github unavailable at ${path} (${getRes.status}): ${getRes.statusText}`,
      );
      return;
  }
  const ghJson = await getRes.json();
  const sha = ghJson.sha;
  let redirects = atob(ghJson.content);
  redirects = `${shortlink} ${to} 302\n${redirects}`;
  const putRes = await fetch(path, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `Adding '${shortlink}' shortlink via API`,
      content: Buffer.from(redirects).toString("base64"),
      sha,
    }),
  });
  switch (putRes.status) {
    case 200:
      res.status(200).send(
        `Shortlink added: https://${@me.shortlink_domain}${shortlink} → ${to}\nTry it in a few mintes, when the change has deployed.`,
      );
      return;
    case 404:
      res.status(401).send(
        `Github is reporting a 404 when trying to update, this probably means your access token doesn't have permission to edit public/_redirects in ${@me.shortlink_repo}`,
      );
      return;
    case 409:
    case 422:
      res.status(500).send(
        `Temporary issue, please try again shortly. (${putRes.status}): ${putRes.statusText}`,
      );
      return;
    default:
      res.status(500).send(
        `Github unavailable (${putRes.status}): ${putRes.statusText}`,
      );
      return;
  }
};