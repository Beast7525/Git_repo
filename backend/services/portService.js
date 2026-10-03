const net = require("net");

const START_PORT = parseInt(process.env.DEPLOY_PORT_RANGE_START || "31000", 10);
const END_PORT = parseInt(process.env.DEPLOY_PORT_RANGE_END || "32000", 10);

const allocatedPorts = new Set();

function isPortFreeOnHost(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

async function allocatePort() {
  for (let port = START_PORT; port <= END_PORT; port++) {
    if (!allocatedPorts.has(port)) {
      const free = await isPortFreeOnHost(port);
      if (free) {
        allocatedPorts.add(port);
        return port;
      }
    }
  }
  throw new Error("No free ports available in allocation range (" + START_PORT + "-" + END_PORT + ")");
}

function releasePort(port) {
  if (port) {
    allocatedPorts.delete(Number(port));
  }
}

module.exports = {
  allocatePort,
  releasePort,
  isPortFreeOnHost,
};
