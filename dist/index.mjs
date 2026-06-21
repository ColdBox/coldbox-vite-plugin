import fs from "fs";
import path from "path";
import colors from "picocolors";
import { fileURLToPath } from "url";
import {
  loadEnv,
  normalizePath
} from "vite";
import fullReload from "vite-plugin-full-reload";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let exitHandlersBound = false;
const refreshPaths = ["layouts/**", "views/**", "config/Router.cfc"];
const appRefreshPaths = [
  "app/layouts/**",
  "app/views/**",
  "app/config/Router.bx"
];
function coldbox(config) {
  const pluginConfig = resolvePluginConfig(config);
  return [
    resolveColdBoxPlugin(pluginConfig),
    ...resolveFullReloadConfig(pluginConfig)
  ];
}
function resolveColdBoxPlugin(pluginConfig) {
  let viteDevServerUrl;
  let resolvedConfig;
  const cssManifest = {};
  const defaultAliases = {
    "@": "/resources/assets/js"
  };
  return {
    name: "coldbox",
    enforce: "post",
    config: (userConfig, { command, mode }) => {
      const ssr = !!userConfig.build?.ssr;
      const env = loadEnv(mode, userConfig.envDir || process.cwd(), "");
      const assetUrl = env.ASSET_URL ?? "";
      return {
        base: command === "build" ? resolveBase(pluginConfig, assetUrl) : "",
        publicDir: false,
        build: {
          manifest: !ssr,
          outDir: userConfig.build?.outDir ?? resolveOutDir(pluginConfig, ssr),
          rollupOptions: {
            input: userConfig.build?.rollupOptions?.input ?? resolveInput(pluginConfig, ssr)
          }
        },
        server: {
          origin: "__coldbox_vite_placeholder__"
        },
        resolve: {
          alias: Array.isArray(userConfig.resolve?.alias) ? [
            ...userConfig.resolve?.alias ?? [],
            ...Object.keys(defaultAliases).map((alias) => ({
              find: alias,
              replacement: defaultAliases[alias]
            }))
          ] : {
            ...defaultAliases,
            ...userConfig.resolve?.alias
          }
        },
        ssr: {
          noExternal: noExternalInertiaHelpers(userConfig)
        }
      };
    },
    configResolved(config) {
      resolvedConfig = config;
    },
    transform(code) {
      if (resolvedConfig.command === "serve") {
        return code.replace(
          /__coldbox_vite_placeholder__/g,
          viteDevServerUrl
        );
      }
    },
    configureServer(server) {
      const hotFile = path.join(pluginConfig.publicDirectory, "hot");
      const pluginVersion = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json")).toString()).version;
      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        const isAddressInfo = (x) => typeof x === "object";
        if (isAddressInfo(address)) {
          viteDevServerUrl = resolveDevServerUrl(
            address,
            server.config
          );
          fs.mkdirSync(path.dirname(hotFile), { recursive: true });
          fs.writeFileSync(hotFile, viteDevServerUrl);
          setTimeout(() => {
            server.config.logger.info(
              colors.red(`
  ColdBox ${coldboxVersion()} `)
            );
            server.config.logger.info(
              `
  > Plugin Version: ` + colors.cyan(pluginVersion)
            );
          }, 300);
        }
      });
      if (exitHandlersBound) {
        return;
      }
      const clean = (code) => {
        if (fs.existsSync(hotFile)) {
          fs.rmSync(hotFile);
        }
        process.exit(code ?? 0);
      };
      process.on("exit", (code) => clean(code));
      process.on("SIGINT", () => clean(0));
      process.on("SIGTERM", () => clean(0));
      process.on("SIGHUP", process.exit);
      exitHandlersBound = true;
      return () => server.middlewares.use((req, res, next) => {
        if (req.url === "/index.html") {
          server.config.logger.warn(
            "\n" + colors.bgYellow(
              colors.black(
                "The Vite server should not be accessed directly. Please access your ColdBox application directly."
              )
            )
          );
          res.statusCode = 404;
          res.end(
            fs.readFileSync(
              path.join(
                __dirname,
                "dev-server-index.html"
              )
            ).toString()
          );
        }
        next();
      });
    },
    // The following two hooks are a workaround to help solve a "flash of unstyled content".
    // They add any CSS entry points into the manifest because Vite does not currently do this.
    renderChunk(_, chunk) {
      const cssLangs = `\\.(css|less|sass|scss|styl|stylus|pcss|postcss)($|\\?)`;
      const cssLangRE = new RegExp(cssLangs);
      if (!chunk.isEntry || chunk.facadeModuleId === null || !cssLangRE.test(chunk.facadeModuleId)) {
        return null;
      }
      const relativeChunkPath = normalizePath(
        path.relative(resolvedConfig.root, chunk.facadeModuleId)
      );
      cssManifest[relativeChunkPath] = {
        /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
        /* @ts-ignore */
        file: Array.from(chunk.viteMetadata?.importedCss ?? [])[0] ?? chunk.fileName,
        src: relativeChunkPath,
        isEntry: true
      };
      return null;
    },
    writeBundle() {
      const manifestConfig = resolveManifestConfig(resolvedConfig);
      if (manifestConfig === false) {
        return;
      }
      const manifestPath = path.resolve(
        resolvedConfig.root,
        resolvedConfig.build.outDir,
        manifestConfig
      );
      if (!fs.existsSync(manifestPath)) {
        return;
      }
      const manifest = JSON.parse(
        fs.readFileSync(manifestPath).toString()
      );
      const newManifest = {
        ...manifest,
        ...cssManifest
      };
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
      fs.writeFileSync(
        manifestPath,
        JSON.stringify(newManifest, null, 2)
      );
    }
  };
}
function coldboxVersion() {
  try {
    const boxJSON = JSON.parse(fs.readFileSync("box.json").toString());
    const coldBoxInstallPath = boxJSON.installPaths?.coldbox ?? {};
    const coldBoxBoxJSON = JSON.parse(fs.readFileSync(path.join(coldBoxInstallPath, "box.json")).toString());
    return coldBoxBoxJSON.version ?? "";
  } catch {
    return "";
  }
}
function resolvePluginConfig(config) {
  if (typeof config === "undefined") {
    throw new Error("coldbox-vite-plugin: missing configuration.");
  }
  if (typeof config === "string" || Array.isArray(config)) {
    config = { input: config, ssr: config };
  }
  if (typeof config.input === "undefined") {
    throw new Error(
      'coldbox-vite-plugin: missing configuration for "input".'
    );
  }
  if (typeof config.publicDirectory === "string") {
    config.publicDirectory = config.publicDirectory.trim().replace(/^\/+/, "");
    if (config.publicDirectory === "") {
      throw new Error(
        "coldbox-vite-plugin: publicDirectory must be a subdirectory. E.g. 'includes'."
      );
    }
  }
  if (typeof config.buildDirectory === "string") {
    config.buildDirectory = config.buildDirectory.trim().replace(/^\/+/, "").replace(/\/+$/, "");
    if (config.buildDirectory === "") {
      throw new Error(
        "coldbox-vite-plugin: buildDirectory must be a subdirectory. E.g. 'build'."
      );
    }
  }
  if (typeof config.ssrOutputDirectory === "string") {
    config.ssrOutputDirectory = config.ssrOutputDirectory.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  }
  if (config.refresh === true) {
    config.refresh = [{ paths: refreshPaths }];
  }
  return {
    input: config.input,
    publicDirectory: config.publicDirectory ?? "includes",
    buildDirectory: config.buildDirectory ?? "build",
    ssr: config.ssr ?? config.input,
    ssrOutputDirectory: config.ssrOutputDirectory ?? "includes/build/ssr",
    refresh: config.refresh ?? false
  };
}
function resolveBase(config, assetUrl) {
  return assetUrl + (!assetUrl.endsWith("/") ? "/" : "") + config.buildDirectory + "/";
}
function resolveInput(config, ssr) {
  if (ssr) {
    return config.ssr;
  }
  return config.input;
}
function resolveOutDir(config, ssr) {
  if (ssr) {
    return config.ssrOutputDirectory;
  }
  return path.join(config.publicDirectory, config.buildDirectory);
}
function resolveManifestConfig(config) {
  const manifestConfig = config.build.ssr ? config.build.ssrManifest : config.build.manifest;
  if (manifestConfig === false) {
    return false;
  }
  if (manifestConfig === true) {
    return config.build.ssr ? ".vite/ssr-manifest.json" : ".vite/manifest.json";
  }
  return manifestConfig;
}
function resolveFullReloadConfig({
  refresh: config
}) {
  if (typeof config === "boolean") {
    return [];
  }
  if (typeof config === "string") {
    config = [{ paths: [config] }];
  }
  if (!Array.isArray(config)) {
    config = [config];
  }
  if (config.some((c) => typeof c === "string")) {
    config = [{ paths: config }];
  }
  return config.flatMap((c) => {
    const plugin = fullReload(c.paths, c.config);
    plugin.__coldbox_plugin_config = c;
    return plugin;
  });
}
function resolveDevServerUrl(address, config) {
  const configHmrProtocol = typeof config.server.hmr === "object" ? config.server.hmr.protocol : null;
  const clientProtocol = configHmrProtocol ? configHmrProtocol === "wss" ? "https" : "http" : null;
  const serverProtocol = config.server.https ? "https" : "http";
  const protocol = clientProtocol ?? serverProtocol;
  const configHmrHost = typeof config.server.hmr === "object" ? config.server.hmr.host : null;
  const configHost = typeof config.server.host === "string" ? config.server.host : null;
  const serverAddress = address.family === "IPv6" ? `[${address.address}]` : address.address;
  const host = configHmrHost ?? configHost ?? serverAddress;
  return `${protocol}://${host}:${address.port}`;
}
function noExternalInertiaHelpers(config) {
  const userNoExternal = config.ssr?.noExternal;
  const pluginNoExternal = ["coldbox-vite-plugin"];
  if (userNoExternal === true) {
    return true;
  }
  if (typeof userNoExternal === "undefined") {
    return pluginNoExternal;
  }
  return [
    ...Array.isArray(userNoExternal) ? userNoExternal : [userNoExternal],
    ...pluginNoExternal
  ];
}
export {
  appRefreshPaths,
  coldbox as default,
  refreshPaths
};
