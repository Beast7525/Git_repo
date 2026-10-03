function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkHealthEndpoint(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.status >= 200 && response.status < 400;
  } catch (_) {
    return false;
  }
}

async function waitForHealth({ hostPort, path = "/health", maxAttempts = 15, delayMs = 2000, appendLog }) {
  const primaryUrl = `http://127.0.0.1:${hostPort}${path}`;
  const fallbackUrl = `http://127.0.0.1:${hostPort}/`;

  appendLog(`Performing health check on ${primaryUrl}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    appendLog(`Health check attempt ${attempt}/${maxAttempts}...`);
    const healthyPrimary = await checkHealthEndpoint(primaryUrl);
    if (healthyPrimary) {
      appendLog(`Health check passed ✓ (Endpoint: ${primaryUrl})`);
      return true;
    }

    if (path !== "/") {
      const healthyFallback = await checkHealthEndpoint(fallbackUrl);
      if (healthyFallback) {
        appendLog(`Health check passed ✓ (Fallback Endpoint: ${fallbackUrl})`);
        return true;
      }
    }

    if (attempt < maxAttempts) {
      await delay(delayMs);
    }
  }

  appendLog("ERROR: Health check timed out. Application container failed to respond to health checks.");
  return false;
}

module.exports = {
  checkHealthEndpoint,
  waitForHealth,
};
