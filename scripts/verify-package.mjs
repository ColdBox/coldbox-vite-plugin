import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = mkdtempSync(join(tmpdir(), "coldbox-vite-package-"));
const source = join(temporary, "source");
const consumer = join(temporary, "consumer");
const run = (command, args, cwd) => execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
});

try {
    // Start without generated files; share only the installed build tools.
    cpSync(root, source, {
        recursive: true,
        filter: (path) => ![".git", "node_modules", "dist", "inertia-helpers"].includes(relative(root, path).split("/")[0]),
    });
    symlinkSync(join(root, "node_modules"), join(source, "node_modules"), "dir");
    const output = run("npm", ["pack", "--json", "--silent", "--pack-destination", temporary], source);
    const [archive] = JSON.parse(output);
    const pkg = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
    const files = new Set(archive.files.map(({ path }) => path));
    for (const entry of Object.values(pkg.exports)) {
        for (const path of Object.values(entry)) {
            assert(files.has(path.replace(/^\.\//, "")), `Missing exported file: ${path}`);
        }
    }
    assert(files.has("dist/dev-server-index.html"), "Missing development-server template");

    mkdirSync(consumer);
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "package-smoke", private: true }));
    // Lifecycle scripts are disabled here: consumers must receive ready-to-use files.
    run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(temporary, archive.filename)], consumer);
    run(process.execPath, ["--input-type=module", "-e", `
        import assert from "node:assert/strict";
        import { createRequire } from "node:module";
        import coldbox from "coldbox-vite-plugin";
        import { resolvePageComponent } from "coldbox-vite-plugin/inertia-helpers";
        assert.equal(typeof coldbox, "function");
        assert.equal(coldbox({ input: ["app.js"] })[0].name, "coldbox");
        assert.equal(typeof resolvePageComponent, "function");
        assert.equal(typeof createRequire(import.meta.url)("coldbox-vite-plugin").default, "function");
    `], consumer);
    console.log(`PASS clean-source npm package: ${archive.files.length} files; ESM, CommonJS, and Inertia exports load`);
} catch (error) {
    if (error.stdout) process.stderr.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
} finally {
    rmSync(temporary, { recursive: true, force: true });
}
