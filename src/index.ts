import fs from "fs";
import path from "path";
import colors from "picocolors";
import { fileURLToPath } from 'url';
import { AddressInfo } from "net";
import {
    Plugin,
    loadEnv,
    UserConfig,
    ConfigEnv,
    ResolvedConfig,
    SSROptions,
    normalizePath,
    PluginOption,
} from "vite";

type ManifestEntry = {
    file: string;
    src?: string;
    isEntry?: boolean;
    imports?: string[];
    css?: string[];
};
type Manifest = Record<string, ManifestEntry>;

/** Vite augments Rollup's OutputChunk with importedCss metadata. */
interface ViteChunk {
    isEntry: boolean;
    facadeModuleId: string | null;
    fileName: string;
    viteMetadata?: {
        importedCss: Set<string>;
    };
}

import fullReload, {
    Config as FullReloadConfig,
} from "vite-plugin-full-reload";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PluginConfig {
    /**
     * The path or paths of the entry points to compile.
     */
    input: string | string[];

    /**
     * ColdBox's public directory.
     *
     * @default 'includes'
     */
    publicDirectory?: string;

    /**
     * The public subdirectory where compiled assets should be written.
     *
     * @default 'build'
     */
    buildDirectory?: string;

    /**
     * The path of the SSR entry point.
     */
    ssr?: string | string[];

    /**
     * The directory where the SSR bundle should be written.
     *
     * @default 'includes/build/ssr'
     */
    ssrOutputDirectory?: string;

    /**
     * Configuration for performing full page refresh on blade (or other) file changes.
     *
     * {@link https://github.com/ElMassimo/vite-plugin-full-reload}
     * @default false
     */
    refresh?: boolean | string | string[] | RefreshConfig | RefreshConfig[];
}

interface RefreshConfig {
    paths: string[];
    config?: FullReloadConfig;
}

interface ColdBoxPlugin extends Plugin {
    config: (config: UserConfig, env: ConfigEnv) => UserConfig;
}

type DevServerUrl = `${"http" | "https"}://${string}:${number}`;

let exitHandlersBound = false;

/** Refresh paths for the flat ColdBox layout (web root = project root). */
export const refreshPaths = ["layouts/**", "views/**", "config/Router.cfc"];

/** Refresh paths for the BoxLang / tiered ColdBox layout (app/ sub-directory). */
export const appRefreshPaths = [
    "app/layouts/**",
    "app/views/**",
    "app/config/Router.bx",
];

/**
 * ColdBox plugin for Vite.
 *
 * @param config - A config object or relative path(s) of the scripts to be compiled.
 */
export default function coldbox(
    config: string | string[] | PluginConfig
): [ColdBoxPlugin, ...Plugin[]] {
    const pluginConfig = resolvePluginConfig(config);

    return [
        resolveColdBoxPlugin(pluginConfig),
        ...(resolveFullReloadConfig(pluginConfig) as Plugin[]),
    ];
}

/**
 * Resolve the ColdBox Plugin configuration.
 */
function resolveColdBoxPlugin(
    pluginConfig: Required<PluginConfig>
): ColdBoxPlugin {
    let viteDevServerUrl: DevServerUrl;
    let resolvedConfig: ResolvedConfig;
    const cssManifest: Manifest = {};

    const defaultAliases: Record<string, string> = {
        "@": "/resources/assets/js",
    };

    return {
        name: "coldbox",
        enforce: "post",
        config: (userConfig, { command, mode }) => {
            const ssr = !!userConfig.build?.ssr;
            const env = loadEnv(mode, userConfig.envDir || process.cwd(), "");
            const assetUrl = env.ASSET_URL ?? "";

            return {
                base:
                    command === "build"
                        ? resolveBase(pluginConfig, assetUrl)
                        : "",
                publicDir: false,
                build: {
                    manifest: !ssr,
                    outDir:
                        userConfig.build?.outDir ??
                        resolveOutDir(pluginConfig, ssr),
                    rollupOptions: {
                        input:
                            userConfig.build?.rollupOptions?.input ??
                            resolveInput(pluginConfig, ssr),
                    },
                },
                server: {
                    origin: "__coldbox_vite_placeholder__",
                },
                resolve: {
                    alias: Array.isArray(userConfig.resolve?.alias)
                        ? [
                              ...(userConfig.resolve?.alias ?? []),
                              ...Object.keys(defaultAliases).map((alias) => ({
                                  find: alias,
                                  replacement: defaultAliases[alias],
                              })),
                          ]
                        : {
                              ...defaultAliases,
                              ...userConfig.resolve?.alias,
                          },
                },
                ssr: {
                    noExternal: noExternalInertiaHelpers(userConfig),
                },
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

                const isAddressInfo = (
                    x: string | AddressInfo | null | undefined
                ): x is AddressInfo => typeof x === "object";
                if (isAddressInfo(address)) {
                    viteDevServerUrl = resolveDevServerUrl(
                        address,
                        server.config
                    );

                    fs.mkdirSync(path.dirname(hotFile), { recursive: true });
                    fs.writeFileSync(hotFile, viteDevServerUrl);

                    setTimeout(() => {
                        server.config.logger.info(
                            colors.red(`\n  ColdBox ${coldboxVersion()} `)
                        );
                        server.config.logger.info(
                            `\n  > Plugin Version: ` + colors.cyan(pluginVersion)
                        );
                    }, 300);
                }
            });

            if (exitHandlersBound) {
                return;
            }

            const clean = (code: number | null) => {
                if (fs.existsSync(hotFile)) {
                    fs.rmSync(hotFile);
                }
                process.exit(code ?? 0);
            };

            process.on('exit', (code) => clean(code))
            // callback value is signal string, exit with 0
            process.on('SIGINT', () => clean(0))
            process.on('SIGTERM', () => clean(0))
            process.on("SIGHUP", process.exit);

            exitHandlersBound = true;

            return () =>
                server.middlewares.use((req, res, next) => {
                    if (req.url === "/index.html") {
                        server.config.logger.warn(
                            "\n" +
                                colors.bgYellow(
                                    colors.black(
                                        "The Vite server should not be accessed directly. Please access your ColdBox application directly."
                                    )
                                )
                        );

                        res.statusCode = 404;

                        res.end(
                            fs
                                .readFileSync(
                                    path.join(
                                        __dirname,
                                        "dev-server-index.html"
                                    )
                                )
                                .toString()
                        );
                    }

                    next();
                });
        },

        // The following two hooks are a workaround to help solve a "flash of unstyled content".
        // They add any CSS entry points into the manifest because Vite does not currently do this.
        renderChunk(_, chunk: ViteChunk) {
            const cssLangs = `\\.(css|less|sass|scss|styl|stylus|pcss|postcss)($|\\?)`;
            const cssLangRE = new RegExp(cssLangs);

            if (
                !chunk.isEntry ||
                chunk.facadeModuleId === null ||
                !cssLangRE.test(chunk.facadeModuleId)
            ) {
                return null;
            }

            const relativeChunkPath = normalizePath(
                path.relative(resolvedConfig.root, chunk.facadeModuleId)
            );

            cssManifest[relativeChunkPath] = {
                /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
                /* @ts-ignore */
                file:
                    Array.from(chunk.viteMetadata?.importedCss ?? [])[0] ??
                    chunk.fileName,
                src: relativeChunkPath,
                isEntry: true,
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
                // The manifest does not exist yet when first writing the legacy asset bundle.
                return;
            }

            const manifest = JSON.parse(
                fs.readFileSync(manifestPath).toString()
            );
            const newManifest = {
                ...manifest,
                ...cssManifest,
            };
            fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
            fs.writeFileSync(
                manifestPath,
                JSON.stringify(newManifest, null, 2)
            );
        },
    };
}

/**
 * The version of ColdBox being run.
 */
function coldboxVersion(): string {
    try {
        const boxJSON = JSON.parse(fs.readFileSync("box.json").toString());
        const coldBoxInstallPath = boxJSON.installPaths?.coldbox ?? {};
        const coldBoxBoxJSON = JSON.parse(fs.readFileSync(path.join(coldBoxInstallPath, "box.json")).toString());

        return coldBoxBoxJSON.version ?? "";
    } catch {
        return "";
    }
}

/**
 * Convert the users configuration into a standard structure with defaults.
 */
function resolvePluginConfig(
    config: string | string[] | PluginConfig
): Required<PluginConfig> {
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
        config.publicDirectory = config.publicDirectory
            .trim()
            .replace(/^\/+/, "");

        if (config.publicDirectory === "") {
            throw new Error(
                "coldbox-vite-plugin: publicDirectory must be a subdirectory. E.g. 'includes'."
            );
        }
    }

    if (typeof config.buildDirectory === "string") {
        config.buildDirectory = config.buildDirectory
            .trim()
            .replace(/^\/+/, "")
            .replace(/\/+$/, "");

        if (config.buildDirectory === "") {
            throw new Error(
                "coldbox-vite-plugin: buildDirectory must be a subdirectory. E.g. 'build'."
            );
        }
    }

    if (typeof config.ssrOutputDirectory === "string") {
        config.ssrOutputDirectory = config.ssrOutputDirectory
            .trim()
            .replace(/^\/+/, "")
            .replace(/\/+$/, "");
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
        refresh: config.refresh ?? false,
    };
}

/**
 * Resolve the Vite base option from the configuration.
 */
function resolveBase(config: Required<PluginConfig>, assetUrl: string): string {
    return (
        assetUrl +
        (!assetUrl.endsWith("/") ? "/" : "") +
        config.buildDirectory +
        "/"
    );
}

/**
 * Resolve the Vite input path from the configuration.
 */
function resolveInput(
    config: Required<PluginConfig>,
    ssr: boolean
): string | string[] | undefined {
    if (ssr) {
        return config.ssr;
    }

    return config.input;
}

/**
 * Resolve the Vite outDir path from the configuration.
 */
function resolveOutDir(
    config: Required<PluginConfig>,
    ssr: boolean
): string | undefined {
    if (ssr) {
        return config.ssrOutputDirectory;
    }

    return path.join(config.publicDirectory, config.buildDirectory);
}

/**
 * Resolve the Vite manifest path from the resolved config.
 *
 * Vite 5+ writes the manifest to `.vite/manifest.json` when `manifest: true`,
 * but Vite resolves the boolean to the actual filename before storing it in
 * `resolvedConfig`. Reading from `resolvedConfig` gives us the correct path
 * across all supported Vite versions.
 */
function resolveManifestConfig(config: ResolvedConfig): string | false {
    const manifestConfig = config.build.ssr
        ? config.build.ssrManifest
        : config.build.manifest;

    if (manifestConfig === false) {
        return false;
    }

    // Vite resolves `true` to the actual filename in resolvedConfig.
    // Fall back to sensible defaults only when it is still a boolean (older Vite).
    if (manifestConfig === true) {
        return config.build.ssr ? ".vite/ssr-manifest.json" : ".vite/manifest.json";
    }

    return manifestConfig;
}

function resolveFullReloadConfig({
    refresh: config,
}: Required<PluginConfig>): PluginOption[] {
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
        config = [{ paths: config }] as RefreshConfig[];
    }

    return (config as RefreshConfig[]).flatMap((c) => {
        const plugin = fullReload(c.paths, c.config);

        /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
        /** @ts-ignore */
        plugin.__coldbox_plugin_config = c;

        return plugin;
    });
}

/**
 * Resolve the dev server URL from the server address and configuration.
 */
function resolveDevServerUrl(
    address: AddressInfo,
    config: ResolvedConfig
): DevServerUrl {
    const configHmrProtocol =
        typeof config.server.hmr === "object"
            ? config.server.hmr.protocol
            : null;
    const clientProtocol = configHmrProtocol
        ? configHmrProtocol === "wss"
            ? "https"
            : "http"
        : null;
    const serverProtocol = config.server.https ? "https" : "http";
    const protocol = clientProtocol ?? serverProtocol;

    const configHmrHost =
        typeof config.server.hmr === "object" ? config.server.hmr.host : null;
    const configHost =
        typeof config.server.host === "string" ? config.server.host : null;
    const serverAddress =
        address.family === "IPv6" ? `[${address.address}]` : address.address;
    const host = configHmrHost ?? configHost ?? serverAddress;

    return `${protocol}://${host}:${address.port}`;
}

/**
 * Add the Interia helpers to the list of SSR dependencies that aren't externalized.
 *
 * @see https://vitejs.dev/guide/ssr.html#ssr-externals
 */
function noExternalInertiaHelpers(
    config: UserConfig
): true | Array<string | RegExp> {
    /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
    /* @ts-ignore */
    const userNoExternal = (config.ssr as SSROptions | undefined)?.noExternal;
    const pluginNoExternal = ["coldbox-vite-plugin"];

    if (userNoExternal === true) {
        return true;
    }

    if (typeof userNoExternal === "undefined") {
        return pluginNoExternal;
    }

    return [
        ...(Array.isArray(userNoExternal) ? userNoExternal : [userNoExternal]),
        ...pluginNoExternal,
    ];
}
