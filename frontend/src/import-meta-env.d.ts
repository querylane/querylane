declare global {
  interface RsbuildTypeOptions {
    strictImportMetaEnv: true;
  }

  interface ImportMetaEnv {
    readonly PUBLIC_API_BASE_URL?: string;
    readonly PUBLIC_GITHUB_REPO?: string;
    readonly PUBLIC_TEST_BROWSER_THEME?: string;
  }
}

export {};
