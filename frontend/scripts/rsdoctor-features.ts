function resolveRsdoctorFeatures(mode: string | undefined) {
  return {
    bundle: true,
    // Loader interception rewrites module identifiers and therefore compact IDs.
    // Bundle evidence must observe the ordinary compiler, not a proxy-loader build.
    loader: mode !== "bundle",
    plugins: true,
    resolver: true,
    treeShaking: true,
  };
}

export { resolveRsdoctorFeatures };
