import { afterEach, describe, expect, it, vi } from "vitest";
import coldbox from "../src";
import { resolvePageComponent } from "../src/inertia-helpers";

describe("coldbox-vite-plugin", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("handles missing configuration", () => {
        /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
        /* @ts-ignore */
        expect(() => coldbox()).toThrowError(
            "coldbox-vite-plugin: missing configuration."
        );

        /* eslint-disable-next-line @typescript-eslint/ban-ts-comment */
        /* @ts-ignore */
        expect(() => coldbox({})).toThrowError(
            'coldbox-vite-plugin: missing configuration for "input".'
        );
    });

    it("accepts a single input", () => {
        const plugin = coldbox("resources/assets/js/app.ts")[0];

        const config = plugin.config(
            {},
            { command: "build", mode: "production" }
        );
        expect(config.build.rollupOptions.input).toBe(
            "resources/assets/js/app.ts"
        );

        const ssrConfig = plugin.config(
            { build: { ssr: true } },
            { command: "build", mode: "production" }
        );
        expect(ssrConfig.build.rollupOptions.input).toBe(
            "resources/assets/js/app.ts"
        );
    });

    it("accepts an array of inputs", () => {
        const plugin = coldbox([
            "resources/assets/js/app.ts",
            "resources/assets/js/other.js",
        ])[0];

        const config = plugin.config(
            {},
            { command: "build", mode: "production" }
        );
        expect(config.build.rollupOptions.input).toEqual([
            "resources/assets/js/app.ts",
            "resources/assets/js/other.js",
        ]);

        const ssrConfig = plugin.config(
            { build: { ssr: true } },
            { command: "build", mode: "production" }
        );
        expect(ssrConfig.build.rollupOptions.input).toEqual([
            "resources/assets/js/app.ts",
            "resources/assets/js/other.js",
        ]);
    });

    it("accepts a full configuration", () => {
        const plugin = coldbox({
            input: "resources/assets/js/app.ts",
            publicDirectory: "other-public",
            buildDirectory: "other-build",
            ssr: "resources/assets/js/ssr.ts",
            ssrOutputDirectory: "other-ssr-output",
        })[0];

        const config = plugin.config(
            {},
            { command: "build", mode: "production" }
        );
        expect(config.base).toBe("/other-build/");
        expect(config.build.manifest).toBe(true);
        expect(config.build.outDir).toBe("other-public/other-build");
        expect(config.build.rollupOptions.input).toBe(
            "resources/assets/js/app.ts"
        );

        const ssrConfig = plugin.config(
            { build: { ssr: true } },
            { command: "build", mode: "production" }
        );
        expect(ssrConfig.base).toBe("/other-build/");
        expect(ssrConfig.build.manifest).toBe(false);
        expect(ssrConfig.build.outDir).toBe("other-ssr-output");
        expect(ssrConfig.build.rollupOptions.input).toBe(
            "resources/assets/js/ssr.ts"
        );
    });

    it("accepts a partial configuration", () => {
        const plugin = coldbox({
            input: "resources/assets/js/app.js",
            ssr: "resources/assets/js/ssr.js",
        })[0];

        const config = plugin.config(
            {},
            { command: "build", mode: "production" }
        );
        expect(config.base).toBe("/build/");
        expect(config.build.manifest).toBe(true);
        expect(config.build.outDir).toBe("includes/build");
        expect(config.build.rollupOptions.input).toBe(
            "resources/assets/js/app.js"
        );

        const ssrConfig = plugin.config(
            { build: { ssr: true } },
            { command: "build", mode: "production" }
        );
        expect(ssrConfig.base).toBe("/build/");
        expect(ssrConfig.build.manifest).toBe(false);
        expect(ssrConfig.build.outDir).toBe("includes/build/ssr");
        expect(ssrConfig.build.rollupOptions.input).toBe(
            "resources/assets/js/ssr.js"
        );
    });

    it("uses the default entry point when ssr entry point is not provided", () => {
        // This is support users who may want a dedicated Vite config for SSR.
        const plugin = coldbox("resources/assets/js/ssr.js")[0];

        const ssrConfig = plugin.config(
            { build: { ssr: true } },
            { command: "build", mode: "production" }
        );
        expect(ssrConfig.build.rollupOptions.input).toBe(
            "resources/assets/js/ssr.js"
        );
    });

    it("prefixes the base with ASSET_URL in production mode", () => {
        process.env.ASSET_URL = "http://example.com";
        const plugin = coldbox("resources/assets/js/app.js")[0];

        const devConfig = plugin.config(
            {},
            { command: "serve", mode: "development" }
        );
        expect(devConfig.base).toBe("");

        const prodConfig = plugin.config(
            {},
            { command: "build", mode: "production" }
        );
        expect(prodConfig.base).toBe("http://example.com/build/");

        delete process.env.ASSET_URL;
    });

    it("prevents setting an empty publicDirectory", () => {
        expect(
            () =>
                coldbox({
                    input: "resources/assets/js/app.js",
                    publicDirectory: "",
                })[0]
        ).toThrowError("publicDirectory must be a subdirectory");
    });

    it("prevents setting an empty buildDirectory", () => {
        expect(
            () =>
                coldbox({
                    input: "resources/assets/js/app.js",
                    buildDirectory: "",
                })[0]
        ).toThrowError("buildDirectory must be a subdirectory");
    });

    it("handles surrounding slashes on directories", () => {
        const plugin = coldbox({
            input: "resources/assets/js/app.js",
            publicDirectory: "/includes/test/",
            buildDirectory: "/build/test/",
            ssrOutputDirectory: "/ssr-output/test/",
        })[0];

        const config = plugin.config(
            {},
            { command: "build", mode: "production" }
        );
        expect(config.base).toBe("/build/test/");
        expect(config.build.outDir).toBe("includes/test/build/test");

        const ssrConfig = plugin.config(
            { build: { ssr: true } },
            { command: "build", mode: "production" }
        );
        expect(ssrConfig.build.outDir).toBe("ssr-output/test");
    });

    it("provides an @ alias by default", () => {
        const plugin = coldbox("resources/assets/js/app.js")[0];

        const config = plugin.config(
            {},
            { command: "build", mode: "development" }
        );

        expect(config.resolve.alias["@"]).toBe("/resources/assets/js");
    });

    it("respects a users existing @ alias", () => {
        const plugin = coldbox("resources/assets/js/app.js")[0];

        const config = plugin.config(
            {
                resolve: {
                    alias: {
                        "@": "/somewhere/else",
                    },
                },
            },
            { command: "build", mode: "development" }
        );

        expect(config.resolve.alias["@"]).toBe("/somewhere/else");
    });

    it("appends an Alias object when using an alias array", () => {
        const plugin = coldbox("resources/assets/js/app.js")[0];

        const config = plugin.config(
            {
                resolve: {
                    alias: [{ find: "@", replacement: "/something/else" }],
                },
            },
            { command: "build", mode: "development" }
        );

        expect(config.resolve.alias).toEqual([
            { find: "@", replacement: "/something/else" },
            { find: "@", replacement: "/resources/assets/js" },
        ]);
    });

    it("prevents the Inertia helpers from being externalized", () => {
        /* eslint-disable @typescript-eslint/ban-ts-comment */
        const plugin = coldbox("resources/assets/js/app.js")[0];

        const noSsrConfig = plugin.config(
            { build: { ssr: true } },
            { command: "build", mode: "production" }
        );
        /* @ts-ignore */
        expect(noSsrConfig.ssr.noExternal).toEqual(["coldbox-vite-plugin"]);

        /* @ts-ignore */
        const nothingExternalConfig = plugin.config(
            { ssr: { noExternal: true }, build: { ssr: true } },
            { command: "build", mode: "production" }
        );
        /* @ts-ignore */
        expect(nothingExternalConfig.ssr.noExternal).toBe(true);

        /* @ts-ignore */
        const arrayNoExternalConfig = plugin.config(
            { ssr: { noExternal: ["foo"] }, build: { ssr: true } },
            { command: "build", mode: "production" }
        );
        /* @ts-ignore */
        expect(arrayNoExternalConfig.ssr.noExternal).toEqual([
            "foo",
            "coldbox-vite-plugin",
        ]);

        /* @ts-ignore */
        const stringNoExternalConfig = plugin.config(
            { ssr: { noExternal: "foo" }, build: { ssr: true } },
            { command: "build", mode: "production" }
        );
        /* @ts-ignore */
        expect(stringNoExternalConfig.ssr.noExternal).toEqual([
            "foo",
            "coldbox-vite-plugin",
        ]);
    });

    it("does not configure full reload when configuration it not an object", () => {
        const plugins = coldbox("resources/assets/js/app.js");

        expect(plugins.length).toBe(1);
    });

    it("does not configure full reload when refresh is not present", () => {
        const plugins = coldbox({
            input: "resources/assets/js/app.js",
        });

        expect(plugins.length).toBe(1);
    });

    it("does not configure full reload when refresh is set to undefined", () => {
        const plugins = coldbox({
            input: "resources/assets/js/app.js",
            refresh: undefined,
        });
        expect(plugins.length).toBe(1);
    });

    it("does not configure full reload when refresh is false", () => {
        const plugins = coldbox({
            input: "resources/assets/js/app.js",
            refresh: false,
        });

        expect(plugins.length).toBe(1);
    });

    it("configures full reload with routes and views when refresh is true", () => {
        const plugins = coldbox({
            input: "resources/assets/js/app.js",
            refresh: true,
        });

        expect(plugins.length).toBe(2);
        /** @ts-ignore */
        expect(plugins[1].__coldbox_plugin_config).toEqual({
            paths: ["layouts/**", "views/**", "config/Router.cfc"],
        });
    });

    it("configures full reload when refresh is a single path", () => {
        const plugins = coldbox({
            input: "resources/assets/js/app.js",
            refresh: "path/to/watch/**",
        });

        expect(plugins.length).toBe(2);
        /** @ts-ignore */
        expect(plugins[1].__coldbox_plugin_config).toEqual({
            paths: ["path/to/watch/**"],
        });
    });

    it("configures full reload when refresh is an array of paths", () => {
        const plugins = coldbox({
            input: "resources/assets/js/app.js",
            refresh: ["path/to/watch/**", "another/to/watch/**"],
        });

        expect(plugins.length).toBe(2);
        /** @ts-ignore */
        expect(plugins[1].__coldbox_plugin_config).toEqual({
            paths: ["path/to/watch/**", "another/to/watch/**"],
        });
    });

    it("configures full reload when refresh is a complete configuration to proxy", () => {
        const plugins = coldbox({
            input: "resources/assets/js/app.js",
            refresh: {
                paths: ["path/to/watch/**", "another/to/watch/**"],
                config: { delay: 987 },
            },
        });

        expect(plugins.length).toBe(2);
        /** @ts-ignore */
        expect(plugins[1].__coldbox_plugin_config).toEqual({
            paths: ["path/to/watch/**", "another/to/watch/**"],
            config: { delay: 987 },
        });
    });

    it("configures full reload when refresh is an array of complete configurations to proxy", () => {
        const plugins = coldbox({
            input: "resources/assets/js/app.js",
            refresh: [
                {
                    paths: ["path/to/watch/**"],
                    config: { delay: 987 },
                },
                {
                    paths: ["another/to/watch/**"],
                    config: { delay: 123 },
                },
            ],
        });

        expect(plugins.length).toBe(3);
        /** @ts-ignore */
        expect(plugins[1].__coldbox_plugin_config).toEqual({
            paths: ["path/to/watch/**"],
            config: { delay: 987 },
        });
        /** @ts-ignore */
        expect(plugins[2].__coldbox_plugin_config).toEqual({
            paths: ["another/to/watch/**"],
            config: { delay: 123 },
        });
    });
});

describe("inertia-helpers", () => {
    const path = "./__data__/dummy.ts";
    it("pass glob value to resolvePageComponent", async () => {
        const file = await resolvePageComponent<{ default: string }>(
            path,
            import.meta.glob("./__data__/*.ts")
        );
        expect(file.default).toBe("Dummy File");
    });

    it("pass globEager value to resolvePageComponent", async () => {
        const file = await resolvePageComponent<{ default: string }>(
            path,
            import.meta.glob("./__data__/*.ts", { eager: true })
        );
        expect(file.default).toBe("Dummy File");
    });
});
