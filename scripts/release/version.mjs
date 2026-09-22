export function releaseVersion(value = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ||
    new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z") !== value
  )
    throw new Error("Release timestamp must be UTC YYYY-MM-DDTHH:mm:ssZ");
  const tag = value.replaceAll("-", "").replaceAll(":", "");
  // Apple's build fields are numeric. Seconds since midnight retain ordering.
  const date = new Date(value);
  const day =
    Math.floor(
      (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
        Date.UTC(date.getUTCFullYear(), 0, 1)) /
        86400000,
    ) + 1;
  const seconds = date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds();
  return {
    timestamp: value,
    tag,
    version: `${date.getUTCFullYear()}.${day}.${seconds}`,
    shortVersion: `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}`,
    bundleVersion: `${day}.${date.getUTCHours()}.${date.getUTCMinutes()}`,
  };
}
