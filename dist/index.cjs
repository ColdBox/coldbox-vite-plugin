"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var index_exports = {};
__export(index_exports, {
  appRefreshPaths: () => appRefreshPaths,
  default: () => coldbox,
  refreshPaths: () => refreshPaths
});
module.exports = __toCommonJS(index_exports);
var import_meta_url = typeof document === "undefined" ? new (require("url".replace("", ""))).URL("file:" + __filename).href : document.currentScript && document.currentScript.src || new URL("main.js", document.baseURI).href;
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_picocolors = __toESM(require("picocolors"), 1);
var import_url = require("url");
var import_vite = require("vite");
var import_vite_plugin_full_reload = __toESM(require("vite-plugin-full-reload"), 1);
const __filename2 = (0, import_url.fileURLToPath)(import_meta_url);
const __dirname = import_path.default.dirname(__filename2);
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
      const env = (0, import_vite.loadEnv)(mode, userConfig.envDir || process.cwd(), "");
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
      const hotFile = import_path.default.join(pluginConfig.publicDirectory, "hot");
      const pluginVersion = JSON.parse(import_fs.default.readFileSync(import_path.default.resolve(__dirname, "../package.json")).toString()).version;
      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        const isAddressInfo = (x) => typeof x === "object";
        if (isAddressInfo(address)) {
          viteDevServerUrl = resolveDevServerUrl(
            address,
            server.config
          );
          import_fs.default.mkdirSync(import_path.default.dirname(hotFile), { recursive: true });
          import_fs.default.writeFileSync(hotFile, viteDevServerUrl);
          setTimeout(() => {
            server.config.logger.info(
              import_picocolors.default.red(`
  ColdBox ${coldboxVersion()} `)
            );
            server.config.logger.info(
              `
  > Plugin Version: ` + import_picocolors.default.cyan(pluginVersion)
            );
          }, 300);
        }
      });
      if (exitHandlersBound) {
        return;
      }
      const clean = (code) => {
        if (import_fs.default.existsSync(hotFile)) {
          import_fs.default.rmSync(hotFile);
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
            "\n" + import_picocolors.default.bgYellow(
              import_picocolors.default.black(
                "The Vite server should not be accessed directly. Please access your ColdBox application directly."
              )
            )
          );
          res.statusCode = 404;
          res.end(
            import_fs.default.readFileSync(
              import_path.default.join(
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
      const relativeChunkPath = (0, import_vite.normalizePath)(
        import_path.default.relative(resolvedConfig.root, chunk.facadeModuleId)
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
      const manifestPath = import_path.default.resolve(
        resolvedConfig.root,
        resolvedConfig.build.outDir,
        manifestConfig
      );
      if (!import_fs.default.existsSync(manifestPath)) {
        return;
      }
      const manifest = JSON.parse(
        import_fs.default.readFileSync(manifestPath).toString()
      );
      const newManifest = {
        ...manifest,
        ...cssManifest
      };
      import_fs.default.mkdirSync(import_path.default.dirname(manifestPath), { recursive: true });
      import_fs.default.writeFileSync(
        manifestPath,
        JSON.stringify(newManifest, null, 2)
      );
    }
  };
}
function coldboxVersion() {
  try {
    const boxJSON = JSON.parse(import_fs.default.readFileSync("box.json").toString());
    const coldBoxInstallPath = boxJSON.installPaths?.coldbox ?? {};
    const coldBoxBoxJSON = JSON.parse(import_fs.default.readFileSync(import_path.default.join(coldBoxInstallPath, "box.json")).toString());
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
  return import_path.default.join(config.publicDirectory, config.buildDirectory);
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
    const plugin = (0, import_vite_plugin_full_reload.default)(c.paths, c.config);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  appRefreshPaths,
  refreshPaths
});
