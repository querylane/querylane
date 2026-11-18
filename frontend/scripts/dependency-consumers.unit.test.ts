import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { expect, test } from "@rstest/core";
import merge from "./config-merge/index.cjs";

const root = resolve(import.meta.dirname, "..");

test("configuration merge fails closed for unsupported options", () => {
  const options = {
    arrayMerge: (target: unknown[]) => target,
    customMerge: true,
  };
  expect(() => merge({}, {}, options)).toThrow(
    "Unsupported configuration merge option"
  );
});

function runConsumer(source: string) {
  return spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", source],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 20_000,
    }
  );
}

test("every configuration merge consumer rejects returned-prototype poisoning", () => {
  const result = runConsumer(`
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { pathToFileURL } from 'node:url';
    import { resolve } from 'node:path';
    for (const entry of ['ultracite', 'shadcn', '@shadcn/registry']) {
      const owner = createRequire(resolve('node_modules', entry, 'package.json'));
      const { default: merge } = await import(pathToFileURL(owner.resolve('deepmerge')));
      for (const target of [Object.create(null), null,
        JSON.parse('{"__proto__": {"existing": true}}')]) {
        const input = JSON.parse('{"safe": 1, "__proto__": {"isAdmin": true}}');
        const output = merge(target, input);
        assert.equal(Object.getPrototypeOf(output), Object.prototype, entry);
        assert.equal(output.isAdmin, undefined, entry);
        assert.equal(Object.hasOwn(output, '__proto__'), false, entry);
        assert.equal(output.safe, 1, entry);
      }
      const nested = merge({}, JSON.parse('{"nested": {"constructor": {"prototype": {"isAdmin": true}}, "prototype": {"isAdmin": true}}}'));
      assert.equal(Object.hasOwn(nested.nested, 'constructor'), false, entry);
      assert.equal(Object.hasOwn(nested.nested, 'prototype'), false, entry);
      assert.equal({}.isAdmin, undefined, entry);
    }
  `);
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

test("configuration consumers retain cloning, concatenation, replacement and all", () => {
  const result = runConsumer(`
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import { pathToFileURL } from 'node:url';
    import { resolve } from 'node:path';
    for (const entry of ['ultracite', 'shadcn', '@shadcn/registry']) {
      const require = createRequire(resolve('node_modules', entry, 'package.json'));
      const { default: merge } = await import(pathToFileURL(require.resolve('deepmerge')));
      const target = { theme: { colors: { primary: 'blue' } }, plugins: [{ name: 'old' }] };
      const source = { theme: { colors: { secondary: 'green' } }, plugins: [{ name: 'new' }] };
      const output = merge(target, source);
      assert.deepEqual(output, { theme: { colors: { primary: 'blue', secondary: 'green' } }, plugins: [{ name: 'old' }, { name: 'new' }] });
      output.plugins[0].name = 'changed';
      assert.equal(target.plugins[0].name, 'old');
      assert.deepEqual(merge(target, source, { arrayMerge: (_old, next) => next }).plugins, [{ name: 'new' }]);
      assert.deepEqual(merge.all([['react'], ['react', 'zod']]), ['react', 'react', 'zod']);
      assert.deepEqual(merge.all([]), {});
      const symbol = Symbol('config');
      assert.equal(merge({}, { [symbol]: 'value' })[symbol], 'value');
      const date = new Date(0);
      assert.equal(merge({}, { date }).date, date);
    }
  `);
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

test.each(["download", "missing", "listing", "password"])(
  "get-uri preserves FTP behavior and rejects adverse inputs: %s",
  (scenario) => {
    const result = runConsumer(
      String.raw`import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const scenario = ${JSON.stringify(scenario)};
const require = createRequire(resolve(root, 'package.json'));
const { getUri } = await import(pathToFileURL(require.resolve('get-uri')));
const sockets = new Set();
const commands = [];
let dataSocket;
const track = socket => { sockets.add(socket); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); return socket; };
const data = net.createServer(socket => { dataSocket = track(socket); });
const control = net.createServer(socket => {
  track(socket).setEncoding('utf8');
  socket.write('220 fixture ready\r\n');
  let buffer = '';
  socket.on('data', chunk => {
    buffer += chunk;
    while (buffer.includes('\r\n')) {
      const end = buffer.indexOf('\r\n');
      const line = buffer.slice(0,end); buffer = buffer.slice(end+2); commands.push(line);
      const command = line.split(' ')[0];
      const reply = text => socket.write(text + '\r\n');
      switch(command) {
        case 'USER': reply('331 Password required'); break;
        case 'PASS': reply('230 Logged in'); break;
        case 'FEAT': reply('211-Features\r\n MLST type*;size*;modify*;\r\n211 End'); break;
        case 'MDTM': reply(scenario === 'listing' ? '500 Unsupported' : scenario === 'missing' ? '550 Not found' : '213 20260101000000'); break;
        case 'EPSV': reply('229 Entering Extended Passive Mode (|||' + data.address().port + '|)'); break;
        case 'MLSD': case 'LIST':
          reply('150 Listing');
          dataSocket.end('type=file;size=7;modify=20260101000000;__proto__=bad; fixture.pac\r\n');
          reply('226 Listing complete'); break;
        case 'RETR': reply('150 Download'); dataSocket.end('fixture'); reply('226 Transfer complete'); break;
        case 'QUIT': reply('221 Bye'); socket.end(); break;
        default: reply('200 OK');
      }
    }
  });
});
try {
  for (const server of [data, control]) { server.listen(0,'127.0.0.1'); await once(server,'listening'); }
  const password = scenario === 'password' ? 'bad%0Acommand' : 'secret';
  const url = 'ftp://user:' + password + '@127.0.0.1:' + control.address().port + '/fixture.pac';
  if (scenario === 'password') {
    await assert.rejects(getUri(url), /CR|LF|control|line|invalid/i);
    assert.equal(commands.some(line => line.startsWith('PASS ')), false);
  } else if (scenario === 'missing') {
    await assert.rejects(getUri(url), error => error.code === 'ENOTFOUND');
  } else {
    const stream = await getUri(url);
    let body = '';
    for await (const chunk of stream) body += chunk;
    assert.equal(body, 'fixture');
    assert.equal(stream.lastModified.toISOString(), '2026-01-01T00:00:00.000Z');
    if (scenario === 'download') await assert.rejects(getUri(url, {cache:stream}), error => error.code === 'ENOTMODIFIED');
    assert.ok(commands.some(line => line === 'RETR /fixture.pac'));
    if (scenario === 'listing') assert.ok(commands.some(line => /^(MLSD|LIST)/.test(line)));
  }
  console.log('PASS get-uri FTP:',scenario);
} finally {
  for (const socket of sockets) socket.destroy();
  await Promise.all([data,control].map(server => new Promise((resolve,reject) => server.close(error => error ? reject(error) : resolve()))));
}
`
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
  }
);

test("real registry APIs merge local items and replace Tailwind theme arrays", () => {
  const result = runConsumer(`
    import assert from 'node:assert/strict';
    import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    import { createConfig } from '@shadcn/registry/internal/get-config';
    import { transformTailwindConfig } from '@shadcn/registry/internal/updaters/update-tailwind-config';
    import { resolveRegistryItems } from '@shadcn/registry';
    const config = createConfig({ tailwind: { baseColor: 'blue' }, aliases: { utils: '@/helpers' } });
    assert.equal(config.tailwind.baseColor, 'blue');
    assert.equal(config.aliases.utils, '@/helpers');
    assert.equal(config.tsx, true);
    const code = await transformTailwindConfig('export default { content: ["src/**/*.tsx"], theme: { extend: { fontFamily: { sans: ["old"] }, colors: { old: "red" } } } };',
      { theme: { extend: { fontFamily: { sans: ['new'] }, colors: { added: 'blue' } } } }, config);
    const { default: transformed } = await import('data:text/javascript,' + encodeURIComponent(code));
    assert.deepEqual(transformed.theme.extend.fontFamily.sans, ['new']);
    assert.deepEqual(transformed.theme.extend.colors, {old: 'red', added: 'blue'});
    const directory = mkdtempSync(join(tmpdir(), 'querylane-registry-'));
    try {
      const paths = ['one', 'two'].map((name) => {
        const file = join(directory, name + '.json');
        writeFileSync(file, JSON.stringify({ name, type: 'registry:ui', dependencies: [name],
          cssVars: { light: { [name]: name } }, tailwind: { config: { content: [name] } } }));
        return file;
      });
      const result = await resolveRegistryItems(paths, {config});
      assert.deepEqual(result.dependencies, ['one', 'two']);
      assert.deepEqual(result.tailwind.config.content, ['one', 'two']);
      assert.deepEqual(result.cssVars.light, {one: 'one', two: 'two'});
    } finally { rmSync(directory, {recursive: true}); }
  `);
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

test("ultracite CLI preserves existing nested editor configuration", () => {
  const result = runConsumer(`
    import assert from 'node:assert/strict';
    import { spawnSync } from 'node:child_process';
    import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { join, resolve } from 'node:path';
    const directory = mkdtempSync(join(tmpdir(), 'querylane-ultracite-'));
    try {
      writeFileSync(join(directory, 'package.json'), JSON.stringify({name:'fixture',private:true,version:'1.0.0',devDependencies:{'@biomejs/biome':'2.6.7',ultracite:'8.2.1'}}));
      mkdirSync(join(directory, '.vscode'));
      writeFileSync(join(directory, '.vscode/settings.json'), JSON.stringify({'custom.setting':true,'editor.codeActionsOnSave':{'custom':'explicit'}}));
      const result = spawnSync(process.execPath, [resolve('node_modules/ultracite/dist/index.js'), 'init', '--pm', 'bun', '--linter', 'biome', '--editors', 'vscode', '--frameworks', 'react', '--skip-install', '--yes', '--quiet'], {cwd:directory,encoding:'utf8',timeout:10000});
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const settings = JSON.parse(readFileSync(join(directory, '.vscode/settings.json'), 'utf8'));
      assert.equal(settings['custom.setting'], true);
      assert.deepEqual(settings['editor.codeActionsOnSave'], {custom:'explicit','source.fixAll.biome':'explicit','source.organizeImports.biome':'explicit'});
      const config = JSON.parse(readFileSync(join(directory, 'biome.jsonc'), 'utf8'));
      assert.deepEqual(config.extends, ['ultracite/biome/core', 'ultracite/biome/react']);
    } finally { rmSync(directory, {recursive:true}); }
  `);
  expect(result.status, result.stdout + result.stderr).toBe(0);
});

test("shadcn ts-morph glob selection and source transformations remain compatible", () => {
  const result = runConsumer(`
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const owner = createRequire(resolve('node_modules/shadcn/package.json'));
const {Project} = owner('ts-morph');
const project = new Project({useInMemoryFileSystem:true});
for (const file of ['/src/app.tsx','/src/nested/page.tsx','/src/nested/page.test.tsx','/src/config.ts','/src/.hidden.ts','/other/out.ts']) project.createSourceFile(file, 'export const value = 1;');
const paths = patterns => project.getSourceFiles(patterns).map(file=>file.getFilePath()).sort();
assert.deepEqual(paths(['/src/**/*.{ts,tsx}','!/src/**/*.test.tsx']), ['/src/app.tsx','/src/config.ts','/src/nested/page.tsx']);
assert.deepEqual(paths('/src/**/+(app|page).tsx'), ['/src/app.tsx','/src/nested/page.tsx']);
assert.deepEqual(paths('/src/**/*.ts'), ['/src/config.ts']);
assert.deepEqual(paths('/src/no-*.tsx'), []);
assert.deepEqual(paths('/src/' + '**/../'.repeat(16) + '*.tsx'), []);
const file=project.getSourceFileOrThrow('/src/app.tsx'); file.addImportDeclaration({moduleSpecifier:'react',namedImports:['useState']});
assert.match(file.getFullText(), /import { useState } from "react"/);
console.log('PASS real ts-morph glob selection + source transform');

`);
  expect(result.status, result.stdout + result.stderr).toBe(0);
});
