#!/usr/bin/env node
// The version lives in four files that must agree, or the installers ship with
// mismatched names. This sets all four, or checks them.
//
//   node scripts/version.mjs 0.2.0   # set
//   node scripts/version.mjs --check # verify they agree, exit 1 if not
//   node scripts/version.mjs --check v0.2.0  # ...and match a release tag

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const files = {
	packageJson: join(root, "package.json"),
	tauriConf: join(root, "src-tauri", "tauri.conf.json"),
	cargoToml: join(root, "src-tauri", "Cargo.toml"),
	cargoLock: join(root, "src-tauri", "Cargo.lock"),
};

const read = (path) => readFileSync(path, "utf8");

// Rewrite in place with regex rather than parse-and-serialise: JSON.stringify
// would reformat the whole file and toml has no stdlib writer.
const patch = (path, pattern, replacement) => {
	const before = read(path);
	const after = before.replace(pattern, replacement);
	if (after === before) throw new Error(`could not find the version field in ${path}`);
	writeFileSync(path, after);
};

const patterns = {
	packageJson: /("version":\s*")[^"]+(")/,
	tauriConf: /("version":\s*")[^"]+(")/,
	cargoToml: /^(version\s*=\s*")[^"]+(")/m,
	// Only the entry for this crate, not the hundreds of dependencies below it.
	cargoLock: /(name = "freeshow-utils"\nversion = ")[^"]+(")/,
};

const currentVersions = () => {
	const out = {};
	for (const [key, pattern] of Object.entries(patterns)) {
		const match = read(files[key]).match(pattern);
		if (!match) throw new Error(`could not find the version field in ${files[key]}`);
		// The full match ends with `<version>"`, so take the last quoted run.
		out[key] = match[0].match(/"([^"]*)"$/)[1];
	}
	return out;
};

const [arg, tagArg] = process.argv.slice(2);

if (!arg) {
	console.error("usage: node scripts/version.mjs <version> | --check [tag]");
	process.exit(2);
}

if (arg === "--check") {
	const found = currentVersions();
	const unique = [...new Set(Object.values(found))];
	let failed = false;

	if (unique.length !== 1) {
		console.error("version mismatch across files:");
		for (const [key, value] of Object.entries(found)) console.error(`  ${files[key]}: ${value}`);
		failed = true;
	} else {
		console.log(`version ${unique[0]} is consistent across all four files`);
	}

	if (tagArg) {
		const expected = tagArg.replace(/^v/, "");
		if (unique[0] !== expected) {
			console.error(`tag ${tagArg} expects version ${expected}, but the repo says ${unique[0]}`);
			console.error(`fix with: node scripts/version.mjs ${expected}`);
			failed = true;
		} else {
			console.log(`tag ${tagArg} matches the repo version`);
		}
	}

	process.exit(failed ? 1 : 0);
}

const version = arg.replace(/^v/, "");
// Tauri/NSIS/MSI all reject anything that isn't major.minor.patch.
if (!/^\d+\.\d+\.\d+$/.test(version)) {
	console.error(`"${arg}" is not a major.minor.patch version — Windows installers require exactly three numbers`);
	process.exit(2);
}

patch(files.packageJson, patterns.packageJson, `$1${version}$2`);
patch(files.tauriConf, patterns.tauriConf, `$1${version}$2`);
patch(files.cargoToml, patterns.cargoToml, `$1${version}$2`);
patch(files.cargoLock, patterns.cargoLock, `$1${version}$2`);

console.log(`set version ${version} in:`);
for (const path of Object.values(files)) console.log(`  ${path}`);
console.log(`\nnext: git commit -am "release v${version}" && git tag v${version} && git push --follow-tags`);
