import { Plugin, UserConfig, ConfigEnv } from "vite";
import { Config as FullReloadConfig } from "vite-plugin-full-reload";
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
/** Refresh paths for the flat ColdBox layout (web root = project root). */
export declare const refreshPaths: string[];
/** Refresh paths for the BoxLang / tiered ColdBox layout (app/ sub-directory). */
export declare const appRefreshPaths: string[];
/**
 * ColdBox plugin for Vite.
 *
 * @param config - A config object or relative path(s) of the scripts to be compiled.
 */
export default function coldbox(config: string | string[] | PluginConfig): [ColdBoxPlugin, ...Plugin[]];
export {};
