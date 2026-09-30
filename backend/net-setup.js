const dns = require("dns");

// Render (and most container hosts) have no outbound IPv6 route even though the OS still
// reports an IPv6 interface. nodemailer resolves smtp.gmail.com through `new dns.Resolver()`,
// combines the A and AAAA answers and then connects to ONE of them at random
// (nodemailer/dist/cjs/shared/index.js:110), so a send intermittently dies with
// "connect ENETUNREACH 2607:f8b0:... - Local (:::0)" - a Google IPv6 address - and every
// retry can pick another unreachable address. Faking an empty AAAA answer keeps the
// candidate list IPv4-only, which removes that whole failure mode.
// Set ALLOW_IPV6=true to opt back into normal AAAA resolution.

let applied = false;

function ipv6DisabledError(hostname) {
  const error = new Error(`getaddrinfo ENODATA ${hostname} (IPv6 lookups disabled: host has no IPv6 route)`);
  error.code = "ENODATA";
  error.syscall = "getaddrinfo";
  error.hostname = hostname;
  return error;
}

// Handles both resolve6(hostname, cb) and resolve6(hostname, ttl, cb)
function blockIPv6(original) {
  return function resolve6Ipv4Only(hostname, options, callback) {
    if (typeof options === "function") {
      return setImmediate(() => options(ipv6DisabledError(hostname), []));
    }
    if (typeof callback === "function") {
      return setImmediate(() => callback(ipv6DisabledError(hostname), []));
    }
    return original ? original.call(this, hostname, options, callback) : undefined;
  };
}

const isIpv4 = (entry) => entry && (entry.family === 4 || entry.family === "IPv4");

// Hosts that refuse direct A queries (some VPNs, captive resolvers) push nodemailer onto its
// dns.lookup fallback, which returns A and AAAA answers together and then connects to a random
// one of them. Keep IPv4 when it is available, and leave the answer untouched on IPv6-only hosts.
function preferIpv4Addresses(addresses) {
  if (!Array.isArray(addresses)) return addresses;
  const ipv4 = addresses.filter(isIpv4);
  return ipv4.length ? ipv4 : addresses;
}

function blockIpv6InLookup(original) {
  return function lookup(hostname, options, callback) {
    const done = typeof options === "function" ? options : callback;
    const opts = typeof options === "function" ? {} : options;

    if (typeof opts !== "object" || opts === null || opts.family !== undefined) {
      return original.call(this, hostname, options, callback);
    }

    return original.call(this, hostname, { ...opts, all: true }, (err, addresses) => {
      if (err) return done(err);
      const preferred = preferIpv4Addresses(addresses);
      return opts.all ? done(null, preferred) : done(null, preferred[0]);
    });
  };
}

function preferIpv4() {
  if (applied) return;
  applied = true;

  if (typeof dns.setDefaultResultOrder === "function") {
    dns.setDefaultResultOrder("ipv4first");
  }

  if (String(process.env.ALLOW_IPV6).toLowerCase() === "true") {
    console.log("🌐 DNS: IPv4 preferred (ALLOW_IPV6=true, AAAA resolution left enabled)");
    return;
  }

  if (typeof dns.resolve6 === "function") {
    dns.resolve6 = blockIPv6(dns.resolve6);
  }

  // nodemailer (and anything else using a dedicated resolver) goes through this prototype
  if (dns.Resolver && dns.Resolver.prototype && typeof dns.Resolver.prototype.resolve6 === "function") {
    dns.Resolver.prototype.resolve6 = blockIPv6(dns.Resolver.prototype.resolve6);
  }

  dns.lookup = blockIpv6InLookup(dns.lookup);

  console.log("🌐 DNS: IPv4 preferred (AAAA lookups disabled to avoid ENETUNREACH)");
}

module.exports = { preferIpv4 };
